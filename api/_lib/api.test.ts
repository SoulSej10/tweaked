import { describe, expect, it } from 'vitest'
import { FetchError, checkUrl, isPrivateAddress } from './safeFetch'
import { decodeEntities, durationToMinutes, extractFromPage, isSocial, pageToText, validateRecipe } from './recipe'

const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>hi</body></html>`

const recipe = {
  '@type': 'Recipe',
  name: 'Chicken Adobo &amp; Rice',
  image: ['https://example.com/a.jpg'],
  recipeIngredient: ['1 kg chicken', '1/2 cup soy sauce', '6 cloves garlic'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Marinate the chicken for 30 minutes.' },
    { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Simmer until tender.' }] },
  ],
  prepTime: 'PT10M',
  cookTime: 'PT40M',
  recipeYield: '4 servings',
  recipeCuisine: 'Filipino',
}

describe('recipe extraction from structured page data', () => {
  it('reads a plain Recipe node', () => {
    const r = extractFromPage(page(recipe), 'https://www.example.com/adobo')
    expect(r).toMatchObject({ title: 'Chicken Adobo & Rice', minutes: 50, servings: 4, cuisine: 'Filipino', site: 'example.com', image: 'https://example.com/a.jpg' })
    expect(r?.ingredients).toHaveLength(3)
    expect(r?.steps).toEqual(['Marinate the chicken for 30 minutes.', 'Simmer until tender.'])
  })
  it('finds a Recipe inside @graph and with a type list', () => {
    const r = extractFromPage(page({ '@graph': [{ '@type': 'WebSite' }, { ...recipe, '@type': ['Recipe', 'Thing'] }] }), 'https://x.com/a')
    expect(r?.title).toContain('Chicken Adobo')
  })
  it('splits instructions given as one block of text', () => {
    const r = extractFromPage(page({ ...recipe, recipeInstructions: '1. Marinate the chicken.\n2. Simmer until tender.' }), 'https://x.com/a')
    expect(r?.steps).toEqual(['Marinate the chicken.', 'Simmer until tender.'])
  })
  it('skips broken JSON blocks and pages without a recipe', () => {
    expect(extractFromPage('<script type="application/ld+json">{oops</script>', 'https://x.com')).toBeNull()
    expect(extractFromPage(page({ '@type': 'Article', name: 'News' }), 'https://x.com')).toBeNull()
  })
  it('rejects recipes that are too thin to cook from', () => {
    expect(validateRecipe({ title: 'Empty', ingredients: ['salt'], steps: [] }, 'https://x.com')).toBeNull()
  })
  it('bounds sizes so a hostile page cannot flood the app', () => {
    const r = validateRecipe({ title: 'x'.repeat(500), ingredients: Array.from({ length: 200 }, (_, i) => `item ${i}`), steps: ['y'.repeat(5000)] }, 'https://x.com')
    expect(r?.title.length).toBe(120)
    expect(r?.ingredients).toHaveLength(40)
    expect(r?.steps[0].length).toBe(700)
  })
  it('strips tags from text and ignores non-http images', () => {
    const r = validateRecipe({ title: 'T', ingredients: ['<b>2</b> eggs', '1 cup <script>alert(1)</script>milk'], steps: ['Mix.'], image: 'javascript:alert(1)' }, 'https://x.com')
    expect(r?.image).toBeNull()
    expect(r?.ingredients[0]).toBe('2 eggs')
    expect(r?.ingredients[1]).not.toContain('<')
  })
})

describe('small helpers', () => {
  it('parses ISO durations', () => {
    expect(durationToMinutes('PT1H30M')).toBe(90)
    expect(durationToMinutes('PT45M')).toBe(45)
    expect(durationToMinutes('nonsense')).toBeNull()
  })
  it('decodes common entities', () => {
    expect(decodeEntities('Tom &amp; Jerry&#39;s &frac12; cup')).toBe("Tom & Jerry's ½ cup")
  })
  it('recognises pages that cannot be read from a server', () => {
    expect(isSocial('https://www.facebook.com/reel/1')).toBe(true)
    expect(isSocial('https://fb.watch/x')).toBe(true)
    expect(isSocial('https://kawalingpinoy.com/chicken-adobo')).toBe(false)
  })
  it('turns a page into plain text without scripts', () => {
    const t = pageToText('<html><script>evil()</script><nav>menu</nav><h1>Adobo</h1><p>Simmer 20 minutes.</p></html>')
    expect(t).toContain('Adobo')
    expect(t).toContain('Simmer 20 minutes.')
    expect(t).not.toContain('evil')
    expect(t).not.toContain('menu')
  })
})

describe('refusing internal addresses', () => {
  it('flags private, loopback and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false)
  })
  it('rejects unsafe links before any request is made', () => {
    const bad = ['ftp://example.com', 'file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'https://user:pw@example.com', 'https://example.com:8080/', 'http://service.internal/', 'not a url']
    for (const u of bad) expect(() => checkUrl(u), u).toThrow(FetchError)
    expect(checkUrl('https://kawalingpinoy.com/chicken-adobo/').hostname).toBe('kawalingpinoy.com')
  })
})

import { afterEach, beforeEach, vi } from 'vitest'
import { aiExtract, aiWebSearch } from './anthropic'

describe('AI helpers (service mocked)', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.ANTHROPIC_API_KEY
  })
  const reply = (content: unknown[]) => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ content }), { status: 200 })) as typeof fetch
  }

  it('collects, dedupes and filters web search results; social pages are dropped', async () => {
    reply([
      { type: 'text', text: 'searching' },
      {
        type: 'web_search_tool_result',
        content: [
          { type: 'web_search_result', url: 'https://kawalingpinoy.com/bicol-express/', title: 'Bicol Express' },
          { type: 'web_search_result', url: 'https://kawalingpinoy.com/bicol-express/', title: 'Bicol Express (dup)' },
          { type: 'web_search_result', url: 'https://www.facebook.com/reel/1', title: 'A reel' },
          { type: 'web_search_result', url: 'javascript:alert(1)', title: 'Bad' },
          { type: 'web_search_result', url: 'https://panlasangpinoy.com/bicol-express/', title: 'Panlasang Pinoy' },
        ],
      },
    ])
    const out = await aiWebSearch('bicol express')
    expect(out.map((r) => r.site)).toEqual(['kawalingpinoy.com', 'panlasangpinoy.com'])
    const sent = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(sent.tools[0].blocked_domains).toContain('facebook.com')
  })

  it('reads a recipe the AI extracted, and validates it', async () => {
    reply([{ type: 'text', text: 'Here: {"recipe": {"title": "Pancit", "ingredients": ["200 g noodles", "2 cloves garlic"], "steps": ["Boil the noodles.", "Stir-fry with garlic."], "minutes": 25, "servings": 4, "cuisine": "Filipino", "category": "Pasta"}}' }])
    const r = await aiExtract('page text', 'https://example.com/pancit')
    expect(r).toMatchObject({ title: 'Pancit', minutes: 25, site: 'example.com' })
  })

  it('returns null when the page has no recipe or the AI answers badly', async () => {
    reply([{ type: 'text', text: '{"recipe": null}' }])
    expect(await aiExtract('x', 'https://example.com')).toBeNull()
    reply([{ type: 'text', text: 'I cannot help with that' }])
    expect(await aiExtract('x', 'https://example.com')).toBeNull()
    reply([{ type: 'text', text: '{"recipe": {"title": "Thin", "ingredients": ["salt"], "steps": []}}' }])
    expect(await aiExtract('x', 'https://example.com')).toBeNull()
  })

  it('turns an AI service failure into a safe error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch
    await expect(aiExtract('x', 'https://example.com')).rejects.toMatchObject({ status: 502 })
  })
})
