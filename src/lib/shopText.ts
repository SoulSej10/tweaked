/** Pure helpers for the shopping list: read "2 cups flour", add two lines together, and file items by aisle. */

const UNITS: Record<string, string> = {
  cup: 'cup', cups: 'cup', tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', l: 'l', liter: 'l', litre: 'l', liters: 'l', litres: 'l', oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', clove: 'clove', cloves: 'clove', can: 'can', cans: 'can',
  pinch: 'pinch', bunch: 'bunch', bunches: 'bunch', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  slice: 'slice', slices: 'slice', pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
}
const PLURAL_UNITS = new Set(['cup', 'clove', 'can', 'bunch', 'piece', 'slice', 'pack'])
const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

export type Line = { qty: number | null; unit: string; name: string; key: string | null }

/** "1 1/2 cups Flour" → { qty: 1.5, unit: 'cup', name: 'Flour', key: 'cup|flour' }. A line with no leading number has no key and never merges. */
export function parseLine(raw: string): Line {
  const t = raw.trim().replace(/\s+/g, ' ')
  const m = t.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])|^(\d+) (\d+)\/(\d+)(?!\d)|^(\d+)\/(\d+)(?!\d)|^(\d+(?:\.\d+)?)/)
  let qty: number | null = null
  let rest = t
  if (m) {
    if (m[2]) qty = (m[1] ? Number(m[1]) : 0) + VULGAR[m[2]]
    else if (m[3]) qty = Number(m[3]) + Number(m[4]) / Number(m[5])
    else if (m[6]) qty = Number(m[6]) / Number(m[7])
    else qty = Number(m[8])
    rest = t.slice(m[0].length).trim()
    // "2-3 cloves" is a range: keep it as written and do not add it up.
    if (/^[-–]\s*\d/.test(rest) || !Number.isFinite(qty) || qty <= 0) return { qty: null, unit: '', name: t, key: null }
  }
  let unit = ''
  const w = rest.split(' ')[0]?.toLowerCase().replace(/\.$/, '')
  if (qty !== null && w && UNITS[w]) {
    unit = UNITS[w]
    rest = rest.slice(rest.indexOf(' ') < 0 ? rest.length : rest.indexOf(' ') + 1).trim()
  }
  rest = rest.replace(/^of\s+/i, '')
  const name = rest || t
  if (qty === null || !rest) return { qty: null, unit: '', name: t, key: null }
  return { qty, unit, name, key: `${unit}|${singular(name)}` }
}

function singular(name: string): string {
  const n = name.toLowerCase().replace(/\(.*?\)/g, '').split(',')[0].trim()
  if (/ies$/.test(n)) return n.replace(/ies$/, 'y')
  if (/(oes|ches|shes)$/.test(n)) return n.replace(/es$/, '')
  return /[^s]s$/.test(n) ? n.slice(0, -1) : n
}

export function formatQty(n: number): string {
  const whole = Math.floor(n + 1e-9)
  const frac = n - whole
  const eighths = Math.round(frac * 8)
  if (Math.abs(frac * 8 - eighths) < 0.06) {
    if (eighths === 0) return String(whole)
    if (eighths === 8) return String(whole + 1)
    const g = eighths % 4 === 0 ? 4 : eighths % 2 === 0 ? 2 : 1
    const f = `${eighths / g}/${8 / g}`
    return whole ? `${whole} ${f}` : f
  }
  return String(Math.round(n * 100) / 100)
}

/** Build the display line for a quantity, unit and name: (3, 'cup', 'Flour') → "3 cups Flour". */
export function composeLine(qty: number, unit: string, name: string): string {
  const u = unit && PLURAL_UNITS.has(unit) && qty > 1 ? `${unit}s` : unit
  return [formatQty(qty), u, name].filter(Boolean).join(' ')
}

/** Add two lines that name the same thing in the same unit; null when they cannot be added. */
export function mergeLines(a: string, b: string): string | null {
  const x = parseLine(a)
  const y = parseLine(b)
  if (!x.key || x.key !== y.key || x.qty === null || y.qty === null) return null
  return composeLine(x.qty + y.qty, x.unit, x.name)
}

export const AISLES = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Frozen', 'Pantry', 'Spices & sauces', 'Other'] as const
export type Aisle = (typeof AISLES)[number]

const RULES: [Aisle, RegExp][] = [
  ['Pantry', /\b(coconut (milk|cream)|peanut butter|evaporated|condensed|cream of|stock|broth|cornstarch|corn starch|cornflour|black bean|kidney bean|chickpea|lentil|canned|tomato paste)/],
  ['Spices & sauces', /\b(salt|peppercorn|black pepper|ground pepper|white pepper|paprika|cumin|turmeric|cinnamon|oregano|thyme|bay leaf|bay leaves|nutmeg|cayenne|curry|chili flakes|chilli flakes|sauce|vinegar|ketchup|mustard|mayo|oil|msg|seasoning|spice|marinade|honey|syrup)/],
  ['Produce', /\b(onion|garlic|ginger|tomato|potato|carrot|cabbage|lettuce|spinach|kangkong|eggplant|talong|pepper|chili|chilli|cucumber|celery|lemon|lime|calamansi|apple|banana|mango|pineapple|avocado|mushroom|herb|cilantro|parsley|basil|mint|scallion|spring onion|leek|squash|kalabasa|green bean|string bean|sitaw|okra|broccoli|cauliflower|corn|pumpkin|zucchini|radish|labanos|berr|grape|orange|papaya|pechay|bok choy|malunggay|sayote|ampalaya|kamote|sweet potato|cassava|banana blossom|saba|coriander|dill|rosemary|sage|shallot|fruit|vegetable|greens|salad)/],
  ['Meat & fish', /\b(chicken|pork|beef|lamb|bacon|sausage|ham\b|ground|mince|turkey|fish|salmon|tuna|shrimp|prawn|squid|crab|bangus|tilapia|liempo|fillet|steak|rib|longganisa|hotdog|hot dog|anchov|sardine|mussel|clam|oyster|chorizo|meat)/],
  ['Frozen', /\b(frozen|ice cream)/],
  ['Dairy & eggs', /\b(egg|milk|cheese|butter|yogurt|yoghurt|cream|margarine)/],
  ['Bakery', /\b(bread|bun|tortilla|pita|bagel|baguette|pandesal|wrapper|loaf|croissant|roll)/],
  ['Pantry', /\b(rice|flour|sugar|pasta|noodle|spaghetti|macaroni|bean|oat|cereal|breadcrumb|bread crumb|panko|baking|yeast|cocoa|chocolate|nut|almond|peanut|cashew|raisin|tofu|bihon|miki|sotanghon|lumpia|coconut|cracker|jam|tea|coffee|water|juice|soda)/],
]

/** Which part of the shop an item lives in. Anything unrecognized lands in "Other". */
export function aisleOf(text: string): Aisle {
  const name = parseLine(text).name.toLowerCase()
  for (const [aisle, re] of RULES) if (re.test(name)) return aisle
  return 'Other'
}
