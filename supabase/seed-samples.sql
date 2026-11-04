-- Sample recipes for the first account in the project. Run once, after you have signed up.
-- Uses the same functions the app uses, so versions, tweak history and counts are all consistent.
do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  r1 uuid; r2 uuid; r3 uuid;
begin
  if uid is null then raise exception 'Sign up in the app first, then run this seed.'; end if;
  if exists (select 1 from public.recipes where user_id = uid) then
    raise exception 'This account already has recipes; seed skipped.';
  end if;

  -- Run as the user so row-level security and default user_id behave exactly like the app.
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) Chicken adobo: original + two tweaks, cooked three times.
  r1 := public.create_recipe('Chicken adobo', 'person', null, 'from Tita Mel', 4, array['chicken','filipino'], true,
    '[{"name":"chicken thighs","amount":"1","unit":"kg","note":""},{"name":"soy sauce","amount":"1/2","unit":"cup","note":""},{"name":"vinegar","amount":"1/3","unit":"cup","note":""},{"name":"garlic","amount":"6","unit":"cloves","note":"crushed"},{"name":"bay leaves","amount":"3","unit":"","note":""},{"name":"black peppercorns","amount":"1","unit":"tsp","note":""}]',
    '[{"text":"Marinate chicken in soy sauce and garlic for 30 min","timer_seconds":1800},{"text":"Add vinegar, bay leaves and peppercorns; bring to a boil without stirring","timer_seconds":null},{"text":"Simmer covered for 25 min","timer_seconds":1500},{"text":"Uncover and reduce the sauce for 10 min","timer_seconds":600}]');
  perform public.log_cook(r1, null);
  perform public.add_version(r1,
    '[{"name":"chicken thighs","amount":"1","unit":"kg","note":""},{"name":"soy sauce","amount":"1/3","unit":"cup","note":""},{"name":"vinegar","amount":"1/3","unit":"cup","note":""},{"name":"garlic","amount":"6","unit":"cloves","note":"crushed"},{"name":"bay leaves","amount":"3","unit":"","note":""},{"name":"black peppercorns","amount":"1","unit":"tsp","note":""}]',
    '[{"text":"Marinate chicken in soy sauce and garlic for 30 min","timer_seconds":1800},{"text":"Add vinegar, bay leaves and peppercorns; bring to a boil without stirring","timer_seconds":null},{"text":"Simmer covered for 25 min","timer_seconds":1500},{"text":"Uncover and reduce the sauce for 10 min","timer_seconds":600}]',
    'less soy sauce');
  perform public.log_cook(r1, 'less soy sauce, was too salty');
  perform public.add_version(r1,
    '[{"name":"chicken thighs","amount":"1","unit":"kg","note":""},{"name":"soy sauce","amount":"1/3","unit":"cup","note":""},{"name":"vinegar","amount":"1/3","unit":"cup","note":""},{"name":"garlic","amount":"8","unit":"cloves","note":"crushed"},{"name":"bay leaves","amount":"3","unit":"","note":""},{"name":"black peppercorns","amount":"1","unit":"tsp","note":""},{"name":"siling labuyo","amount":"3","unit":"","note":"whole"}]',
    '[{"text":"Marinate chicken in soy sauce and garlic for 30 min","timer_seconds":1800},{"text":"Add vinegar, bay leaves, peppercorns and chili; bring to a boil without stirring","timer_seconds":null},{"text":"Simmer covered for 35 min","timer_seconds":2100},{"text":"Uncover and reduce the sauce for 10 min","timer_seconds":600}]',
    'more garlic, added chili, simmer 10 min longer');
  perform public.log_cook(r1, 'added chili, simmer 10 min longer');

  -- 2) Garlic fried rice: a quick bring-from-home dish, cooked once with no changes.
  r2 := public.create_recipe('Garlic fried rice', 'own', null, null, 2, array['rice','quick'], true,
    '[{"name":"cooked rice","amount":"3","unit":"cups","note":"day-old"},{"name":"garlic","amount":"5","unit":"cloves","note":"minced"},{"name":"egg","amount":"2","unit":"","note":""},{"name":"cooking oil","amount":"2","unit":"tbsp","note":""},{"name":"salt","amount":"","unit":"","note":"to taste"}]',
    '[{"text":"Fry the garlic in oil until golden, about 1 min","timer_seconds":60},{"text":"Add the rice and break up clumps; stir-fry for 3 min","timer_seconds":180},{"text":"Push to the side, scramble the eggs, then mix everything together","timer_seconds":null},{"text":"Season with salt and serve","timer_seconds":null}]');
  perform public.log_cook(r2, null);

  -- 3) Never cooked: a saved reel with only a title and a link.
  r3 := public.create_recipe('Creamy tuna pasta (reel)', 'reel', 'https://www.facebook.com/reel/example', 'saved to try', null, array['pasta'], false, '[]', '[]');

  raise notice 'Seeded 3 sample recipes for user %', uid;
end $$;
