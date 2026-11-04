import { cuisineOf } from './prefs'
import { inferCategory, urlDishId, type Dish } from './discover'
import { supabase } from './supabase'

/** A recipe read from a web page by our server (see api/import.ts). */
export type WebRecipe = {
  title: string
  image: string | null
  ingredients: string[]
  steps: string[]
  minutes: number | null
  servings: number | null
  cuisine: string | null
  category: string | null
  site: string
  url: string
}

export type WebResult = { title: string; url: string; site: string }

/** Failure with a short, user-friendly message and a code the screens can react to. */
export class WebError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new WebError('auth', 'Please sign in again.')
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new WebError('offline', "Can't reach the internet right now.")
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T
  if (!res.ok) throw new WebError(json.error ?? 'server', json.message ?? 'Something went wrong. Try again.')
  return json
}

export async function importUrl(url: string): Promise<{ recipe: WebRecipe; via: 'page' | 'ai' }> {
  return post('/api/import', { url })
}

export async function webSearch(q: string): Promise<{ results: WebResult[]; creditsLeft: number }> {
  return post('/api/websearch', { q })
}

const KNOWN_CATEGORIES = ['Chicken', 'Beef', 'Pork', 'Seafood', 'Pasta', 'Vegetarian', 'Breakfast', 'Dessert', 'Side', 'Drink']

/** Turn a recipe read from the web into the app's Dish shape. */
export function recipeToDish(r: WebRecipe): Dish {
  // Sites often list several cuisines ("Asian, Filipino"): use the first one we know.
  const cuisine = (r.cuisine ?? '').split(/[,/]/).map((c) => cuisineOf(c.trim().replace(/ recipes?$/i, ''))).find(Boolean)
  const given = KNOWN_CATEGORIES.find((c) => c.toLowerCase() === (r.category ?? '').toLowerCase())
  return {
    id: urlDishId(r.url),
    name: r.title,
    thumb: r.image ?? '',
    category: given ?? inferCategory({ name: r.title, tags: r.ingredients.slice(0, 4), mealType: [r.category ?? ''] }),
    cuisine: cuisine?.label ?? (r.cuisine ?? '').split(',')[0].trim(),
    cuisineId: cuisine?.id ?? null,
    ingredients: r.ingredients.map((name) => ({ name, measure: '' })),
    steps: r.steps,
    source: r.url,
    youtube: null,
    minutes: r.minutes,
  }
}

/** Read a page and return it as a dish (also used when a saved link is opened again). */
export async function importDish(url: string): Promise<Dish> {
  const { recipe } = await importUrl(url)
  return recipeToDish(recipe)
}
