const RULES: [RegExp, string][] = [
  [/chicken|adobo|poultry|wings?/i, '🍗'],
  [/beef|steak|pork|lamb|meat|bbq|barbecue|ribs?/i, '🥩'],
  [/fish|shrimp|prawn|seafood|salmon|tuna|crab|squid/i, '🦐'],
  [/pasta|spaghetti|noodle|ramen|pancit|lasagn|macaroni/i, '🍝'],
  [/rice|fried rice|sinangag|risotto|biryani/i, '🍚'],
  [/soup|stew|sinigang|broth|curry|chili/i, '🍲'],
  [/egg|omelet|omelette|breakfast|pancake|waffle|toast/i, '🍳'],
  [/salad|veg|tofu|bean|lentil|veggie|vegan/i, '🥗'],
  [/cake|pie|tart|dessert|cookie|brownie|pastry|pastries|sweet|ice cream|pudding|flan|bread/i, '🥐'],
  [/pizza/i, '🍕'],
  [/burger|sandwich|taco|wrap/i, '🥪'],
  [/dumpling|lumpia|spring roll|snack|side|starter/i, '🥟'],
]

export function dishEmoji(title: string, tags: string[] = []): string {
  const text = `${title} ${tags.join(' ')}`
  for (const [re, e] of RULES) if (re.test(text)) return e
  return '🍽️'
}

/** A stable 0..5 index so each recipe keeps the same pastel tile colour. */
export function tileIndex(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 6
}
