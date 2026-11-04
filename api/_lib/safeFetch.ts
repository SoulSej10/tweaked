import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import zlib from 'node:zlib'

/**
 * Fetch a web page on the user's behalf, safely. This is the one place the server talks to arbitrary
 * addresses, so it refuses anything that is not a plain public website:
 *  - only http(s) on the standard ports, no embedded passwords
 *  - the IP address is checked at connect time (not just before), so DNS tricks cannot slip an
 *    internal address past the check
 *  - redirects are followed by hand and every hop is checked again
 *  - hard limits on size and time
 */

export class FetchError extends Error {
  constructor(
    public code: 'bad_url' | 'blocked' | 'too_big' | 'timeout' | 'upstream' | 'not_html',
    message: string,
  ) {
    super(message)
  }
}

const MAX_BYTES = 3 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 4

function ipv4IsPrivate(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  )
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4IsPrivate(ip)
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase()
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return ipv4IsPrivate(mapped[1])
    return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || l.startsWith('ff') || l.startsWith('::ffff:')
  }
  return true // not an IP we understand: refuse
}

/** Parse and vet a URL before any network traffic. Throws FetchError('bad_url' | 'blocked'). */
export function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchError('bad_url', 'That does not look like a web address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('bad_url', 'Only web links (http or https) can be imported.')
  if (url.username || url.password) throw new FetchError('bad_url', 'Links with a password in them are not allowed.')
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchError('blocked', 'That address is not allowed.')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    throw new FetchError('blocked', 'That address is not allowed.')
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new FetchError('blocked', 'That address is not allowed.')
  return url
}

/** A DNS lookup that refuses internal addresses, used for the actual connection. */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    const list = addresses as dns.LookupAddress[]
    const ok = list.filter((a) => !isPrivateAddress(a.address))
    if (ok.length === 0 || ok.length !== list.length) return callback(new FetchError('blocked', 'That address is not allowed.'), '', 4)
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, ok)
    callback(null, ok[0].address, ok[0].family)
  })
}

type Response1 = { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

function once(url: URL): Promise<Response1> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; TweakedBot/1.0; personal recipe import)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en',
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
        const stream: NodeJS.ReadableStream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res
        const chunks: Buffer[] = []
        let size = 0
        stream.on('data', (c: Buffer) => {
          size += c.length
          if (size > MAX_BYTES) {
            req.destroy()
            reject(new FetchError('too_big', 'That page is too large to read.'))
            return
          }
          chunks.push(c)
        })
        stream.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
        stream.on('error', () => reject(new FetchError('upstream', 'Could not read that page.')))
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new FetchError('timeout', 'That site took too long to answer.'))
    })
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError('upstream', 'Could not reach that site.')))
    req.end()
  })
}

/** Download an HTML page as text, following up to a few safe redirects. */
export async function fetchPage(raw: string): Promise<{ url: string; html: string }> {
  let url = checkUrl(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await once(url)
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = checkUrl(new URL(String(res.headers.location), url).toString())
      continue
    }
    if (res.status >= 400) throw new FetchError('upstream', res.status === 404 ? 'That page was not found.' : `That site refused the request (${res.status}).`)
    const type = String(res.headers['content-type'] ?? '')
    if (type && !/html|xml|text/i.test(type)) throw new FetchError('not_html', 'That link is not a web page.')
    return { url: url.toString(), html: res.body.toString('utf-8') }
  }
  throw new FetchError('upstream', 'That link redirects too many times.')
}
