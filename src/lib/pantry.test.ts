import { describe, expect, it } from 'vitest'
import { assess, coreWords, isBasic, itemMatches, parsePantry, rank, shortName } from './pantry'

describe('coreWords / isBasic', () => {
  it('keeps the food and drops amounts, units and prep words', () => {
    expect(coreWords('2 cloves garlic, minced')).toEqual(['garlic'])
    expect(coreWords('1/2 cup soy sauce')).toEqual(['soy', 'sauce'])
    expect(shortName('3 tbsp finely chopped fresh ginger')).toBe('fresh ginger')
  })
  it('treats kitchen basics as always on hand, but not look-alikes', () => {
    for (const b of ['Salt', 'black pepper', 'olive oil', 'water', 'salt and pepper to taste', '2 tbsp vegetable oil', 'ice']) expect(isBasic(b), b).toBe(true)
    for (const n of ['sesame oil', 'soy sauce', 'chicken stock', 'peppercorns', 'sugar']) expect(isBasic(n), n).toBe(false)
  })
})

describe('itemMatches', () => {
  it('matches singular/plural and extra words', () => {
    expect(itemMatches('egg', '2 large eggs')).toBe(true)
    expect(itemMatches('tomato', '3 ripe tomatoes, diced')).toBe(true)
    expect(itemMatches('chicken', 'boneless chicken breast')).toBe(true)
    expect(itemMatches('soy sauce', '1/3 cup soy sauce')).toBe(true)
  })
  it('does not match different foods', () => {
    expect(itemMatches('rice', 'rice vinegar')).toBe(true) // close enough: same word
    expect(itemMatches('egg', 'eggplant')).toBe(false)
    expect(itemMatches('soy sauce', 'tomato sauce')).toBe(false)
    expect(itemMatches('pasta', '200g spaghetti')).toBe(true)
    expect(itemMatches('cheese', 'grated parmesan')).toBe(true)
    expect(itemMatches('pasta', 'pasta sauce')).toBe(true)
    expect(itemMatches('rice', 'riceball')).toBe(false)
    expect(itemMatches('pork', 'chicken thighs')).toBe(false)
  })
  it('forgives a typo in a longer word', () => {
    expect(itemMatches('chiken', 'chicken thighs')).toBe(true)
  })
})

describe('assess', () => {
  const adobo = ['1 kg chicken thighs', '1/2 cup soy sauce', '1/3 cup vinegar', '6 cloves garlic', '3 bay leaves', 'salt', 'black pepper', 'water']
  it('splits what you have from what you need, ignoring basics', () => {
    const a = assess(adobo, ['chicken', 'garlic', 'soy sauce'])
    expect(a.have).toHaveLength(3)
    expect(a.missing.map(shortName)).toEqual(['vinegar', 'bay leaves'])
    expect(a.coverage).toBeCloseTo(0.6, 2)
  })
  it('is fully covered when everything real is on hand', () => {
    const a = assess(['2 eggs', 'salt', 'oil'], ['egg'])
    expect(a.missing).toEqual([])
    expect(a.coverage).toBe(1)
  })
})

describe('rank', () => {
  const dishes = [
    { name: 'Fried rice', ing: ['rice', 'egg', 'garlic', 'soy sauce'] },
    { name: 'Omelette', ing: ['egg', 'butter', 'salt'] },
    { name: 'Beef stew', ing: ['beef', 'carrot', 'potato', 'onion', 'wine'] },
    { name: 'Garlic egg rice', ing: ['rice', 'egg', 'garlic'] },
  ]
  it('puts the dishes needing the fewest extras first, and hides the unrealistic ones', () => {
    const out = rank(dishes, (d) => d.ing, ['egg', 'rice', 'garlic']).map((r) => r.item.name)
    expect(out[0]).toBe('Garlic egg rice')
    expect(out).toContain('Fried rice')
    expect(out).not.toContain('Beef stew')
  })
  it('returns nothing for an empty pantry', () => {
    expect(rank(dishes, (d) => d.ing, [])).toEqual([])
  })
})

describe('parsePantry', () => {
  it('splits on commas, "and" and new lines, and drops "I have"', () => {
    expect(parsePantry('I have egg, rice and garlic')).toEqual(['egg', 'rice', 'garlic'])
    expect(parsePantry('Soy Sauce\nPasta; cheese')).toEqual(['soy sauce', 'pasta', 'cheese'])
    expect(parsePantry('egg, egg, ,x')).toEqual(['egg'])
  })
})
