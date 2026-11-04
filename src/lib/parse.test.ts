import { describe, expect, it } from 'vitest'
import { convertIngredient, importCaption, parseIngredientLine, parseStepLine, scaleAmount, toNumber } from './parse'

describe('toNumber', () => {
  it('reads fractions and mixed numbers', () => {
    expect(toNumber('1/2')).toBe(0.5)
    expect(toNumber('1 1/2')).toBe(1.5)
    expect(toNumber('½')).toBe(0.5)
    expect(toNumber('2,5')).toBe(2.5)
  })
  it('returns null for words', () => expect(toNumber('to taste')).toBeNull())
})

describe('parseIngredientLine', () => {
  it('splits amount, unit, name and note', () => {
    expect(parseIngredientLine('3 cloves garlic, minced')).toEqual({ name: 'garlic', amount: '3', unit: 'cloves', note: 'minced' })
  })
  it('keeps a bare name', () => {
    expect(parseIngredientLine('- salt to taste')).toEqual({ name: 'salt to taste', amount: '', unit: '', note: '' })
  })
  it('does not treat a non-unit word as a unit', () => {
    expect(parseIngredientLine('2 eggs')).toEqual({ name: 'eggs', amount: '2', unit: '', note: '' })
  })
})

describe('parseStepLine', () => {
  it('detects a timer', () => expect(parseStepLine('Simmer for 10 min')?.timer_seconds).toBe(600))
  it('detects hours', () => expect(parseStepLine('Marinate 2 hours')?.timer_seconds).toBe(7200))
  it('strips numbering', () => expect(parseStepLine('1. Boil water')?.text).toBe('Boil water'))
})

describe('scaleAmount', () => {
  it('scales numbers, leaves words', () => {
    expect(scaleAmount('1/2', 3)).toBe('1.5')
    expect(scaleAmount('to taste', 2)).toBe('to taste')
  })
})

describe('convertIngredient', () => {
  const cup = { name: 'soy sauce', amount: '1', unit: 'cup', note: '' }
  it('converts cups to ml', () => expect(convertIngredient(cup, 'metric')).toMatchObject({ amount: '240', unit: 'ml' }))
  it('converts g to oz', () => expect(convertIngredient({ ...cup, amount: '200', unit: 'g' }, 'us')).toMatchObject({ amount: '7', unit: 'oz' }))
  it('leaves unknown units alone', () => {
    const clove = { name: 'garlic', amount: '3', unit: 'cloves', note: '' }
    expect(convertIngredient(clove, 'metric')).toEqual(clove)
  })
})

describe('importCaption', () => {
  it('finds title, ingredients and steps', () => {
    const out = importCaption('Chicken Adobo\nIngredients:\n1 kg chicken\nSteps:\nSimmer')
    expect(out).toEqual({ title: 'Chicken Adobo', ingredients: '1 kg chicken', steps: 'Simmer' })
  })
})

describe('scaleAmount for whole items', () => {
  it('rounds unitless counts to something you can actually cook', () => {
    expect(scaleAmount('3', 1.25, '')).toBe('4')
    expect(scaleAmount('1', 1.25, '')).toBe('1.5')
    expect(scaleAmount('2', 1.25, 'cloves')).toBe('2.5')
  })
})
