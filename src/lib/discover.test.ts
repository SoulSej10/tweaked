import { describe, expect, it } from 'vitest'
import { cleanSteps, conflicts, dishIdFromUrl, dishToRecipe, isSimple, thumbUrl, urlDishId, type Dish } from './discover'
import { cuisineOf } from './prefs'
import { addItems, clearAll, clearDone, toggleItem } from './shopping'

const dish = (over: Partial<Dish> = {}): Dish => ({
  id: '1', name: 'Test', thumb: '', category: 'Chicken', cuisine: 'Filipino', cuisineId: 'filipino',
  ingredients: [{ name: 'Chicken', measure: '1 kg' }, { name: 'Soy Sauce', measure: '1/2 cup' }],
  steps: ['Marinate for 30 minutes', 'Simmer until done'], source: null, youtube: null, minutes: null, ...over,
})

describe('cuisine mapping', () => {
  it('understands the source\'s mixed labels', () => {
    expect(cuisineOf('India')?.id).toBe('indian')
    expect(cuisineOf('Philippines')?.id).toBe('filipino')
    expect(cuisineOf('United States')?.id).toBe('american')
    expect(cuisineOf('Narnia')).toBeUndefined()
  })
})

describe('dish filters', () => {
  it('keeps simple dishes and drops long ones', () => {
    const long = dish({ ingredients: Array.from({ length: 12 }, (_, i) => ({ name: `i${i}`, measure: '' })) })
    expect(isSimple(dish(), 'easy')).toBe(true)
    expect(isSimple(long, 'easy')).toBe(false)
    expect(isSimple(long, 'any')).toBe(true)
    expect(isSimple(dish({ steps: [] }), 'easy')).toBe(false)
  })
  it('hides dishes with things the user avoids', () => {
    expect(conflicts(dish({ ingredients: [{ name: 'Bacon', measure: '' }] }), ['pork'])).toBe(true)
    expect(conflicts(dish({ ingredients: [{ name: 'Peanut butter', measure: '' }] }), ['nuts'])).toBe(true)
    expect(conflicts(dish(), ['pork', 'nuts'])).toBe(false)
    expect(conflicts(dish({ ingredients: [{ name: 'Bacon', measure: '' }] }), [])).toBe(false)
  })
  it('matches whole words for short terms and prefixes for long ones', () => {
    expect(conflicts(dish({ ingredients: [{ name: 'Chamomile tea', measure: '' }] }), ['pork'])).toBe(false)
    expect(conflicts(dish({ ingredients: [{ name: 'Hamburger bun', measure: '' }] }), ['pork'])).toBe(false)
    expect(conflicts(dish({ ingredients: [{ name: 'Smoked ham', measure: '' }] }), ['pork'])).toBe(true)
    expect(conflicts(dish({ ingredients: [{ name: 'Anchovies', measure: '' }] }), ['seafood'])).toBe(true)
  })
  it('always keeps alcohol off the drinks shelf', () => {
    const drink = dish({ category: 'Drink', ingredients: [{ name: 'White Rum', measure: '2 oz' }, { name: 'Lime', measure: '1' }] })
    expect(conflicts(drink, [])).toBe(true)
    expect(conflicts(dish({ category: 'Drink', ingredients: [{ name: 'Cachaça', measure: '2 oz' }, { name: 'Lime', measure: '1' }] }), [])).toBe(true)
    expect(conflicts(dish({ category: 'Drink', ingredients: [{ name: 'Fresh ginger', measure: '1 tsp' }] }), [])).toBe(false)
    expect(conflicts(dish({ category: 'Drink', ingredients: [{ name: 'Mango', measure: '1' }, { name: 'Yogurt', measure: '1 cup' }] }), [])).toBe(false)
  })
})

describe('dish ids and links', () => {
  it('recognises saved dishes from every source', () => {
    expect(dishIdFromUrl('https://www.themealdb.com/meal/52772')).toBe('52772')
    expect(dishIdFromUrl('https://dummyjson.com/recipes/5')).toBe('dj-5')
    expect(dishIdFromUrl('https://www.thecocktaildb.com/drink/11007')).toBe('cd-11007')
    expect(dishIdFromUrl('https://example.com/x')).toBe(urlDishId('https://example.com/x'))
    expect(dishIdFromUrl('no link')).toBeNull()
    expect(dishIdFromUrl(null)).toBeNull()
  })
  it('only resizes TheMealDB thumbnails', () => {
    expect(thumbUrl({ thumb: 'https://www.themealdb.com/images/a.jpg' }, 'medium')).toBe('https://www.themealdb.com/images/a.jpg/medium')
    expect(thumbUrl({ thumb: 'https://cdn.dummyjson.com/recipe-images/1.webp' }, 'medium')).toBe('https://cdn.dummyjson.com/recipe-images/1.webp')
    expect(thumbUrl({ thumb: '' }, 'large')).toBe('')
  })
})

describe('cleanSteps', () => {
  it('strips numbering and drops stray "STEP 1" lines', () => {
    expect(cleanSteps('STEP 1\r\n1. Chop the onions finely\r\n2) Fry in a hot pan\r\n3. Serve warm with rice')).toEqual([
      'Chop the onions finely', 'Fry in a hot pan', 'Serve warm with rice',
    ])
  })
  it('splits one long paragraph into readable steps', () => {
    const out = cleanSteps('Mix the flour. Add the eggs. Stir well. Pour into a pan. Bake for an hour.')
    expect(out.length).toBeGreaterThan(1)
    expect(out.join(' ')).toContain('Bake for an hour.')
  })
})

describe('saving a suggested dish', () => {
  it('keeps measures out of names, detects timers and tags it', () => {
    const r = dishToRecipe(dish())
    expect(r.ingredients[0]).toEqual({ name: 'Chicken', amount: '1', unit: 'kg', note: '' })
    expect(r.ingredients[1]).toEqual({ name: 'Soy Sauce', amount: '1/2', unit: 'cup', note: '' })
    expect(r.steps[0].timer_seconds).toBe(1800)
    expect(r.meta.tags).toEqual(['filipino', 'chicken'])
    expect(r.meta.source_type).toBe('link')
  })
})

describe('shopping list', () => {
  it('skips duplicates, toggles and clears checked items', () => {
    clearAll()
    expect(addItems(['2 eggs', ' 2 EGGS ', 'rice', ''], 'Fried rice')).toBe(2)
    expect(addItems(['rice'])).toBe(0)
    clearDone()
    clearAll()
    expect(typeof toggleItem).toBe('function')
  })
})

import { parseWikiRecipe } from './discover'
describe('parseWikiRecipe', () => {
  // DOMParser only exists in a browser; the live app is where this runs.
  it.skipIf(typeof DOMParser === 'undefined')('reads ingredients and steps from a Wikibooks page', () => {
    const html = '<div class="mw-parser-output"><h2>Ingredients</h2><ul><li>1 kg pork belly</li><li>15 pieces siling labuyo</li></ul><h2>Preparation</h2><ol><li>Heat the pan.</li></ol></div>'
    const d = parseWikiRecipe(html, 'Cookbook:Bicol Express')
    expect(d?.name).toBe('Bicol Express')
    expect(d?.category).toBe('Beef')
    expect(d?.ingredients).toHaveLength(2)
  })
})

import { urlFromDishId } from './discover'
describe('dishes imported from a web address', () => {
  it('round-trips any address through its id, including unusual characters', () => {
    for (const u of ['https://kawalingpinoy.com/chicken-adobo/', 'https://example.com/recipe?x=1&y=ñandú', 'http://a.b/c d/é']) {
      expect(urlFromDishId(urlDishId(u))).toBe(u)
    }
    expect(urlFromDishId('52772')).toBeNull()
    expect(urlFromDishId('url-%%%')).toBeNull()
  })
  it('treats a saved web link as an already-saved dish', () => {
    expect(dishIdFromUrl('https://kawalingpinoy.com/chicken-adobo/')).toBe(urlDishId('https://kawalingpinoy.com/chicken-adobo/'))
    expect(dishIdFromUrl('https://www.themealdb.com/meal/52772')).toBe('52772')
    expect(dishIdFromUrl('not a link')).toBeNull()
  })
  it('uses the original address as the source when saving an imported dish', () => {
    const url = 'https://kawalingpinoy.com/chicken-adobo/'
    const r = dishToRecipe(dish({ id: urlDishId(url), name: 'Chicken Adobo', ingredients: [{ name: '1 kg chicken, cut up', measure: '' }, { name: '1/2 cup soy sauce', measure: '' }], steps: ['Simmer 20 minutes.'] }))
    expect(r.meta.source_url).toBe(url)
    expect(r.meta.source_note).toBe('Imported from kawalingpinoy.com')
    expect(r.ingredients[0]).toMatchObject({ name: 'chicken', amount: '1', unit: 'kg' })
    expect(r.steps[0].timer_seconds).toBe(1200)
  })
})
