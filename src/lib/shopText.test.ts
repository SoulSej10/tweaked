import { describe, expect, it } from 'vitest'
import { aisleOf, formatQty, mergeLines, parseLine } from './shopText'

describe('shopping text', () => {
  it('reads quantity, unit and name', () => {
    expect(parseLine('1 1/2 cups Flour')).toMatchObject({ qty: 1.5, unit: 'cup', name: 'Flour' })
    expect(parseLine('½ tsp salt')).toMatchObject({ qty: 0.5, unit: 'tsp', name: 'salt' })
    expect(parseLine('2 eggs')).toMatchObject({ qty: 2, unit: '', name: 'eggs' })
    expect(parseLine('rice').key).toBeNull()
    expect(parseLine('2-3 cloves garlic').key).toBeNull()
  })

  it('adds the same thing together', () => {
    expect(mergeLines('2 eggs', '1 egg')).toBe('3 eggs')
    expect(mergeLines('1 cup rice', '2 cups rice')).toBe('3 cups rice')
    expect(mergeLines('1/2 cup sugar', '1/2 cup sugar')).toBe('1 cup sugar')
    expect(mergeLines('1 cup rice', '1 tbsp rice')).toBeNull()
    expect(mergeLines('rice', 'rice')).toBeNull()
  })

  it('writes tidy amounts', () => {
    expect(formatQty(1.5)).toBe('1 1/2')
    expect(formatQty(0.25)).toBe('1/4')
    expect(formatQty(3)).toBe('3')
    expect(formatQty(0.3333)).toBe('0.33')
  })

  it('files items by aisle', () => {
    expect(aisleOf('2 onions')).toBe('Produce')
    expect(aisleOf('1 kg chicken thighs')).toBe('Meat & fish')
    expect(aisleOf('3 eggs')).toBe('Dairy & eggs')
    expect(aisleOf('1 eggplant')).toBe('Produce')
    expect(aisleOf('2 tbsp soy sauce')).toBe('Spices & sauces')
    expect(aisleOf('1 can coconut milk')).toBe('Pantry')
    expect(aisleOf('2 cups rice')).toBe('Pantry')
    expect(aisleOf('ice cream')).toBe('Frozen')
    expect(aisleOf('mystery thing')).toBe('Other')
  })
})
