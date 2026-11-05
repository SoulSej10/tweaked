# Tweaked

Your version of every dish. Save recipes, cook them step by step, and Tweaked remembers every change you make.

Live: https://tweaked.vercel.app · Installable as an app on phones and desktops (PWA).

## What it does

- **Cook mode:** one step at a time, big text, per-step timers that stay correct when the phone sleeps, screen stays awake, optional voice notes and a photo when you finish.
- **Tweaks and versions:** note what you changed each time you cook. Recipe versions are never overwritten, so you can compare two versions or roll back.
- **Discover:** about 900 simple dishes bundled in the app (instant, works offline), filtered by your taste quiz and what you cook. Search anything; dishes not in the bundle are searched on Wikibooks Cookbook.
- **Import from the web:** paste any recipe link and the recipe is read from the page. Optional AI web search finds pages for dishes we do not have.
- **Facebook / Instagram / TikTok:** those sites hide posts from other apps. Paste the caption, or on Android use *Share → Tweaked* once the app is installed.
- **Everything else people expect:** favorites, sorting, shopping list, share a recipe, servings scaling and unit conversion, export your cookbook, dark mode, text size, forgot password, Google sign-in, delete account.

## Tech

React 19 + TypeScript + Vite, `react-router`, Supabase (Postgres with Row Level Security, auth, private photo storage), Vercel (hosting and the two functions in `api/`), `vite-plugin-pwa`.

```
src/            the app (pages, components, lib/ for logic)
api/            Vercel functions: /api/import (read a recipe page), /api/websearch (AI web search)
public/         icons, catalog.json (bundled dishes), robots.txt
scripts/        build-catalog.mjs  (re-download the dish catalog)
supabase/       schema.sql (reference snapshot of the database)
```

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the two Supabase values
npm run dev
```

Checks (also run by CI on every push):

```bash
npm run lint && npx tsc -b && npx tsc -p api/tsconfig.json && npx vitest run && npm run build
```

## Setting up a fresh Supabase project

1. Run `supabase/schema.sql` in the SQL editor.
2. **Authentication → URL Configuration:** set *Site URL* to your site and add it (with `/`) to *Redirect URLs*.
3. **Authentication → Providers → Google** (optional): create an OAuth client in Google Cloud Console, add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI, paste the client ID and secret into Supabase. The Google button appears in the app by itself once the provider is on.
4. **Email:** Supabase's built-in email only reaches your own team's addresses and is heavily rate-limited. For real users, add a custom SMTP provider under *Authentication → SMTP Settings*.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | connect to Supabase (public values) |
| `ANTHROPIC_API_KEY` | Vercel only, never in the repo | switches on AI web search and AI page reading |
| `AI_DAILY_LIMIT` | Vercel, optional | AI lookups per user per day (default 20, max 100) |
| `ANTHROPIC_MODEL` | Vercel, optional | override the default model |

## Data sources and credits

Dishes come from [TheMealDB](https://www.themealdb.com), [DummyJSON](https://dummyjson.com/docs/recipes), [TheCocktailDB](https://www.thecocktaildb.com) and [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents) (CC BY-SA). TheMealDB's free key is intended for development and education: use their paid key before a wide public launch. Recipes imported from other websites belong to those sites; the link is always kept. Flag icons: [Twemoji](https://github.com/twitter/twemoji).

## Security notes

- Row Level Security on every table; recipe versions are immutable; `take_ai_credit` and `delete_my_account` are the only privileged functions.
- `/api/*` requires a signed-in user, refuses non-public addresses (checked again at connect time), caps page size and time, and never follows redirects to internal addresses.
- Security headers and a Content Security Policy are set in `vercel.json`.

Planned next: Filipino-language UI, meal planner, push notifications, crash monitoring, your own cover photos, two-factor sign-in, browser end-to-end tests.
