export type Effort = 'quick' | 'easy' | 'any'

export type Preferences = {
  cuisines: string[] // Cuisine ids (see CUISINES)
  kinds: string[] // Kind ids (see KINDS)
  effort: Effort
  avoid: string[] // Avoid ids (see AVOID)
}

export const EMPTY_PREFS: Preferences = { cuisines: [], kinds: [], effort: 'easy', avoid: [] }

/**
 * `areas` are the labels the online recipe source (TheMealDB) uses for that cuisine. It mixes
 * demonyms and country names ("Indian" has no dishes, "India" has 15), so we try every alias.
 */
export const CUISINES = [
  { id: 'filipino', label: 'Filipino', flag: '🇵🇭', areas: ['Filipino', 'Philippines'] },
  { id: 'italian', label: 'Italian', flag: '🇮🇹', areas: ['Italian', 'Italy'] },
  { id: 'japanese', label: 'Japanese', flag: '🇯🇵', areas: ['Japanese', 'Japan'] },
  { id: 'chinese', label: 'Chinese', flag: '🇨🇳', areas: ['Chinese', 'China'] },
  { id: 'thai', label: 'Thai', flag: '🇹🇭', areas: ['Thai', 'Thailand'] },
  { id: 'mexican', label: 'Mexican', flag: '🇲🇽', areas: ['Mexican', 'Mexico'] },
  { id: 'indian', label: 'Indian', flag: '🇮🇳', areas: ['India', 'Indian'] },
  { id: 'american', label: 'American', flag: '🇺🇸', areas: ['United States', 'American'] },
  { id: 'french', label: 'French', flag: '🇫🇷', areas: ['France', 'French'] },
  { id: 'spanish', label: 'Spanish', flag: '🇪🇸', areas: ['Spanish', 'Spain'] },
  { id: 'greek', label: 'Greek', flag: '🇬🇷', areas: ['Greek', 'Greece'] },
  { id: 'vietnamese', label: 'Vietnamese', flag: '🇻🇳', areas: ['Vietnamese', 'Vietnam'] },
  { id: 'turkish', label: 'Turkish', flag: '🇹🇷', areas: ['Turkish', 'Turkey'] },
  { id: 'british', label: 'British', flag: '🇬🇧', areas: ['British', 'United Kingdom'] },
  { id: 'jamaican', label: 'Jamaican', flag: '🇯🇲', areas: ['Jamaican', 'Jamaica'] },
  { id: 'brazilian', label: 'Brazilian', flag: '🇧🇷', areas: ['Brazil', 'Brazilian'] },
  { id: 'cambodian', label: 'Cambodian', flag: '🇰🇭', areas: ['Cambodia', 'Cambodian'] },
  { id: 'moroccan', label: 'Moroccan', flag: '🇲🇦', areas: ['Moroccan', 'Morocco'] },
  { id: 'korean', label: 'Korean', flag: '🇰🇷', areas: ['Korean', 'South Korea'] },
  { id: 'pakistani', label: 'Pakistani', flag: '🇵🇰', areas: ['Pakistani', 'Pakistan'] },
  { id: 'lebanese', label: 'Lebanese', flag: '🇱🇧', areas: ['Lebanese', 'Lebanon'] },
] as const

export type Cuisine = (typeof CUISINES)[number]
export const cuisineById = (id: string): Cuisine | undefined => CUISINES.find((c) => c.id === id)

/** Which of our cuisines does a source area/country string belong to? */
export function cuisineOf(area: string | null | undefined): Cuisine | undefined {
  if (!area) return undefined
  const a = area.toLowerCase()
  return CUISINES.find((c) => c.areas.some((x) => x.toLowerCase() === a))
}

export const KINDS = [
  { id: 'chicken', label: 'Chicken', emoji: '🍗', categories: ['Chicken'] },
  { id: 'meat', label: 'Beef & pork', emoji: '🥩', categories: ['Beef', 'Pork', 'Lamb'] },
  { id: 'seafood', label: 'Seafood', emoji: '🦐', categories: ['Seafood'] },
  { id: 'pasta', label: 'Pasta & noodles', emoji: '🍝', categories: ['Pasta'] },
  { id: 'veggie', label: 'Veggie', emoji: '🥦', categories: ['Vegetarian', 'Vegan'] },
  { id: 'breakfast', label: 'Breakfast', emoji: '🍳', categories: ['Breakfast'] },
  { id: 'sweet', label: 'Pastries & sweets', emoji: '🥐', categories: ['Dessert'] },
  { id: 'snacks', label: 'Snacks & sides', emoji: '🥟', categories: ['Side', 'Starter'] },
  { id: 'drinks', label: 'Drinks & coolers', emoji: '🥤', categories: ['Drink'] },
] as const

export const AVOID = [
  { id: 'pork', label: 'Pork', emoji: '🐖', words: ['pork', 'bacon', 'ham', 'sausage', 'chorizo', 'prosciutto', 'lard', 'pancetta'] },
  { id: 'beef', label: 'Beef', emoji: '🐄', words: ['beef', 'steak', 'veal', 'brisket'] },
  { id: 'seafood', label: 'Seafood', emoji: '🐟', words: ['fish', 'prawn', 'shrimp', 'salmon', 'tuna', 'squid', 'crab', 'anchov', 'mussel', 'clam', 'cod', 'oyster', 'lobster', 'haddock', 'mackerel'] },
  { id: 'nuts', label: 'Nuts', emoji: '🥜', words: ['peanut', 'almond', 'cashew', 'pecan', 'walnut', 'pistachio', 'hazelnut'] },
  { id: 'dairy', label: 'Dairy', emoji: '🥛', words: ['milk', 'cheese', 'butter', 'cream', 'yogh', 'yogurt', 'ghee'] },
  { id: 'alcohol', label: 'Alcohol', emoji: '🍷', words: ['wine', 'beer', 'rum', 'brandy', 'whisky', 'whiskey', 'sake', 'vodka', 'liqueur', 'liquor', 'cacha', 'tequila', 'mezcal', 'gin', 'bourbon', 'schnapps', 'amaretto', 'kahlua', 'champagne', 'prosecco', 'cognac', 'absinthe', 'vermouth', 'sherry', 'bitters'] },
  { id: 'spicy', label: 'Very spicy', emoji: '🌶️', words: ['chilli', 'chili', 'cayenne', 'jalapeno', 'habanero', 'scotch bonnet', 'sriracha'] },
] as const

export const EFFORTS = [
  { id: 'quick', label: 'Quick & few ingredients', hint: 'Around 7 ingredients or fewer', emoji: '⚡' },
  { id: 'easy', label: 'Easy weeknight cooking', hint: 'Up to about 10 ingredients', emoji: '🍳' },
  { id: 'any', label: 'Happy to spend more time', hint: 'Still nothing fancy', emoji: '🍲' },
] as const

export function normalizePrefs(raw: unknown): Preferences {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Preferences>
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    cuisines: arr(r.cuisines),
    kinds: arr(r.kinds),
    effort: r.effort === 'quick' || r.effort === 'any' ? r.effort : 'easy',
    avoid: arr(r.avoid),
  }
}

export function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
