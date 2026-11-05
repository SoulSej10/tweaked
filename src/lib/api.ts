import { supabase } from './supabase'
import type { CookLog, Ingredient, Recipe, RecipeCard, RecipeVersion, SourceType, Step } from './types'

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export async function listRecipes(): Promise<RecipeCard[]> {
  const recipes = check(
    await supabase.from('recipes').select('*').order('updated_at', { ascending: false }),
  ) as Recipe[]
  if (recipes.length === 0) return []

  const versionIds = recipes.map((r) => r.current_version_id).filter((x): x is string => Boolean(x))
  const versions = check(
    await supabase.from('recipe_versions').select('id, ingredients').in('id', versionIds),
  ) as Pick<RecipeVersion, 'id' | 'ingredients'>[]
  const logs = check(
    await supabase
      .from('cook_logs')
      .select('recipe_id, tweak_note, cooked_at')
      .not('tweak_note', 'is', null)
      .order('cooked_at', { ascending: false })
      .limit(1000),
  ) as Pick<CookLog, 'recipe_id' | 'tweak_note'>[]

  const ingByVersion = new Map(versions.map((v) => [v.id, v.ingredients]))
  const tweakByRecipe = new Map<string, string>()
  for (const l of logs) if (l.tweak_note && !tweakByRecipe.has(l.recipe_id)) tweakByRecipe.set(l.recipe_id, l.tweak_note)

  return recipes.map((r) => ({
    ...r,
    ingredientNames: (ingByVersion.get(r.current_version_id ?? '') ?? []).map((i) => i.name.toLowerCase()),
    lastTweak: tweakByRecipe.get(r.id) ?? null,
  }))
}

export type RecipeFull = {
  recipe: Recipe
  versions: RecipeVersion[]
  logs: CookLog[]
}

export async function getRecipe(id: string): Promise<RecipeFull> {
  const recipe = check(await supabase.from('recipes').select('*').eq('id', id).single()) as Recipe
  const versions = check(
    await supabase.from('recipe_versions').select('*').eq('recipe_id', id).order('version_number', { ascending: false }),
  ) as RecipeVersion[]
  const logs = check(
    await supabase.from('cook_logs').select('*').eq('recipe_id', id).order('cooked_at', { ascending: false }),
  ) as CookLog[]
  return { recipe, versions, logs }
}

export type RecipeInput = {
  title: string
  source_type: SourceType
  source_url: string | null
  source_note: string | null
  servings: number | null
  tags: string[]
  bring_from_home: boolean
}

export async function createRecipe(meta: RecipeInput, ingredients: Ingredient[], steps: Step[]): Promise<string> {
  return check(
    await supabase.rpc('create_recipe', {
      p_title: meta.title,
      p_source_type: meta.source_type,
      p_source_url: meta.source_url,
      p_source_note: meta.source_note,
      p_servings: meta.servings,
      p_tags: meta.tags,
      p_bring: meta.bring_from_home,
      p_ingredients: ingredients,
      p_steps: steps,
    }),
  ) as string
}

export async function updateRecipeMeta(id: string, meta: RecipeInput): Promise<void> {
  check(await supabase.from('recipes').update(meta).eq('id', id).select('id').single())
}

export async function addVersion(recipeId: string, ingredients: Ingredient[], steps: Step[], note: string | null) {
  return check(
    await supabase.rpc('add_version', { p_recipe: recipeId, p_ingredients: ingredients, p_steps: steps, p_note: note }),
  ) as string
}

export async function rollbackTo(recipeId: string, versionId: string) {
  return check(await supabase.rpc('set_current_version', { p_recipe: recipeId, p_version: versionId })) as string
}

export async function logCook(recipeId: string, note: string | null, photoPath: string | null = null) {
  return check(await supabase.rpc('log_cook', { p_recipe: recipeId, p_note: note, p_photo: photoPath })) as string
}

export type CookStat = { recipe_id: string; cooked_at: string; tweak_note: string | null }

/** Recent cook log entries, newest first (for the dashboard's streak and weekly numbers). */
export async function listRecentCooks(days = 60): Promise<CookStat[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  return check(
    await supabase.from('cook_logs').select('recipe_id, cooked_at, tweak_note').gte('cooked_at', since).order('cooked_at', { ascending: false }).limit(500),
  ) as CookStat[]
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  check(await supabase.from('recipes').update({ favorite }).eq('id', id).select('id').single())
}

export async function deleteRecipe(id: string): Promise<void> {
  check(await supabase.from('recipes').delete().eq('id', id).select('id'))
}

export async function exportEverything() {
  const recipes = check(await supabase.from('recipes').select('*')) as Recipe[]
  const versions = check(await supabase.from('recipe_versions').select('*')) as RecipeVersion[]
  const logs = check(await supabase.from('cook_logs').select('*')) as CookLog[]
  return { exported_at: new Date().toISOString(), recipes, versions, cook_logs: logs }
}
