-- Tweaked: database schema snapshot (reference).
-- Taken from the live Supabase project on 2026-11-05. It documents exactly what the app relies on
-- and can recreate the database on a fresh project. Run it in the Supabase SQL editor.
--
-- Rules the design enforces:
--   * every row belongs to one user and Row Level Security lets only that user see it
--   * recipe versions are immutable (a trigger refuses updates); changes always create a new version
--   * multi-step writes go through functions, so they are all-or-nothing

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  preferences jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  display_name text check (display_name is null or length(display_name) between 1 and 60)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  source_type text not null default 'own' check (source_type in ('reel', 'link', 'own', 'person')),
  source_url text,
  source_note text,
  servings integer check (servings is null or servings > 0),
  tags text[] not null default '{}',
  bring_from_home boolean not null default false,
  favorite boolean not null default false,
  current_version_id uuid,
  cooked_count integer not null default 0,
  last_cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  version_number integer not null,
  is_original boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  change_note text,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_number)
);

alter table public.recipes
  add constraint recipes_current_version_fk foreign key (current_version_id) references public.recipe_versions (id) on delete set null;

create table public.cook_logs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  version_id uuid references public.recipe_versions (id) on delete set null,
  cooked_at timestamptz not null default now(),
  tweak_note text,
  photo_path text
);

-- Daily counter for the paid AI features. Only take_ai_credit() writes to it.
create table public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  used integer not null default 0,
  primary key (user_id, day)
);

create index recipes_user_idx on public.recipes (user_id, updated_at desc);
create index versions_recipe_idx on public.recipe_versions (recipe_id, version_number);
create index cook_logs_recipe_idx on public.cook_logs (recipe_id, cooked_at desc);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.cook_logs enable row level security;
alter table public.ai_usage enable row level security;

create policy "own profile" on public.profiles for select using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- People may change only these profile columns:
grant update (preferences, onboarded_at, display_name) on public.profiles to authenticated;

create policy "own recipes" on public.recipes for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own versions select" on public.recipe_versions for select using (user_id = (select auth.uid()));
create policy "own versions insert" on public.recipe_versions for insert
  with check (user_id = (select auth.uid()) and exists (select 1 from public.recipes r where r.id = recipe_versions.recipe_id and r.user_id = (select auth.uid())));
create policy "own versions delete" on public.recipe_versions for delete using (user_id = (select auth.uid()));
-- (no update policy: versions are immutable)

create policy "own cook logs" on public.cook_logs for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own ai usage" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- ---------- private photo storage ----------
insert into storage.buckets (id, name, public) values ('dish-photos', 'dish-photos', false) on conflict do nothing;
create policy "own dish photos read" on storage.objects for select
  using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own dish photos insert" on storage.objects for insert
  with check (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own dish photos delete" on storage.objects for delete
  using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- functions ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path to '' as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.block_version_update() returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception 'recipe_versions are immutable; create a new version instead';
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create or replace function public.create_recipe(p_title text, p_source_type text, p_source_url text, p_source_note text, p_servings integer, p_tags text[], p_bring boolean, p_ingredients jsonb, p_steps jsonb)
returns uuid language plpgsql set search_path to '' as $$
declare rid uuid; vid uuid;
begin
  insert into public.recipes (title, source_type, source_url, source_note, servings, tags, bring_from_home)
  values (p_title, coalesce(p_source_type,'own'), p_source_url, p_source_note, p_servings, coalesce(p_tags,'{}'), coalesce(p_bring,false))
  returning id into rid;
  insert into public.recipe_versions (recipe_id, version_number, is_original, ingredients, steps)
  values (rid, 1, true, coalesce(p_ingredients,'[]'), coalesce(p_steps,'[]'))
  returning id into vid;
  update public.recipes set current_version_id = vid where id = rid;
  return rid;
end $$;

create or replace function public.add_version(p_recipe uuid, p_ingredients jsonb, p_steps jsonb, p_note text)
returns uuid language plpgsql set search_path to '' as $$
declare vid uuid; n int;
begin
  perform 1 from public.recipes where id = p_recipe for update;
  if not found then raise exception 'recipe not found'; end if;
  select coalesce(max(version_number),0)+1 into n from public.recipe_versions where recipe_id = p_recipe;
  insert into public.recipe_versions (recipe_id, version_number, is_original, ingredients, steps, change_note)
  values (p_recipe, n, false, p_ingredients, p_steps, p_note) returning id into vid;
  update public.recipes set current_version_id = vid where id = p_recipe;
  return vid;
end $$;

create or replace function public.set_current_version(p_recipe uuid, p_version uuid)
returns uuid language plpgsql set search_path to '' as $$
declare src public.recipe_versions;
begin
  select * into src from public.recipe_versions where id = p_version and recipe_id = p_recipe;
  if not found then raise exception 'version not found'; end if;
  return public.add_version(p_recipe, src.ingredients, src.steps, 'Rolled back to v' || src.version_number);
end $$;

create or replace function public.log_cook(p_recipe uuid, p_note text, p_photo text default null)
returns uuid language plpgsql set search_path to '' as $$
declare lid uuid; cur uuid;
begin
  select current_version_id into cur from public.recipes where id = p_recipe for update;
  if not found then raise exception 'recipe not found'; end if;
  insert into public.cook_logs (recipe_id, version_id, tweak_note, photo_path)
  values (p_recipe, cur, nullif(trim(coalesce(p_note,'')),''), p_photo) returning id into lid;
  update public.recipes set cooked_count = cooked_count + 1, last_cooked_at = now() where id = p_recipe;
  return lid;
end $$;

-- Spend one AI credit for today. Returns credits left, or -1 when the daily limit is reached.
create or replace function public.take_ai_credit(p_limit int default 20)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_used int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  p_limit := least(greatest(p_limit, 1), 100);
  insert into public.ai_usage (user_id, day, used) values (v_uid, current_date, 0) on conflict (user_id, day) do nothing;
  update public.ai_usage set used = used + 1 where user_id = v_uid and day = current_date and used < p_limit returning used into v_used;
  if v_used is null then return -1; end if;
  return p_limit - v_used;
end $$;

-- Delete the caller's account. Everything they own goes with it through the ON DELETE CASCADE chain.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path to 'public', 'auth' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.take_ai_credit(int) from public, anon;
grant execute on function public.take_ai_credit(int) to authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- triggers ----------
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger recipe_versions_immutable before update on public.recipe_versions for each row execute function public.block_version_update();
create trigger recipes_touch before update on public.recipes for each row execute function public.touch_updated_at();


-- ---------- sharing (added 2026-11-06) ----------
-- Private share links. A link is a random token; only its hash is stored, along with a frozen copy of the
-- recipe. Visitors never read this table: they use peek_share / open_share, which hand out one recipe.
create table public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  kind text not null check (kind in ('once', 'open')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  claimed_at timestamptz,
  claim_hash text,
  views integer not null default 0,
  revoked_at timestamptz
);
create index recipe_shares_recipe_idx on public.recipe_shares (recipe_id, created_at desc);
create index recipe_shares_owner_idx on public.recipe_shares (owner_id, created_at desc);
alter table public.recipe_shares enable row level security;
create policy "owners see their links" on public.recipe_shares for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners revoke their links" on public.recipe_shares for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.recipe_shares from anon, authenticated;
grant select (id, recipe_id, kind, created_at, expires_at, claimed_at, views, revoked_at) on public.recipe_shares to authenticated;
grant update (revoked_at) on public.recipe_shares to authenticated;
-- Functions create_share, share_state, peek_share and open_share: see the 'recipe_sharing' migration in the Supabase project.
-- kind 'once': the first browser to open it claims it (claim_hash); only that browser can reopen it. kind 'open': anyone, until it expires.

-- ---------- step-timer push (added 2026-11-06) ----------
-- push_subscriptions: one row per phone/browser that allowed notifications. cook_timers: a timer booked to ring.
-- push_config holds the push keys and cron secret (server only: no policies, no grants). The pg_cron job
-- 'fire-cook-timers' calls the fire-timers edge function every 10 seconds, only when a timer is about to ring.
-- Full SQL: the 'cook_timer_push' migration in the Supabase project; function source: supabase/functions/fire-timers.

-- ---------------------------------------------------------------------------
-- Synced shopping list, star rating and chosen cover photo (migration shopping_sync_rating_photo)
-- ---------------------------------------------------------------------------
create table public.shopping_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  done boolean not null default false,
  from_label text check (from_label is null or char_length(from_label) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_items_user_idx on public.shopping_items (user_id);
alter table public.shopping_items enable row level security;
create policy "own shopping items" on public.shopping_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.recipes
  add column rating smallint check (rating is null or rating between 1 and 5),
  add column photo_path text check (photo_path is null or char_length(photo_path) <= 300);
