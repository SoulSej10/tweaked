import type { Ingredient, Step } from './types'

const UNITS = [
  'kg', 'g', 'mg', 'lb', 'lbs', 'oz', 'ml', 'l', 'liter', 'liters', 'litre', 'litres',
  'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'clove', 'cloves', 'pc', 'pcs', 'piece', 'pieces', 'pinch', 'can', 'cans', 'pack', 'bunch',
  'slice', 'slices', 'stick', 'sticks',
]

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }

/** "1 1/2", "1/2", "½", "2.5" -> number. Returns null when it is not a quantity. */
export function toNumber(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  for (const [ch, v] of Object.entries(FRACTIONS)) {
    if (s.includes(ch)) {
      const rest = s.replace(ch, '').trim()
      return (rest ? Number(rest) || 0 : 0) + v
    }
  }
  s = s.replace(',', '.')
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function pretty(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}

/** Scale a quantity string. Non-numeric amounts (e.g. "to taste") are returned unchanged. */
export function scaleAmount(amount: string, factor: number, unit = ''): string {
  if (factor === 1) return amount
  const n = toNumber(amount)
  if (n === null) return amount
  const v = n * factor
  // Whole items ("3 bay leaves", "2 eggs") read oddly as 3.75: round to a sensible count.
  if (!unit.trim()) {
    if (v >= 3) return String(Math.round(v))
    return pretty(Math.max(0.5, Math.round(v * 2) / 2))
  }
  return pretty(v)
}

export type UnitSystem = 'as-saved' | 'metric' | 'us'

const TO_METRIC: Record<string, [number, string]> = {
  cup: [240, 'ml'], cups: [240, 'ml'],
  tbsp: [15, 'ml'], tablespoon: [15, 'ml'], tablespoons: [15, 'ml'],
  tsp: [5, 'ml'], teaspoon: [5, 'ml'], teaspoons: [5, 'ml'],
  oz: [28.35, 'g'], lb: [453.6, 'g'], lbs: [453.6, 'g'],
}

function round(n: number): string {
  if (n >= 100) return String(Math.round(n / 5) * 5)
  if (n >= 10) return String(Math.round(n))
  return String(Math.round(n * 2) / 2)
}

/** Convert one ingredient between US and metric. Anything not clearly convertible is left alone. */
export function convertIngredient(i: Ingredient, to: UnitSystem): Ingredient {
  if (to === 'as-saved') return i
  const n = toNumber(i.amount)
  const unit = i.unit.toLowerCase()
  if (n === null || !unit) return i
  if (to === 'metric') {
    const m = TO_METRIC[unit]
    if (!m) return i
    let v = n * m[0]
    let u = m[1]
    if (u === 'g' && v >= 1000) { v /= 1000; u = 'kg' }
    if (u === 'ml' && v >= 1000) { v /= 1000; u = 'l' }
    return { ...i, amount: round(v), unit: u }
  }
  // metric -> US
  if (unit === 'ml') {
    if (n >= 120) return { ...i, amount: pretty(Math.round((n / 240) * 4) / 4), unit: 'cup' }
    if (n >= 15) return { ...i, amount: pretty(Math.round((n / 15) * 2) / 2), unit: 'tbsp' }
    return { ...i, amount: pretty(Math.round((n / 5) * 4) / 4), unit: 'tsp' }
  }
  if (unit === 'l') return { ...i, amount: pretty(Math.round(((n * 1000) / 240) * 4) / 4), unit: 'cup' }
  if (unit === 'g' || unit === 'kg') {
    const grams = unit === 'kg' ? n * 1000 : n
    if (grams >= 453.6) return { ...i, amount: pretty(Math.round((grams / 453.6) * 4) / 4), unit: 'lb' }
    return { ...i, amount: pretty(Math.round(grams / 28.35)), unit: 'oz' }
  }
  return i
}

const BULLET =/^\s*(?:[-*•–]|\d+[.)])\s*/

export function parseIngredientLine(line: string): Ingredient | null {
  const text = line.replace(BULLET, '').trim()
  if (!text) return null
  const m = text.match(/^((?:\d+\s+)?\d+\/\d+|\d*[.,]?\d+|[½¼¾⅓⅔])(?:\s*-\s*\d+)?\s*([a-zA-Z]+\.?)?\s+(.*)$/)
  let amount = ''
  let unit = ''
  let rest = text
  if (m) {
    amount = m[1]
    const maybeUnit = (m[2] ?? '').replace('.', '')
    if (maybeUnit && UNITS.includes(maybeUnit.toLowerCase())) {
      unit = maybeUnit
      rest = m[3]
    } else {
      rest = (m[2] ? m[2] + ' ' : '') + m[3]
    }
  }
  let note = ''
  const paren = rest.match(/^(.*?)\s*\((.*)\)\s*$/)
  if (paren) {
    rest = paren[1]
    note = paren[2]
  } else if (rest.includes(',')) {
    const i = rest.indexOf(',')
    note = rest.slice(i + 1).trim()
    rest = rest.slice(0, i)
  }
  return { name: rest.trim(), amount, unit, note }
}

export function formatIngredient(i: Ingredient): string {
  const head = [i.amount, i.unit, i.name].filter(Boolean).join(' ')
  return i.note ? `${head}, ${i.note}` : head
}

export function parseIngredients(block: string): Ingredient[] {
  return block.split('\n').map(parseIngredientLine).filter((x): x is Ingredient => x !== null && x.name !== '')
}

const TIME = /(\d+)(?:\s*-\s*\d+)?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i

export function parseStepLine(line: string): Step | null {
  const text = line.replace(BULLET, '').trim()
  if (!text) return null
  const m = text.match(TIME)
  let seconds: number | null = null
  if (m) {
    const n = Number(m[1])
    const u = m[2].toLowerCase()
    seconds = u.startsWith('h') ? n * 3600 : u.startsWith('m') ? n * 60 : n
  }
  return { text, timer_seconds: seconds }
}

export function parseSteps(block: string): Step[] {
  return block.split('\n').map(parseStepLine).filter((x): x is Step => x !== null)
}

export function formatSteps(steps: Step[]): string {
  return steps.map((s) => s.text).join('\n')
}

export type SourceKind = 'reel' | 'link'

const URL_RE = /https?:\/\/[^\s<>"')]+/i
const SOCIAL_RE = /(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com|tiktok\.com)$|youtube\.com\/shorts/i

/** Find a link in pasted text and say whether it looks like a social-media reel or a normal web page. */
export function detectSource(text: string): { url: string | null; type: SourceKind | null } {
  const m = text.match(URL_RE)
  if (!m) return { url: null, type: null }
  const url = m[0].replace(/[.,;!?]+$/, '')
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return { url: null, type: null }
  }
  return { url, type: SOCIAL_RE.test(host) || /youtube\.com\/shorts/i.test(url) ? 'reel' : 'link' }
}

export type CaptionImport = {
  title: string
  ingredients: string
  steps: string
  tags: string[]
  url: string | null
  sourceType: SourceKind | null
}

const plain = (l: string) => l.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
const ING_HEAD = /^(ingredients?|sangkap|mga sangkap|sahog|mga sahog|what you need|you will need|kailangan)\b/i
const STEP_HEAD = /^(steps?|instructions?|directions?|method|procedure|paano|paraan|how to cook|pagluluto|cooking instructions|preparation)\b/i

/**
 * Best-effort import of a pasted caption (Facebook, Instagram, TikTok, a text message...).
 * Understands English and Filipino headings, emoji bullets, numbered steps, hashtags and links.
 * Without headings, quantity-looking lines become ingredients and the rest become steps.
 */
export function importCaption(raw: string): CaptionImport {
  const { url, type } = detectSource(raw)
  const tags = [...new Set((raw.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()))].slice(0, 6)
  const lines = raw
    .split('\n')
    .map((l) => l.replace(URL_RE, '').trim())
    // Drop hashtag lines, "Watch:" leftovers once the link is removed, and calls to action.
    .filter((l) => l.length > 0 && !/^#/.test(l) && !/^(watch|link|source|video)$/i.test(plain(l)) && !/^(follow|like|share|subscribe|link in bio)\b/i.test(plain(l)))
  const isIngHead = (l: string) => ING_HEAD.test(plain(l)) && plain(l).split(' ').length <= 5
  const isStepHead = (l: string) => STEP_HEAD.test(plain(l)) && plain(l).split(' ').length <= 6

  const tidy = (l: string) => l.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\s)!?]+$/gu, '').trim()
  // Captions often read "🔥 BICOL EXPRESS 🌶️ super sarap!": keep the first chunk between emoji.
  const titleSegment = (l: string) => l.split(/[\p{Extended_Pictographic}️|]+/u).map((x) => x.trim()).find((x) => x.length >= 3) ?? l
  let title = ''
  const first = lines[0] ?? ''
  if (first && first.length <= 80 && !isIngHead(first) && !isStepHead(first) && !/^\d/.test(first)) title = tidy(titleSegment(first))

  const ing: string[] = []
  const steps: string[] = []
  let mode: 'none' | 'ing' | 'step' = 'none'
  const numberedStep = (l: string) => /^\s*(?:step\s*)?\d+\s*[.):-]\s+\p{L}/iu.test(l) && l.length > 24
  const looksLikeIngredient = (l: string) => !numberedStep(l) && /^(?:[-*•▪✔✅👉]|️)*\s*(\d|[½¼¾⅓⅔])/u.test(l) && l.length < 70
  for (const [idx, l] of lines.entries()) {
    if (idx === 0 && title) continue
    // Sharing sends the title and the text separately, so the title often repeats as a line of its own.
    if (title && idx < 3 && tidy(titleSegment(l)).toLowerCase() === title.toLowerCase()) continue
    if (isIngHead(l)) { mode = 'ing'; continue }
    if (isStepHead(l)) { mode = 'step'; continue }
    const text = l.replace(/^[^\p{L}\p{N}½¼¾⅓⅔]+/u, '').trim()
    if (!text) continue
    const bare = text.replace(/^(?:step\s*)?\d+\s*[.):-]\s+(?=\p{L})/iu, '')
    if (mode === 'ing') ing.push(text)
    else if (mode === 'step') steps.push(bare)
    else if (looksLikeIngredient(l)) ing.push(text)
    else steps.push(bare)
  }
  return { title, ingredients: ing.join('\n'), steps: steps.join('\n'), tags, url, sourceType: type }
}

export function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return `0:${String(seconds).padStart(2, '0')}`
}
