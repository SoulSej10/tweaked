import { AVOID, CUISINES, KINDS, cuisineOf, type Cuisine, type Effort, type Preferences } from './prefs'
import { parseStepLine } from './parse'
import type { Ingredient, Step } from './types'

/**
 * Three open recipe sources, all free and callable straight from the browser:
 *  - TheMealDB (main)      ids are plain numbers, e.g. "52772"
 *  - DummyJSON recipes     ids look like "dj-5" (50 recipes, adds Korean/Pakistani/Lebanese and more)
 *  - TheCocktailDB         ids look like "cd-11007" (non-alcoholic drinks only)
 * If the main source fails or has too little, the others fill in.
 */
const MEAL = 'https://www.themealdb.com/api/json/v1/1'
const DUMMY = 'https://dummyjson.com/recipes'
const DRINK = 'https://www.thecocktaildb.com/api/json/v1/1'

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
  minutes: number | null
}

export type Stub = { id: string; name: string; thumb: string }

type Raw = Record<string, string | null>

// ---------- network + caches ----------

const inflight = new Map<string, Promise<unknown>>()

function getJson<T>(url: string): Promise<T> {
  let p = inflight.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Recipe source returned ${r.status}`)
      return r.json()
    })
    inflight.set(url, p)
    p.catch(() => inflight.delete(url))
  }
  return p as Promise<T>
}

const LS = 'tweaked.dish.v3.'
const MAX_CACHED = 400

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
    if (Math.random() < 0.05) pruneCache()
  } catch {
    pruneCache(true)
  }
}

/** Keep the offline dish cache from growing without limit. */
function pruneCache(force = false) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS))
    if (force || keys.length > MAX_CACHED) keys.slice(0, Math.max(0, keys.length - Math.floor(MAX_CACHED / 2))).forEach((k) => localStorage.removeItem(k))
    Object.keys(localStorage).filter((k) => k.startsWith('tweaked.dish.v2.')).forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable: fine */
  }
}

/** Thumbnail URL at a sensible size (TheMealDB serves /small /medium /large variants). */
export function thumbUrl(d: Pick<Dish, 'thumb'>, size: 'small' | 'medium' | 'large'): string {
  if (!d.thumb) return ''
  return d.thumb.includes('themealdb.com') ? `${d.thumb}/${size}` : d.thumb
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

function mealToDish(m: Raw): Dish {
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
    minutes: null,
  }
}

type DummyRaw = {
  id: number
  name: string
  ingredients: string[]
  instructions: string[]
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  cuisine?: string
  tags?: string[]
  image?: string
  mealType?: string[]
}

/** DummyJSON has no category field: infer one so "chicken", "dessert" etc. still work. */
function inferCategory(r: DummyRaw): string {
  const text = `${r.name} ${(r.tags ?? []).join(' ')}`.toLowerCase()
  const meal = (r.mealType ?? []).join(' ').toLowerCase()
  if (/beverage|smoothie|cocktail|drink|lemonade|juice/.test(meal + ' ' + text)) return 'Drink'
  if (meal.includes('dessert') || /cake|cookie|pie|pudding|brownie|ice cream|tart/.test(text)) return 'Dessert'
  if (meal.includes('breakfast')) return 'Breakfast'
  if (/pasta|spaghetti|noodle|lasagna|fettuccine|ramen/.test(text)) return 'Pasta'
  if (/chicken/.test(text)) return 'Chicken'
  if (/beef|steak|pork|lamb|bacon|sausage/.test(text)) return 'Beef'
  if (/shrimp|prawn|salmon|fish|tuna|seafood|crab|cod/.test(text)) return 'Seafood'
  if (/vegetarian|vegan|tofu|salad|veggie|lentil/.test(text)) return 'Vegetarian'
  if (meal.includes('side') || meal.includes('appetizer') || meal.includes('snack')) return 'Side'
  return 'Miscellaneous'
}

function dummyToDish(r: DummyRaw): Dish {
  const known = cuisineOf(r.cuisine)
  return {
    id: `dj-${r.id}`,
    name: r.name.trim(),
    thumb: r.image ?? '',
    category: inferCategory(r),
    cuisine: known?.label ?? r.cuisine ?? '',
    cuisineId: known?.id ?? null,
    ingredients: r.ingredients.map((name) => ({ name: name.trim(), measure: '' })),
    steps: r.instructions.map((s) => s.trim()).filter(Boolean),
    source: `${DUMMY}/${r.id}`,
    youtube: null,
    minutes: (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0) || null,
  }
}

function drinkToDish(m: Raw): Dish {
  const ingredients: Dish['ingredients'] = []
  for (let i = 1; i <= 15; i++) {
    const name = (m[`strIngredient${i}`] ?? '').trim()
    if (name) ingredients.push({ name, measure: (m[`strMeasure${i}`] ?? '').trim() })
  }
  return {
    id: `cd-${m.idDrink}`,
    name: String(m.strDrink).trim(),
    thumb: String(m.strDrinkThumb ?? ''),
    category: 'Drink',
    cuisine: 'Drinks',
    cuisineId: null,
    ingredients,
    steps: cleanSteps(m.strInstructions ?? ''),
    source: `https://www.thecocktaildb.com/drink/${m.idDrink}`,
    youtube: null,
    minutes: null,
  }
}

// ---------- API ----------

export async function lookup(id: string): Promise<Dish | null> {
  const hit = readCached(id)
  if (hit) return hit
  let d: Dish | null
  if (id.startsWith('dj-')) {
    const r = await getJson<DummyRaw>(`${DUMMY}/${id.slice(3)}`)
    d = r?.name ? dummyToDish(r) : null
  } else if (id.startsWith('cd-')) {
    const res = await getJson<{ drinks: Raw[] | null }>(`${DRINK}/lookup.php?i=${id.slice(3)}`)
    d = res.drinks?.[0] ? drinkToDish(res.drinks[0]) : null
  } else {
    const res = await getJson<{ meals: Raw[] | null }>(`${MEAL}/lookup.php?i=${encodeURIComponent(id)}`)
    d = res.meals?.[0] ? mealToDish(res.meals[0]) : null
  }
  if (d) writeCached(d)
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

function mealStubs(res: { meals: Raw[] | null }): Stub[] {
  return (res.meals ?? []).map((m) => ({ id: String(m.idMeal), name: String(m.strMeal), thumb: String(m.strMealThumb ?? '') }))
}

export async function listByCuisine(c: Cuisine): Promise<Stub[]> {
  const all = await Promise.all(
    c.areas.map((a) => getJson<{ meals: Raw[] | null }>(`${MEAL}/filter.php?a=${encodeURIComponent(a)}`).then(mealStubs).catch(() => [])),
  )
  const seen = new Set<string>()
  return all.flat().filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

export async function listByCategory(cat: string): Promise<Stub[]> {
  if (cat === 'Drink') {
    const res = await getJson<{ drinks: Raw[] | null }>(`${DRINK}/filter.php?a=Non_Alcoholic`).catch(() => ({ drinks: null }))
    return (res.drinks ?? []).map((m) => ({ id: `cd-${m.idDrink}`, name: String(m.strDrink), thumb: String(m.strDrinkThumb ?? '') }))
  }
  return getJson<{ meals: Raw[] | null }>(`${MEAL}/filter.php?c=${encodeURIComponent(cat)}`).then(mealStubs).catch(() => [])
}

let dummyAllPromise: Promise<Dish[]> | null = null
/** All 50 DummyJSON recipes in one request. Resolves to [] if the source is unreachable. */
export function dummyAll(): Promise<Dish[]> {
  if (!dummyAllPromise) {
    dummyAllPromise = getJson<{ recipes: DummyRaw[] }>(`${DUMMY}?limit=0`)
      .then((r) => {
        const dishes = r.recipes.map(dummyToDish)
        dishes.forEach(writeCached)
        return dishes
      })
      .catch(() => {
        dummyAllPromise = null
        return []
      })
  }
  return dummyAllPromise
}

export async function searchDishes(q: string): Promise<Dish[]> {
  const term = q.trim().toLowerCase()
  const [meals, dummy] = await Promise.all([
    getJson<{ meals: Raw[] | null }>(`${MEAL}/search.php?s=${encodeURIComponent(term)}`)
      .then((r) => (r.meals ?? []).map(mealToDish))
      .catch(() => [] as Dish[]),
    dummyAll().then((all) => all.filter((d) => `${d.name} ${d.cuisine} ${d.category} ${d.ingredients.map((i) => i.name).join(' ')}`.toLowerCase().includes(term))),
  ])
  const dishes = [...dummy, ...meals]
  meals.forEach(writeCached)
  return dishes
}

export async function randomDishes(n: number): Promise<Dish[]> {
  const got = await Promise.all(
    Array.from({ length: n }, () =>
      fetch(`${MEAL}/random.php`)
        .then((r) => r.json() as Promise<{ meals: Raw[] | null }>)
        .then((r) => (r.meals?.[0] ? mealToDish(r.meals[0]) : null))
        .catch(() => null),
    ),
  )
  const extra = (await dummyAll()).sort(() => Math.random() - 0.5).slice(0, Math.max(4, Math.floor(n / 3)))
  const seen = new Set<string>()
  return [...got.filter((d): d is Dish => d !== null), ...extra].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

// ---------- "not overly fancy" + preferences ----------

export function effortLimit(e: Effort): number {
  return e === 'quick' ? 7 : e === 'easy' ? 10 : 14
}

export function isSimple(d: Dish, e: Effort): boolean {
  return d.ingredients.length > 0 && d.ingredients.length <= effortLimit(e) && d.steps.length > 0 && d.steps.length <= 12
}

/** Short words must match whole words ("ham" must not hide "chamomile"); longer ones match as prefixes ("anchov"). */
function mentions(text: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(word.length <= 4 ? `\\b${esc}s?\\b` : `\\b${esc}`, 'i').test(text)
}

export function conflicts(d: Dish, avoid: string[]): boolean {
  // The drinks shelf promises "no alcohol", so that rule always applies to it.
  const rules = d.category === 'Drink' && !avoid.includes('alcohol') ? [...avoid, 'alcohol'] : avoid
  if (rules.length === 0) return false
  const text = `${d.name} ${d.ingredients.map((i) => i.name).join(' ')}`
  return AVOID.filter((a) => rules.includes(a.id)).some((a) => a.words.some((w) => mentions(text, w)))
}

export function dishUrl(d: Dish): string {
  if (d.id.startsWith('dj-')) return `${DUMMY}/${d.id.slice(3)}`
  if (d.id.startsWith('cd-')) return `https://www.thecocktaildb.com/drink/${d.id.slice(3)}`
  return `https://www.themealdb.com/meal/${d.id}`
}

/** Which dish id (if any) a saved recipe's source link points at. */
export function dishIdFromUrl(url: string | null): string | null {
  if (!url) return null
  const meal = url.match(/themealdb\.com\/meal\/(\d+)/)
  if (meal) return meal[1]
  const dummy = url.match(/dummyjson\.com\/recipes\/(\d+)/)
  if (dummy) return `dj-${dummy[1]}`
  const drink = url.match(/thecocktaildb\.com\/drink\/(\d+)/)
  return drink ? `cd-${drink[1]}` : null
}

const UNIT_ALIASES: Record<string, string> = {
  tbs: 'tbsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tblsp: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  cup: 'cup', cups: 'cup', ounce: 'oz', ounces: 'oz', oz: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l', clove: 'cloves', cloves: 'cloves',
}

/** "1 tbs" -> 1 tbsp, "50ml/2fl oz" -> 50 ml, "Pinch" -> note only. Never glued onto the name. */
export function measureToParts(measure: string): Pick<Ingredient, 'amount' | 'unit' | 'note'> {
  const m = measure.trim().split('/').length > 2 || /^\d+\s*\d*\/\d+/.test(measure.trim()) ? measure.trim() : measure.trim().split('/')[0]
  const match = m.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾])\s*([a-zA-Z]+)?\.?\s*(.*)$/)
  if (!match) return { amount: '', unit: '', note: measure.trim() }
  const [, amount, word = '', rest] = match
  const unit = UNIT_ALIASES[word.toLowerCase()]
  if (unit) return { amount: amount.replace(',', '.'), unit, note: rest.trim() }
  // Not a unit ("1 large", "2 chopped"): keep the number, move the word into the note.
  return { amount: amount.replace(',', '.'), unit: '', note: `${word} ${rest}`.trim() }
}

export function dishToRecipe(d: Dish) {
  const ingredients: Ingredient[] = d.ingredients.map((i) => ({ name: i.name, ...measureToParts(i.measure) }))
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
const EXPLORE = ['thai', 'japanese', 'mexican', 'greek', 'indian', 'spanish', 'vietnamese', 'italian', 'turkish', 'korean', 'lebanese', 'pakistani', 'moroccan']
const ALL_CATEGORIES = KINDS.flatMap((k) => k.categories as readonly string[])

export async function buildFeed(prefs: Preferences, history: History, seed: number): Promise<Section[]> {
  const rnd = rngFrom(seed)
  const kindCats = (ids: string[]) => KINDS.filter((k) => ids.includes(k.id)).flatMap((k) => k.categories as readonly string[])
  const prefCats = new Set(kindCats(prefs.kinds).map((c) => c.toLowerCase()))

  // Who and what to sample from: stated taste first, then what the user actually cooks.
  const cuisineIds = shuffled([...new Set([...prefs.cuisines, ...topKeys(history.cuisines, 3)])], rnd).slice(0, 4)
  const catNames = shuffled(
    [
      ...new Set([
        ...kindCats(prefs.kinds.length ? prefs.kinds : DEFAULT_KINDS),
        ...topKeys(history.categories, 2).map((c) => ALL_CATEGORIES.find((x) => x.toLowerCase() === c) ?? ''),
      ]),
    ].filter(Boolean),
    rnd,
  ).slice(0, 3)
  const exploreId = shuffled(EXPLORE.filter((id) => !prefs.cuisines.includes(id) && !(id in history.cuisines)), rnd)[0]

  const cuisines = cuisineIds.map((id) => CUISINES.find((c) => c.id === id)).filter((c): c is Cuisine => Boolean(c))
  const explore = CUISINES.find((c) => c.id === exploreId)

  const [cuisineLists, catLists, sweetList, exploreList, dummy] = await Promise.all([
    Promise.all(cuisines.map((c) => listByCuisine(c))),
    Promise.all(catNames.map((c) => listByCategory(c))),
    listByCategory('Dessert'),
    explore ? listByCuisine(explore) : Promise.resolve([] as Stub[]),
    dummyAll(),
  ])

  const pick = (list: Stub[], n: number) => shuffled(list.filter((s) => !history.savedIds.has(s.id)), rnd).slice(0, n)
  const ids = new Set<string>()
  const add = (list: Stub[], n: number) => pick(list, n).forEach((s) => ids.add(s.id))
  cuisineLists.forEach((l) => add(l, 7))
  catLists.forEach((l) => add(l, 5))
  add(sweetList, 6)
  add(exploreList, 7)

  const fromMeals = await lookupMany([...ids])
  // The backup sources always join the pool; if the main one returned little, they carry the feed.
  const pool = [...fromMeals, ...dummy]
  const ok = pool.filter((d) => isSimple(d, prefs.effort) && !conflicts(d, prefs.avoid) && !history.savedIds.has(d.id))

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
  const solid = scored.filter((d) => d.category !== 'Drink')

  push('picked', 'Picked for you', 'Based on your taste and what you cook', take(solid, 10))
  push('few', 'Short shopping list', 'Six ingredients or fewer', take(solid.filter((d) => d.ingredients.length <= 6), 8))
  push('quick', 'Quick to cook', 'Ready in 30 minutes or less', take(solid.filter((d) => d.minutes !== null && d.minutes <= 30), 8))
  for (const c of cuisines.slice(0, 2)) {
    push(`c-${c.id}`, `${c.flag} ${c.label} favourites`, 'Home-style, nothing fancy', take(solid.filter((d) => d.cuisineId === c.id), 8))
  }
  push('sweet', '🥐 Pastries & sweets', 'For when you want something nice', take(solid.filter((d) => d.category === 'Dessert'), 8))
  if (explore) push('explore', `Try something new: ${explore.flag} ${explore.label}`, 'A little outside your usual', take(solid.filter((d) => d.cuisineId === explore.id), 8))
  for (const cat of catNames.filter((c) => c !== 'Drink')) {
    push(`k-${cat}`, `More ${cat.toLowerCase()} ideas`, 'Easy to start tonight', take(solid.filter((d) => d.category === cat), 8))
  }

  // Drinks: always offered as a light extra, non-alcoholic unless you did not opt out of alcohol.
  const drinkStubs = pick(await listByCategory('Drink'), 8)
  const drinks = (await lookupMany(drinkStubs.map((s) => s.id))).filter((d) => isSimple(d, prefs.effort) && !conflicts(d, prefs.avoid))
  push('drinks', '🥤 Drinks & coolers', 'Refreshing, no alcohol', take(drinks, 8))
  return sections
}
