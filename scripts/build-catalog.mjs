// Downloads the open recipe collections once and writes public/catalog.json, so the app can show
// suggestions and search instantly (and offline) instead of waiting on three public APIs.
// Run: node scripts/build-catalog.mjs   (re-run now and then to pick up new dishes)
import { mkdirSync, writeFileSync } from 'node:fs'

const MEAL = 'https://www.themealdb.com/api/json/v1/1'
const DUMMY = 'https://dummyjson.com/recipes?limit=0'
const DRINK = 'https://www.thecocktaildb.com/api/json/v1/1'

async function json(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return await r.json()
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)))
  }
  throw new Error(`failed: ${url}`)
}

async function pool(items, fn, size = 6) {
  const out = []
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const KEEP_MEAL = ['idMeal', 'strMeal', 'strCategory', 'strArea', 'strCountry', 'strInstructions', 'strMealThumb', 'strSource']
const KEEP_DRINK = ['idDrink', 'strDrink', 'strDrinkThumb', 'strInstructions', 'strAlcoholic']

function compact(raw, keep, maxIng) {
  const out = {}
  for (const k of keep) if (raw[k]) out[k] = typeof raw[k] === 'string' ? raw[k].trim() : raw[k]
  for (let i = 1; i <= maxIng; i++) {
    const name = (raw[`strIngredient${i}`] ?? '').trim()
    if (!name) continue
    out[`strIngredient${i}`] = name
    const measure = (raw[`strMeasure${i}`] ?? '').trim()
    if (measure) out[`strMeasure${i}`] = measure
  }
  return out
}

const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')
const mealPages = await pool(letters, (l) => json(`${MEAL}/search.php?f=${l}`).catch(() => ({ meals: null })))
const seen = new Set()
const meals = mealPages
  .flatMap((p) => p.meals ?? [])
  .filter((m) => (seen.has(m.idMeal) ? false : (seen.add(m.idMeal), true)))
  .map((m) => compact(m, KEEP_MEAL, 20))

const dummyRaw = (await json(DUMMY)).recipes
const dummy = dummyRaw.map((r) => ({
  id: r.id, name: r.name, ingredients: r.ingredients, instructions: r.instructions,
  prepTimeMinutes: r.prepTimeMinutes, cookTimeMinutes: r.cookTimeMinutes, cuisine: r.cuisine,
  tags: r.tags, image: r.image, mealType: r.mealType,
}))

const drinkStubs = (await json(`${DRINK}/filter.php?a=Non_Alcoholic`)).drinks ?? []
const drinkFull = await pool(drinkStubs, async (s) => (await json(`${DRINK}/lookup.php?i=${s.idDrink}`).catch(() => ({ drinks: null }))).drinks?.[0] ?? null)
const drinks = drinkFull.filter((d) => d && /non/i.test(d.strAlcoholic ?? '')).map((d) => compact(d, KEEP_DRINK, 15))

mkdirSync('public', { recursive: true })
const catalog = { v: 1, generated: new Date().toISOString().slice(0, 10), meals, dummy, drinks }
const text = JSON.stringify(catalog)
writeFileSync('public/catalog.json', text)
console.log(`meals ${meals.length}, dummy ${dummy.length}, drinks ${drinks.length}, ${(text.length / 1024).toFixed(0)} KB`)
