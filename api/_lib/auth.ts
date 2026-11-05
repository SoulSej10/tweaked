import type { ApiRequest, ApiResponse } from './http.js'
import { FetchError } from './safeFetch.js'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const supabaseUrl = () => process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const supabaseKey = () => process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? ''

export type User = { id: string; token: string }

/** Only signed-in people may use these endpoints: they fetch pages and can spend AI credit. */
export async function requireUser(req: ApiRequest): Promise<User> {
  const header = String(req.headers.authorization ?? '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || !supabaseUrl() || !supabaseKey()) throw new HttpError(401, 'auth', 'Please sign in again.')
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: supabaseKey(), authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  if (!res || !res.ok) throw new HttpError(401, 'auth', 'Please sign in again.')
  const user = (await res.json()) as { id?: string }
  if (!user.id) throw new HttpError(401, 'auth', 'Please sign in again.')
  return { id: user.id, token }
}

export const dailyLimit = () => {
  const n = parseInt(process.env.AI_DAILY_LIMIT ?? '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20
}

/** Spend one AI credit for today. Returns credits left, or throws 429 when the daily limit is reached. */
export async function takeCredit(user: User): Promise<number> {
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/take_ai_credit`, {
    method: 'POST',
    headers: { apikey: supabaseKey(), authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_limit: dailyLimit() }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  if (!res || !res.ok) throw new HttpError(503, 'credit', 'Could not check your daily limit. Try again.')
  const left = Number(await res.json())
  if (!Number.isFinite(left) || left < 0) throw new HttpError(429, 'limit', `You've used today's ${dailyLimit()} web lookups. They reset tomorrow.`)
  return left
}

export function send(res: ApiResponse, status: number, body: unknown) {
  res.status(status).setHeader('cache-control', 'no-store').json(body)
}

/** Turn any failure into a short, safe message (never a stack trace or internal detail). */
export function fail(res: ApiResponse, e: unknown) {
  if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message })
  if (e instanceof FetchError) return send(res, 422, { error: e.code, message: e.message })
  return send(res, 500, { error: 'server', message: 'Something went wrong on our side. Try again.' })
}
