import { AVOID, CUISINES, KINDS, cuisineOf, type Cuisine, type Effort, type Preferences } from './prefs'
import { parseIngredientLine, parseStepLine } from './parse'
import type { Ingredient, Step } from './types'

const BASE = 'https://www.themealdb.com/api/json/v1/1'

export type Dish = {
  id: string
  name: string
  thumb: string
  category: string
  cuisine: string // display label ("Filipino", or the source's own label if we do not know it)
  cuisineId: string | null
  ingredients: { name: string; measure: string }[]
  steps: string[]
  source: string | null
  youtube: string | null
}

export type Stub = { id: string; name: string; thumb: string }

type Raw = Record<string, string | null>

// ---------- network + caches ----------

const inflight = new Map<string, Promise<unknown>>()

function getJson<T>(path: string): Promise<T> {
  let p = inflight.get(path)
  if (!p) {
    p = fetch(`${BASE}/${path}`).then((r) => {
      if (!r.ok) throw new Error(`Recipe source returned ${r.status}`)
      return r.json()
    })
    inflight.set(path, p)
    p.catch(() => inflight.delete(path))
  }
  return p as Promise<T>
}

const LS = 'tweaked.dish.v2.'
function readCached(id: string): Dish | null {
  try {
    const s = localStorage.getItem(LS + id)
    return s ? (JSON.parse(s) as Dish) : null
  } catch {
    return null
  }
}
function writeCached(d: Dish) {
  try {
    localStorage.setItem(LS + d.id, JSON.stringify(d))
  } catch {
    /* storage full or blocked: fine */
  }
}

// ---------- parsing ----------

const STEP_PREFIX = /^\s*(?:step\s*\d+\s*[:.)-]?|\d+\s*[.)]|\d+\s*\t)\s*/i

export function cleanSteps(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(STEP_PREFIX, '').trim())
    .filter((l) => l.length > 8)
  if (lines.length >= 3) return lines
  // One big paragraph: split into sentences and group them in pairs so each step is readable.
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3)
  if (sentences.length <= 2) return lines.length ? lines : sentences
  const out: string[] = []
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '))
  return out
}

function toDish(m: Raw): Dish {
  const ingredients: Dish['ingredients'] = []
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? '').trim()
    if (name) ingredients.push({ name, measure: (m[`strMeasure${i}`] ?? '').trim() })
  }
  const known = cuisineOf(m.strCountry) ?? cuisineOf(m.strArea)
  return {
    id: String(m.idMeal),
    name: String(m.strMeal).trim(),
    thumb: String(m.strMealThumb ?? ''),
    category: m.strCategory ?? '',
    cuisine: known?.label ?? m.strArea ?? m.strCountry ?? '',
    cuisineId: known?.id ?? null,
    ingredients,
    steps: cleanSteps(m.strInstructions ?? ''),
    source: m.strSource || null,
    youtube: m.strYoutube || null,
  }
}

// ---------- API ----------

export async function lookup(id: string): Promise<Dish | null> {
  const hit = readCached(id)
  if (hit) return hit
  const res = await getJson<{ meals: Raw[] | null }>(`lookup.php?i=${encodeURIComponent(id)}`)
  const m = res.meals?.[0]
  if (!m) return null
  const d = toDish(m)
  writeCached(d)
  return d
}

export async function lookupMany(ids: string[], concurrency = 8): Promise<Dish[]> {
  const out: (Dish | null)[] = new Array(ids.length).fill(null)
  let next = 0
  async function worker() {
    while (next < ids.length) {
      const i = next++
      out[i] = await lookup(ids[i]).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return out.filter((d): d is Dish => d !== null)
}

function stubs(res: { meals: Raw[] | null }): Stub[] {
  return (res.meals ?? []).map((m) => ({ id: String(m.idMeal), name: String(m.strMeal), thumb: String(m.strMealThumb ?? '') }))
}

export async function listByCuisine(c: Cuisine): Promise<Stub[]> {
  const all = await Promise.all(
    c.areas.map((a) => getJson<{ meals: Raw[] | null }>(`filter.php?a=${encodeURIComponent(a)}`).then(stubs).catch(() => [])),
  )
  const seen = new Set<string>()
  return all.flat().filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

export async function listByCategory(cat: string): Promise<Stub[]> {
  return getJson<{ meals: Raw[] | null }>(`filter.php?c=${encodeURIComponent(cat)}`).then(stubs).catch(() => [])
}

export async function searchDishes(q: string): Promise<Dish[]> {
  const res = await getJson<{ meals: Raw[] | null }>(`search.php?s=${encodeURIComponent(q.trim())}`)
  const dishes = (res.meals ?? []).map(toDish)
  dishes.forEach(writeCached)
  return dishes
}

export async function randomDishes(n: number): Promise<Dish[]> {
  const got = await Promise.all(
    Array.from({ length: n }, () =>
      fetch(`${BASE}/random.php`)
        .then((r) => r.json() as Promise<{ meals: Raw[] | null }>)
        .then((r) => (r.meals?.[0] ? toDish(r.meals[0]) : null))
        .catch(() => null),
    ),
  )
  const seen = new Set<string>()
  return got.filter((d): d is Dish => d !== null && (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

// ---------- "not overly fancy" + preferences ----------

export function effortLimit(e: Effort): number {
  return e === 'quick' ? 7 : e === 'easy' ? 10 : 14
}

export function isSimple(d: Dish, e: Effort): boolean {
  return d.ingredients.length > 0 && d.ingredients.length <= effortLimit(e) && d.steps.length > 0 && d.steps.length <= 12
}

export function conflicts(d: Dish, avoid: string[]): boolean {
  if (avoid.length === 0) return false
  const text = `${d.name} ${d.ingredients.map((i) => i.name).join(' ')}`.toLowerCase()
  return AVOID.filter((a) => avoid.includes(a.id)).some((a) => a.words.some((w) => text.includes(w)))
}

export function dishUrl(d: Dish): string {
  return `https://www.themealdb.com/meal/${d.id}`
}

export function dishToRecipe(d: Dish) {
  const ingredients: Ingredient[] = d.ingredients.map((i) => {
    const parsed = parseIngredientLine(`${i.measure} ${i.name}`.trim())
    return parsed ?? { name: i.name, amount: '', unit: '', note: i.measure }
  })
  const steps: Step[] = d.steps.map((s) => parseStepLine(s) ?? { text: s, timer_seconds: null })
  const tags = [...new Set([d.cuisineId ?? d.cuisine.toLowerCase(), d.category.toLowerCase()].filter(Boolean))]
  return {
    meta: {
      title: d.name,
      source_type: 'link' as const,
      source_url: dishUrl(d),
      source_note: 'from the Discover feed',
      servings: null,
      tags,
      bring_from_home: false,
    },
    ingredients,
    steps,
  }
}

// ---------- the feed ----------

export type History = {
  cuisines: Record<string, number> // cuisine id -> weight (cooked count + 1)
  categories: Record<string, number> // lowercase category -> weight
  savedIds: Set<string> // source dish ids already in the user's library
}

export type Section = { id: string; title: string; subtitle: string; dishes: Dish[] }

function rngFrom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(list: T[], rnd: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const topKeys = (r: Record<string, number>, n: number) =>
  Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)

const DEFAULT_KINDS = ['chicken', 'pasta', 'breakfast']
const EXPLORE = ['thai', 'japanese', 'mexican', 'greek', 'indian', 'spanish', 'vietnamese', 'italian', 'turkish', 'french', 'american', 'moroccan']

export async function buildFeed(prefs: Preferences, history: History, seed: number): Promise<Section[]> {
  const rnd = rngFrom(seed)
  const kindCats = (ids: string[]) => KINDS.filter((k) => ids.includes(k.id)).flatMap((k) => k.categories as readonly string[])
  const prefCats = new Set(kindCats(prefs.kinds).map((c) => c.toLowerCase()))

  // Who and what to sample from: stated taste first, then what the user actually cooks.
  const cuisineIds = shuffled([...new Set([...prefs.cuisines, ...topKeys(history.cuisines, 3)])], rnd).slice(0, 4)
  const catNames = shuffled(
    [...new Set([...kindCats(prefs.kinds.length ? prefs.kinds : DEFAULT_KINDS), ...topKeys(history.categories, 2).map((c) => KINDS.flatMap((k) => k.categories as readonly string[]).find((x) => x.toLowerCase() === c) ?? '')])].filter(Boolean),
    rnd,
  ).slice(0, 3)
  const exploreId = shuffled(EXPLORE.filter((id) => !prefs.cuisines.includes(id) && !(id in history.cuisines)), rnd)[0]

  const cuisines = cuisineIds.map((id) => CUISINES.find((c) => c.id === id)).filter((c): c is Cuisine => Boolean(c))
  const explore = CUISINES.find((c) => c.id === exploreId)

  const [cuisineLists, catLists, sweetList, exploreList] = await Promise.all([
    Promise.all(cuisines.map((c) => listByCuisine(c))),
    Promise.all(catNames.map((c) => listByCategory(c))),
    listByCategory('Dessert'),
    explore ? listByCuisine(explore) : Promise.resolve([] as Stub[]),
  ])

  const pick = (list: Stub[], n: number) => shuffled(list.filter((s) => !history.savedIds.has(s.id)), rnd).slice(0, n)
  const ids = new Set<string>()
  const add = (list: Stub[], n: number) => pick(list, n).forEach((s) => ids.add(s.id))
  cuisineLists.forEach((l) => add(l, 7))
  catLists.forEach((l) => add(l, 5))
  add(sweetList, 6)
  add(exploreList, 7)

  const all = await lookupMany([...ids])
  const ok = all.filter((d) => isSimple(d, prefs.effort) && !conflicts(d, prefs.avoid) && !history.savedIds.has(d.id))

  const maxC = Math.max(1, ...Object.values(history.cuisines))
  const maxK = Math.max(1, ...Object.values(history.categories))
  const score = (d: Dish) =>
    (d.cuisineId && prefs.cuisines.includes(d.cuisineId) ? 3 : 0) +
    (prefCats.has(d.category.toLowerCase()) ? 2 : 0) +
    (d.cuisineId ? (history.cuisines[d.cuisineId] ?? 0) / maxC : 0) * 1.5 +
    ((history.categories[d.category.toLowerCase()] ?? 0) / maxK) * 1.5 +
    (d.ingredients.length <= 6 ? 0.5 : 0) +
    rnd() * 1.5

  const scored = [...ok].sort((a, b) => score(b) - score(a))
  const used = new Set<string>()
  const take = (list: Dish[], n: number) => {
    const fresh = list.filter((d) => !used.has(d.id)).slice(0, n)
    fresh.forEach((d) => used.add(d.id))
    return fresh
  }

  const sections: Section[] = []
  const push = (id: string, title: string, subtitle: string, dishes: Dish[]) => {
    if (dishes.length >= 2) sections.push({ id, title, subtitle, dishes })
  }

  push('picked', 'Picked for you', 'Based on your taste and what you cook', take(scored, 10))
  push('few', 'Short shopping list', 'Six ingredients or fewer', take(scored.filter((d) => d.ingredients.length <= 6), 8))
  for (const c of cuisines.slice(0, 2)) {
    push(`c-${c.id}`, `${c.flag} ${c.label} favourites`, 'Home-style, nothing fancy', take(scored.filter((d) => d.cuisineId === c.id), 8))
  }
  push('sweet', '🥐 Pastries & sweets', 'For when you want something nice', take(scored.filter((d) => d.category === 'Dessert'), 8))
  if (explore) push('explore', `Try something new: ${explore.flag} ${explore.label}`, 'A little outside your usual', take(scored.filter((d) => d.cuisineId === explore.id), 8))
  for (const cat of catNames) {
    push(`k-${cat}`, `More ${cat.toLowerCase()} ideas`, 'Easy to start tonight', take(scored.filter((d) => d.category === cat), 8))
  }
  return sections
}
