import { beforeAll, describe, expect, it, vi } from 'vitest'
import catalogText from '../../public/catalog.json?raw'
import { KINDS } from './prefs'

// Uses the real bundled dish catalog, so this guards the actual home-screen behaviour.
describe('home feed: random every opening, bound to the sign-up quiz', () => {
  let buildFeed: typeof import('./discover').buildFeed
  const hist = { cuisines: {}, categories: {}, savedIds: new Set<string>() }
  const prefs = { cuisines: ['filipino', 'japanese', 'american'], kinds: ['chicken', 'meat', 'pasta', 'veggie', 'breakfast', 'sweet'], effort: 'easy' as const, avoid: ['nuts', 'alcohol'] }
  const cats = new Set(KINDS.filter((k) => prefs.kinds.includes(k.id)).flatMap((k) => k.categories as readonly string[]).map((c) => c.toLowerCase()))
  const matches = (d: { cuisineId: string | null; category: string }) => Boolean(d.cuisineId && prefs.cuisines.includes(d.cuisineId)) || cats.has(d.category.toLowerCase())

  beforeAll(async () => {
    globalThis.fetch = vi.fn(async () => new Response(catalogText, { status: 200 })) as typeof fetch
    const mod = await import('./discover')
    await mod.loadCatalog()
    buildFeed = mod.buildFeed
  })

  it('shows different picks on different openings', async () => {
    const heroes = new Set<string>()
    const lists = new Set<string>()
    for (let i = 1; i <= 25; i++) {
      const picked = (await buildFeed(prefs, hist, i * 7919 + 13)).find((s) => s.id === 'picked')!
      heroes.add(picked.dishes[0].id)
      lists.add(picked.dishes.map((d) => d.id).join())
    }
    expect(heroes.size).toBeGreaterThanOrEqual(12)
    expect(lists.size).toBe(25)
  })

  it('always picks from what the person chose in the quiz', async () => {
    for (let i = 1; i <= 25; i++) {
      const picked = (await buildFeed(prefs, hist, i * 104729)).find((s) => s.id === 'picked')!
      expect(picked.dishes.length).toBeGreaterThanOrEqual(6)
      expect(picked.dishes.every(matches)).toBe(true)
    }
  })

  it('keeps hiding what the person asked to skip', async () => {
    const feed = await buildFeed(prefs, hist, 4242)
    const text = feed.flatMap((s) => s.dishes).map((d) => `${d.name} ${d.ingredients.map((x) => x.name).join(' ')}`.toLowerCase()).join(' ')
    expect(text).not.toMatch(/\b(almond|cashew|pecan|walnut|peanut|rum|vodka|whisk(e)?y|brandy)\b/)
  })

  it('is repeatable for the same opening (steady while moving around the app)', async () => {
    const a = (await buildFeed(prefs, hist, 99)).map((s) => s.dishes.map((d) => d.id).join())
    const b = (await buildFeed(prefs, hist, 99)).map((s) => s.dishes.map((d) => d.id).join())
    expect(a).toEqual(b)
  })
})
