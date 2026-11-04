/** A recipe pulled from a web page, in plain strings. The app turns it into a dish. */
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

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const clean = (s: string, max: number) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max)

/** Text of a JSON-LD value that may be a string, an object with a text/name field, or a list of those. */
function text(v: unknown, max = 400): string {
  if (typeof v === 'string') return clean(v, max)
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map((x) => text(x, max)).filter(Boolean).join(', ').slice(0, max)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return text(o.text ?? o.name ?? '', max)
  }
  return ''
}

/** "PT1H30M" -> 90. */
export function durationToMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!m) return null
  const mins = (Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0) + Math.round(Number(m[3] ?? 0) / 60)
  return mins > 0 && mins < 60 * 48 ? mins : null
}

function stepsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') {
    // One block of text: split on line breaks or numbered sentences.
    const parts = decodeEntities(v.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li)>/gi, '\n').replace(/<[^>]+>/g, ' ')).split(/\n+/).map((x) => x.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, '').replace(/\s+/g, ' ').trim()).filter((x) => x.length > 2)
    out.push(...parts)
  } else if (Array.isArray(v)) {
    v.forEach((x) => stepsOf(x, out))
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o.itemListElement) stepsOf(o.itemListElement, out)
    else {
      const t = text(o.text ?? o.name ?? '', 600)
      if (t) out.push(t)
    }
  }
  return out
}

function imageOf(v: unknown): string | null {
  const first = Array.isArray(v) ? v[0] : v
  const url = typeof first === 'string' ? first : first && typeof first === 'object' ? String((first as Record<string, unknown>).url ?? '') : ''
  return /^https?:\/\//i.test(url) ? url.slice(0, 500) : null
}

function servingsOf(v: unknown): number | null {
  const n = parseInt(text(Array.isArray(v) ? v[0] : v, 40).match(/\d+/)?.[0] ?? '', 10)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null
}

function isRecipeNode(n: unknown): n is Record<string, unknown> {
  if (!n || typeof n !== 'object') return false
  const t = (n as Record<string, unknown>)['@type']
  return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe'
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !node) return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1)
      if (r) return r
    }
    return null
  }
  if (typeof node !== 'object') return null
  if (isRecipeNode(node)) return node
  const o = node as Record<string, unknown>
  return findRecipe(o['@graph'], depth + 1) ?? findRecipe(o.mainEntity, depth + 1) ?? findRecipe(o.mainEntityOfPage, depth + 1)
}

/** Every JSON-LD block on the page, parsed. Bad blocks are skipped. */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      out.push(JSON.parse(m[1].trim()))
    } catch {
      /* some sites ship slightly broken JSON-LD; skip that block */
    }
  }
  return out
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Tidy and bound a recipe so nothing odd (or huge) reaches the app. Returns null if it is not usable. */
export function validateRecipe(r: Partial<WebRecipe> & { title?: unknown }, url: string): WebRecipe | null {
  const list = (a: unknown, n: number, max: number) =>
    (Array.isArray(a) ? a : []).map((x) => (typeof x === 'string' ? clean(x, max) : '')).filter(Boolean).slice(0, n)
  const ingredients = list(r.ingredients, 40, 300)
  const steps = list(r.steps, 30, 700)
  const title = typeof r.title === 'string' ? clean(r.title, 120) : ''
  if (!title || ingredients.length < 2 || steps.length < 1) return null
  const minutes = typeof r.minutes === 'number' && r.minutes > 0 && r.minutes < 60 * 48 ? Math.round(r.minutes) : null
  const servings = typeof r.servings === 'number' && r.servings > 0 && r.servings <= 100 ? Math.round(r.servings) : null
  return {
    title,
    image: typeof r.image === 'string' && /^https?:\/\//i.test(r.image) ? r.image.slice(0, 500) : null,
    ingredients,
    steps,
    minutes,
    servings,
    cuisine: typeof r.cuisine === 'string' && r.cuisine.trim() ? clean(r.cuisine, 40) : null,
    category: typeof r.category === 'string' && r.category.trim() ? clean(r.category, 40) : null,
    site: host(url),
    url,
  }
}

/** The recipe embedded in a page (schema.org JSON-LD), which most recipe sites provide. No AI needed. */
export function extractFromPage(html: string, url: string): WebRecipe | null {
  const node = findRecipe(jsonLdBlocks(html))
  if (!node) return null
  return validateRecipe(
    {
      title: text(node.name, 120),
      image: imageOf(node.image) ?? undefined,
      ingredients: (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [node.recipeIngredient]).map((x) => text(x, 300)),
      steps: stepsOf(node.recipeInstructions),
      minutes: durationToMinutes(node.totalTime) ?? (((durationToMinutes(node.cookTime) ?? 0) + (durationToMinutes(node.prepTime) ?? 0)) || null),
      servings: servingsOf(node.recipeYield),
      cuisine: text(node.recipeCuisine, 40) || null,
      category: text(node.recipeCategory, 40) || null,
    },
    url,
  )
}

/** Plain text of a page for the AI to read when there is no embedded recipe. Capped to keep cost small. */
export function pageToText(html: string, max = 14_000): string {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  const textOnly = decodeEntities(body.replace(/<[^>]+>/g, ' '))
  const lines = textOnly.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1)
  return lines.join('\n').slice(0, max)
}

const SOCIAL = /(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com|tiktok\.com|pinterest\.[a-z.]+|youtube\.com|youtu\.be|x\.com|twitter\.com|t\.co)$/i

/** Social-media pages hide their content behind a login, so they cannot be read from a server. */
export function isSocial(url: string): boolean {
  return SOCIAL.test(host(url))
}
