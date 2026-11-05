import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { aiEnabled, aiWebSearch } from './_lib/anthropic.js'
import { fail, requireUser, send, takeCredit } from './_lib/auth.js'

/**
 * POST { q } -> { results: [{ title, url, site }], creditsLeft }
 * Searches the open web for recipe pages. Costs one daily credit, so the app only calls it when asked.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method', message: 'Use POST.' })
  try {
    const user = await requireUser(req)
    const q = String((req.body as { q?: unknown } | null)?.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
    if (q.length < 2) return send(res, 400, { error: 'bad_query', message: 'Type a dish name to search for.' })
    if (!aiEnabled()) return send(res, 503, { error: 'ai_off', message: 'Searching the web is not switched on for this app yet.' })
    const left = await takeCredit(user)
    const results = await aiWebSearch(q)
    return send(res, 200, { results, creditsLeft: left })
  } catch (e) {
    return fail(res, e)
  }
}
