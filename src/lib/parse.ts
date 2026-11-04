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
export function scaleAmount(amount: string, factor: number): string {
  if (factor === 1) return amount
  const n = toNumber(amount)
  return n === null ? amount : pretty(n * factor)
}

const BULLET = /^\s*(?:[-*•–]|\d+[.)])\s*/

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

/**
 * Best-effort import of a pasted caption. Looks for "Ingredients" / "Steps" headings,
 * otherwise treats quantity-looking lines as ingredients and the rest as steps.
 */
export function importCaption(raw: string): { title: string; ingredients: string; steps: string } {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const isIngHead = (l: string) => /^(ingredients?|sangkap|mga sangkap)\b/i.test(l.replace(/[^\w\s]/g, '').trim())
  const isStepHead = (l: string) =>
    /^(steps?|instructions?|directions?|method|procedure|paano|how to cook)\b/i.test(l.replace(/[^\w\s]/g, '').trim())

  let title = ''
  const first = lines[0] ?? ''
  if (first && first.length <= 80 && !isIngHead(first) && !isStepHead(first) && !/^\d/.test(first)) title = first.replace(/^[^\w]+|[^\w]+$/g, '')

  const ing: string[] = []
  const steps: string[] = []
  let mode: 'none' | 'ing' | 'step' = 'none'
  const looksLikeIngredient = (l: string) => /^[-*•]?\s*(\d|[½¼¾⅓⅔])/.test(l) && l.length < 70
  for (const [idx, l] of lines.entries()) {
    if (idx === 0 && l.replace(/^[^\w]+|[^\w]+$/g, '') === title && title) continue
    if (isIngHead(l)) { mode = 'ing'; continue }
    if (isStepHead(l)) { mode = 'step'; continue }
    if (mode === 'ing') ing.push(l)
    else if (mode === 'step') steps.push(l)
    else if (looksLikeIngredient(l)) ing.push(l)
    else if (!l.startsWith('#')) steps.push(l)
  }
  return { title, ingredients: ing.join('\n'), steps: steps.join('\n') }
}

export function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return `0:${String(seconds).padStart(2, '0')}`
}
