export type Ingredient = {
  name: string
  amount: string
  unit: string
  note: string
}

export type Step = {
  text: string
  timer_seconds: number | null
}

export type SourceType = 'reel' | 'link' | 'own' | 'person'

export type Recipe = {
  id: string
  user_id: string
  title: string
  source_type: SourceType
  source_url: string | null
  source_note: string | null
  servings: number | null
  tags: string[]
  bring_from_home: boolean
  current_version_id: string | null
  cooked_count: number
  last_cooked_at: string | null
  created_at: string
  updated_at: string
}

export type RecipeVersion = {
  id: string
  recipe_id: string
  version_number: number
  is_original: boolean
  ingredients: Ingredient[]
  steps: Step[]
  change_note: string | null
  created_at: string
}

export type CookLog = {
  id: string
  recipe_id: string
  version_id: string | null
  cooked_at: string
  tweak_note: string | null
}

/** A recipe plus the bits the library card needs. */
export type RecipeCard = Recipe & {
  ingredientNames: string[]
  lastTweak: string | null
}
