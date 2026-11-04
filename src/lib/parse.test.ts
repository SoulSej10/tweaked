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
    expect(out).toMatchObject({ title: 'Chicken Adobo', ingredients: '1 kg chicken', steps: 'Simmer' })
  })
})

describe('scaleAmount for whole items', () => {
  it('rounds unitless counts to something you can actually cook', () => {
    expect(scaleAmount('3', 1.25, '')).toBe('4')
    expect(scaleAmount('1', 1.25, '')).toBe('1.5')
    expect(scaleAmount('2', 1.25, 'cloves')).toBe('2.5')
  })
})

import { measureToParts } from './discover'
describe('measureToParts', () => {
  it('splits amounts, units and notes without touching the name', () => {
    expect(measureToParts('1 tbs')).toEqual({ amount: '1', unit: 'tbsp', note: '' })
    expect(measureToParts('50ml/2fl oz')).toEqual({ amount: '50', unit: 'ml', note: '' })
    expect(measureToParts('1/2 cup')).toEqual({ amount: '1/2', unit: 'cup', note: '' })
    expect(measureToParts('8 ounces')).toEqual({ amount: '8', unit: 'oz', note: '' })
    expect(measureToParts('Pinch')).toEqual({ amount: '', unit: '', note: 'Pinch' })
    expect(measureToParts('2 large')).toEqual({ amount: '2', unit: '', note: 'large' })
    expect(measureToParts('')).toEqual({ amount: '', unit: '', note: '' })
  })
})

import { detectSource } from './parse'
describe('detectSource', () => {
  it('finds links and tells social reels from web pages', () => {
    expect(detectSource('try this! https://www.facebook.com/reel/12345.')).toEqual({ url: 'https://www.facebook.com/reel/12345', type: 'reel' })
    expect(detectSource('https://fb.watch/abc/')).toMatchObject({ type: 'reel' })
    expect(detectSource('see https://www.instagram.com/reel/xyz')).toMatchObject({ type: 'reel' })
    expect(detectSource('https://example.com/pancit')).toEqual({ url: 'https://example.com/pancit', type: 'link' })
    expect(detectSource('no link here')).toEqual({ url: null, type: null })
  })
})

describe('importCaption on real-world captions', () => {
  const caption = `🔥 BICOL EXPRESS 🌶️ super sarap!
Sangkap:
✔️ 1/2 kg pork belly, cubed
✔️ 1 cup gata (coconut milk)
✔️ 5 pcs siling labuyo
Paraan ng pagluluto:
1. Igisa ang bawang at sibuyas
2. Ilagay ang baboy at lutuin ng 20 minutes
#bicolexpress #filipinofood
Watch: https://www.facebook.com/reel/987654321
Follow for more recipes!`
  it('sorts Filipino headings, emoji bullets, hashtags and the link', () => {
    const out = importCaption(caption)
    expect(out.title).toBe('BICOL EXPRESS')
    expect(out.ingredients.split('\n')).toEqual(['1/2 kg pork belly, cubed', '1 cup gata (coconut milk)', '5 pcs siling labuyo'])
    expect(out.steps.split('\n')).toEqual(['Igisa ang bawang at sibuyas', 'Ilagay ang baboy at lutuin ng 20 minutes'])
    expect(out.tags).toEqual(['bicolexpress', 'filipinofood'])
    expect(out.url).toBe('https://www.facebook.com/reel/987654321')
    expect(out.sourceType).toBe('reel')
  })
  it('treats numbered sentences as steps, not ingredients', () => {
    const out = importCaption('Easy rice\n1. Wash the rice well and drain it\n2 cups rice')
    expect(out.steps).toContain('Wash the rice well and drain it')
    expect(out.ingredients).toBe('2 cups rice')
  })
})

describe('importCaption from a share (title sent twice)', () => {
  it('does not turn the repeated title into a step', () => {
    const out = importCaption('Bicol Express\n🔥 BICOL EXPRESS 🌶️\nSangkap:\n1 kg pork\nParaan:\nIgisa ang bawang')
    expect(out.title).toBe('Bicol Express')
    expect(out.steps).toBe('Igisa ang bawang')
    expect(out.ingredients).toBe('1 kg pork')
  })
})
