import { describe, expect, it } from 'vitest'
import { compact, distance, findAlias, interpret, normalize, segment, wordMatches } from './fuzzy'

const vocab = new Set(['pan', 'de', 'sal', 'chicken', 'adobo', 'spaghetti', 'kare', 'cake', 'cheese', 'chocolate', 'bicol', 'express'])
const names = ['Bicol Express', 'Chicken Adobo', 'Spaghetti Bolognese']

describe('normalize / compact', () => {
  it('ignores case, accents, hyphens and spaces', () => {
    expect(normalize('Pan-de  Sal!')).toBe('pan de sal')
    expect(normalize('Crème Brûlée')).toBe('creme brulee')
    expect(compact('Kare-Kare (Oxtail)')).toBe('karekareoxtail')
    expect(compact('pan de sal')).toBe(compact('pandesal'))
  })
})

describe('distance', () => {
  it('counts typos, and a swapped pair as one mistake', () => {
    expect(distance('spagetti', 'spaghetti')).toBe(1)
    expect(distance('teh', 'the')).toBe(1)
    expect(distance('cake', 'cake')).toBe(0)
    expect(distance('abc', 'xyzxyz', 2)).toBeGreaterThan(2)
  })
})

describe('wordMatches', () => {
  it('forgives typos only in longer words', () => {
    expect(wordMatches('spagetti', 'spaghetti')).toBe(true)
    expect(wordMatches('chiken', 'chicken')).toBe(true)
    expect(wordMatches('cat', 'cut')).toBe(false)
    expect(wordMatches('cake', 'cakes')).toBe(true)
    expect(wordMatches('rice', 'price')).toBe(false)
  })
})

describe('segment', () => {
  it('splits a run-together name using known words', () => {
    expect(segment('pandesal', vocab)).toBe('pan de sal')
    expect(segment('chickenadobo', vocab)).toBe('chicken adobo')
  })
  it('leaves known or unsplittable words alone', () => {
    expect(segment('chicken', vocab)).toBeNull()
    expect(segment('qwertyuiop', vocab)).toBeNull()
  })
})

describe('findAlias', () => {
  it('maps common spellings to the proper dish name', () => {
    expect(findAlias('karekare')?.canonical).toBe('kare-kare')
    expect(findAlias('Halo Halo')?.canonical).toBe('halo-halo')
    expect(findAlias('longanisa')?.canonical).toBe('longganisa')
    expect(findAlias('sinigan')?.canonical).toBe('sinigang')
    expect(findAlias('totally unknown dish')).toBeNull()
  })
})

describe('interpret', () => {
  it('reads "pandesal" as "pan de sal" and offers bread as the nearest idea', () => {
    const r = interpret('pandesal', vocab, names)
    expect(r.meant).toBe('pan de sal')
    expect(r.variants).toContain('pandesal')
    expect(r.variants).toContain('pan de sal')
    expect(r.similar).toContain('bread')
  })
  it('fixes a typo inside a longer phrase', () => {
    const r = interpret('chiken adobo', vocab, names)
    expect(r.meant).toBe('chicken adobo')
    expect(r.variants[0]).toBe('chiken adobo')
  })
  it('catches a near-miss on a whole dish name', () => {
    expect(interpret('bicol exprss', vocab, names).meant).toBe('bicol express')
  })
  it('says nothing when the spelling is already right', () => {
    expect(interpret('chocolate cake', vocab, names).meant).toBeNull()
  })
})
