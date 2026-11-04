import { KINDS, cuisineById } from './prefs'
import { dishIdFromUrl, type History } from './discover'
import type { RecipeCard } from './types'

const CATEGORY_NAMES = new Set(KINDS.flatMap((k) => k.categories as readonly string[]).map((c) => c.toLowerCase()))

/**
 * What the user actually cooks, read from their own library: tags that are cuisines or
 * categories count more the more often the recipe was cooked. Dishes already saved from the
 * feed are remembered so they are not suggested again.
 */
export function historyFrom(recipes: RecipeCard[]): History {
  const cuisines: Record<string, number> = {}
  const categories: Record<string, number> = {}
  const savedIds = new Set<string>()
  for (const r of recipes) {
    const weight = 1 + r.cooked_count
    for (const raw of r.tags) {
      const t = raw.toLowerCase()
      if (cuisineById(t)) cuisines[t] = (cuisines[t] ?? 0) + weight
      if (CATEGORY_NAMES.has(t)) categories[t] = (categories[t] ?? 0) + weight
    }
    const dishId = dishIdFromUrl(r.source_url)
    if (dishId) savedIds.add(dishId)
  }
  return { cuisines, categories, savedIds }
}
