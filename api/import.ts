import type { VercelRequest, VercelResponse } from '@vercel/node'
import { aiEnabled, aiExtract } from './_lib/anthropic'
import { fail, requireUser, send, takeCredit } from './_lib/auth'
import { extractFromPage, isSocial, pageToText } from './_lib/recipe'
import { checkUrl, fetchPage } from './_lib/safeFetch'

/**
 * POST { url } -> { recipe, via }
 * Reads a recipe page. Most recipe sites embed the recipe as structured data, which is free and exact.
 * Only when a page has none do we ask the AI to read it (this costs one daily credit).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method', message: 'Use POST.' })
  try {
    const user = await requireUser(req)
    const raw = String((req.body as { url?: unknown } | null)?.url ?? '').trim().slice(0, 2000)
    if (!raw) return send(res, 400, { error: 'bad_url', message: 'Paste a link to a recipe page.' })
    checkUrl(raw)
    if (isSocial(raw)) {
      return send(res, 422, { error: 'social', message: 'Facebook, Instagram, TikTok and YouTube hide their posts from other apps. Copy the caption and paste it instead.' })
    }

    const page = await fetchPage(raw)
    const fromPage = extractFromPage(page.html, page.url)
    if (fromPage) return send(res, 200, { recipe: fromPage, via: 'page' })

    if (!aiEnabled()) return send(res, 422, { error: 'no_recipe', message: 'That page does not have a recipe we can read.' })
    const left = await takeCredit(user)
    const fromAi = await aiExtract(pageToText(page.html), page.url)
    if (!fromAi) return send(res, 422, { error: 'no_recipe', message: 'That page does not seem to contain a full recipe.' })
    return send(res, 200, { recipe: fromAi, via: 'ai', creditsLeft: left })
  } catch (e) {
    return fail(res, e)
  }
}
