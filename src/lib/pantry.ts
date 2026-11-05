import { normalize, wordMatches } from './fuzzy'

/**
 * "What can I cook with what I have?" Matches a list of things in the kitchen against a dish's
 * ingredients and says what is covered and what is missing. Basics everyone has (salt, pepper,
 * water, cooking oil, ice) are assumed, so they never count against a dish.
 */

/** Quick-add suggestions shown under the pantry box. */
export const COMMON_PANTRY = [
  'egg', 'rice', 'garlic', 'onion', 'chicken', 'tomato', 'potato', 'soy sauce', 'pasta', 'cheese', 'milk', 'flour',
  'butter', 'carrot', 'pork', 'beef', 'bread', 'noodles', 'fish', 'ginger', 'coconut milk', 'banana', 'sugar', 'vinegar',
] as const

const BASICS = new Set(['salt', 'pepper', 'water', 'oil', 'ice'])
/** Words that describe a basic without changing it ("olive oil", "black pepper", "sea salt"). */
const BASIC_MODIFIERS = new Set(['black', 'white', 'ground', 'sea', 'olive', 'vegetable', 'cooking', 'sunflower', 'canola', 'cold', 'hot', 'boiling', 'warm', 'extra', 'virgin', 'fine', 'coarse', 'kosher', 'table', 'freshly', 'cracked', 'plain', 'iced', 'fresh', 'and', 'to', 'taste', 'a', 'pinch', 'of'])
/** Quantities, units and preparation words that say nothing about WHAT the ingredient is. */
const NOISE = new Set([
  'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'pound', 'pounds', 'ounce', 'ounces', 'gram', 'grams', 'clove', 'cloves', 'pinch', 'dash', 'can', 'cans', 'piece', 'pieces', 'slice', 'slices', 'bunch', 'head', 'stalk', 'stalks',
  'large', 'small', 'medium', 'big', 'chopped', 'minced', 'sliced', 'diced', 'crushed', 'grated', 'cubed', 'peeled', 'cooked', 'raw', 'whole', 'optional', 'finely', 'roughly', 'thinly', 'boneless', 'skinless', 'ripe', 'dried', 'frozen', 'for', 'serving', 'garnish', 'the', 'or', 'about', 'some', 'few', 'more', 'extra',
])

/** Words that mean the same kind of thing in a kitchen: "pasta" covers any pasta shape, "cheese" any cheese. */
const GROUPS: string[][] = [
  ['pasta', 'spaghetti', 'penne', 'linguine', 'fettuccine', 'macaroni', 'fusilli', 'rigatoni', 'tagliatelle', 'lasagne', 'lasagna', 'farfalle', 'vermicelli', 'noodle'],
  ['cheese', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'gouda', 'gruyere', 'brie', 'parmigiano', 'halloumi', 'mascarpone'],
  ['onion', 'shallot', 'scallion', 'leek'],
  ['bread', 'baguette', 'loaf', 'toast', 'bun'],
  ['noodle', 'vermicelli', 'bihon', 'canton', 'ramen', 'udon'],
  ['chili', 'chilli', 'chile', 'siling'],
  ['scallion', 'spring', 'green'],
]
const groupOf = (w: string) => GROUPS.filter((g) => g.includes(stem(w)))

const isNumberish = (t: string) => /^\d/.test(t) || /^[½¼¾⅓⅔]$/.test(t)

/** The meaningful words of an ingredient line: "2 cloves garlic, minced" -> ["garlic"]. */
export function coreWords(ingredient: string): string[] {
  return normalize(ingredient)
    .split(' ')
    .filter((t) => t.length > 1 && !isNumberish(t) && !NOISE.has(t))
}

/** True for things assumed to be in every kitchen. */
export function isBasic(ingredient: string): boolean {
  const core = coreWords(ingredient)
  if (core.length === 0) return true
  return core.some((t) => BASICS.has(t)) && core.every((t) => BASICS.has(t) || BASIC_MODIFIERS.has(t))
}

/** Plural to singular: eggs -> egg, tomatoes -> tomato, berries -> berry, cheese stays cheese. */
const stem = (w: string) => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && /(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Does one pantry item (maybe several words, like "soy sauce") appear in this ingredient? */
export function itemMatches(item: string, ingredient: string): boolean {
  const want = normalize(item).split(' ').filter((w) => w.length > 1)
  if (want.length === 0) return false
  const have = coreWords(ingredient)
  return want.every((w) => {
    const kin = groupOf(w)
    return have.some((h) => h === w || stem(h) === stem(w) || (w.length >= 5 && wordMatches(w, h)) || kin.some((g) => g.includes(stem(h))))
  })
}

export type Assessment = {
  /** Ingredients you have, as the dish names them. */
  have: string[]
  /** Ingredients you still need (basics excluded). */
  missing: string[]
  /** Share of the real ingredients you already have, 0 to 1. */
  coverage: number
}

/** Compare a dish's ingredient names with what is in the pantry. */
export function assess(ingredients: readonly string[], pantry: readonly string[]): Assessment {
  const seen = new Set<string>()
  const required: string[] = []
  for (const raw of ingredients) {
    if (isBasic(raw)) continue
    const key = coreWords(raw).join(' ')
    if (!key || seen.has(key)) continue
    seen.add(key)
    required.push(raw)
  }
  const have: string[] = []
  const missing: string[] = []
  for (const ing of required) (pantry.some((p) => itemMatches(p, ing)) ? have : missing).push(ing)
  return { have, missing, coverage: required.length === 0 ? 0 : have.length / required.length }
}

/** A short label for an ingredient line: "2 cloves garlic, minced" -> "garlic". */
export function shortName(ingredient: string): string {
  const core = coreWords(ingredient)
  return core.length ? core.join(' ') : ingredient
}

/** Split what someone typed into separate items: "egg, rice and garlic" -> ["egg", "rice", "garlic"]. */
export function parsePantry(text: string): string[] {
  const out: string[] = []
  for (const part of text.replace(/\bi have\b/gi, '').split(/[,\n;]|\band\b/i)) {
    const item = normalize(part)
    if (item.length >= 2 && !out.includes(item)) out.push(item)
  }
  return out
}

export type Rated<T> = { item: T; a: Assessment }

/**
 * Keep the things you could realistically cook and put the easiest first:
 * fewest things to buy, then using the most of what you have.
 * (Needs at least two real ingredients covered, or one if that is all you listed, and about 40% of the dish.)
 */
export function rank<T>(things: readonly T[], names: (t: T) => readonly string[], pantry: readonly string[]): Rated<T>[] {
  if (pantry.length === 0) return []
  const minHave = pantry.length >= 2 ? 2 : 1
  return things
    .map((item) => ({ item, a: assess(names(item), pantry) }))
    .filter((r) => r.a.have.length >= minHave && r.a.coverage >= 0.4)
    .sort((x, y) => x.a.missing.length - y.a.missing.length || y.a.have.length - x.a.have.length || y.a.coverage - x.a.coverage)
}

const KEY = 'tweaked.pantry'

export function loadPantry(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 40) : []
  } catch {
    return []
  }
}

export function savePantry(items: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 40)))
  } catch {
    /* private mode: the list lasts for this visit only */
  }
}
