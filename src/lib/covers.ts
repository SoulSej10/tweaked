import { dishIdFromUrl, lookup, searchCatalog, thumbUrl } from './discover'
import { supabase } from './supabase'
import { signedUrls } from './photo'
import type { Recipe } from './types'

const cache = new Map<string, string | null>()

/**
 * A picture for each saved recipe: your own latest photo of it if you took one, otherwise the photo of the dish
 * it was saved from, otherwise the photo of the closest dish of the same name. Anything else keeps its emoji tile.
 */
export async function loadCovers(recipes: Pick<Recipe, 'id' | 'source_url' | 'title'>[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const todo = recipes.filter((r) => !cache.has(r.id))

  // 1. your own photos (private, so they need short-lived signed links)
  const own = new Map<string, string>()
  try {
    const { data } = await supabase.from('cook_logs').select('recipe_id, photo_path').not('photo_path', 'is', null).order('cooked_at', { ascending: false }).limit(500)
    for (const l of data ?? []) if (l.photo_path && !own.has(l.recipe_id)) own.set(l.recipe_id, l.photo_path)
    const urls = await signedUrls([...new Set(own.values())])
    for (const r of recipes) {
      const p = own.get(r.id)
      if (p && urls[p]) out[r.id] = urls[p]
    }
  } catch {
    /* photos are optional */
  }

  // 2. the source dish's photo
  await Promise.all(
    todo.filter((r) => !out[r.id]).map(async (r) => {
      const id = dishIdFromUrl(r.source_url)
      let url: string | null = null
      if (id && !id.startsWith('url-')) {
        try {
          const d = await lookup(id)
          if (d?.thumb) url = thumbUrl(d, 'small')
        } catch {
          /* offline: emoji tile */
        }
      }
      // Typed in or imported from a reel: borrow the photo of the closest dish with the same name.
      if (!url) {
        try {
          const found = await searchCatalog(r.title.replace(/\s*\([^)]*\)/g, '').trim() || r.title)
          const d = !found.closest ? found.dishes.find((x) => x.thumb && x.category !== 'Drink') : undefined
          if (d) url = thumbUrl(d, 'small')
        } catch {
          /* no match: emoji tile */
        }
      }
      cache.set(r.id, url)
    }),
  )
  for (const r of recipes) if (!out[r.id]) {
    const c = cache.get(r.id)
    if (c) out[r.id] = c
  }
  return out
}
