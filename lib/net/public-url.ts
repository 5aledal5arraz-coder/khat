/**
 * Outbound requests to URLs we did not choose (a web search result, a
 * redirect Location) — the SSRF rules, in one place.
 *
 * Two layers, both needed:
 *   1. assertPublicUrl — shape rules on EVERY URL, every redirect hop
 *      included: http(s) only, no credentials, web ports only, no local
 *      names, no private IP literal (an IP literal is connected to without a
 *      lookup, so it is checked here).
 *   2. pinnedLookup — the DNS lookup the socket itself uses; it refuses the
 *      connection if any resolved address is private, which closes the
 *      DNS-rebinding window (no separate check-then-connect).
 *
 * Callers never follow redirects automatically: they read `location` and
 * loop, running assertPublicUrl on each hop. Used by the source-page reader
 * (lib/discovery-v2/source-page.ts) and the grounding redirect resolver
 * (lib/ai/grounded-evidence.ts). Moved here from source-page.ts 2026-10-02.
 */

import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import { isIP, type LookupFunction } from "node:net"

/**
 * The User-Agent for every outbound source check. Some hosts refuse a request
 * without one (Wikipedia answers 403; Instagram redirects to an
 * «unsupported browser» page) — noura, 2026-10-02.
 */
export const SOURCE_CHECK_UA = "Mozilla/5.0 (compatible; KhatPodcast-SourceCheck/1.0; +https://khatpodcast.com)"

/** Upper bound on redirect hops any caller follows. */
export const MAX_REDIRECTS = 4

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** An IPv6 address as its 8 hextets (handles «::» and a dotted IPv4 tail), or null. */
function ipv6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const zone = s.indexOf("%")
  if (zone >= 0) s = s.slice(0, zone)
  const last = s.lastIndexOf(":")
  const tail = s.slice(last + 1)
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null
    const [a, b, c, d] = tail.split(".").map(Number)
    s = `${s.slice(0, last + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = s.split("::")
  if (halves.length > 2) return null
  const part = (x: string) => (x ? x.split(":") : [])
  const head = part(halves[0])
  const rest = halves.length === 2 ? part(halves[1]) : []
  const fill = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest]
  const nums = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN))
  return nums.length === 8 && nums.every((n) => Number.isInteger(n)) ? nums : null
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

/**
 * Loopback, private, link-local (incl. the cloud metadata address), CGNAT,
 * multicast, ULA — and every IPv6 spelling that carries a private IPv4:
 * mapped (::ffff:7f00:1 — what `new URL` makes of [::ffff:127.0.0.1]),
 * IPv4-compatible (::7f00:1), NAT64 (64:ff9b::/96) and 6to4 (2002::/16).
 * Teredo, NAT64 local-use and documentation ranges are refused outright.
 */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "")
  const v = isIP(ip.split("%")[0])
  if (v === 4) return isPrivateV4(ip)
  if (v !== 6) return true
  const h = ipv6Hextets(ip)
  if (!h) return true
  const zero = (from: number, to: number) => h.slice(from, to).every((x) => x === 0)
  if (zero(0, 5) && h[5] === 0xffff) return isPrivateV4(v4Of(h[6], h[7])) // mapped
  if (zero(0, 6)) return isPrivateV4(v4Of(h[6], h[7])) // compatible, ::, ::1
  if (h[0] === 0x64 && h[1] === 0xff9b) return zero(2, 6) ? isPrivateV4(v4Of(h[6], h[7])) : true // NAT64
  if (h[0] === 0x2002) return isPrivateV4(v4Of(h[1], h[2])) // 6to4
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true // Teredo, documentation
  if (h[0] === 0x100 && zero(1, 4)) return true // discard-only
  return (h[0] & 0xfe00) === 0xfc00 || (h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0 || (h[0] & 0xff00) === 0xff00
}

/** Shape rules checked before any request; the ADDRESS is checked at connect time. */
export function assertPublicUrl(u: URL): void {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme")
  if (u.username || u.password) throw new Error("credentials in url")
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("port")
  const host = u.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) throw new Error("local host")
  // An IP literal is connected to without a lookup — check it here.
  if (isIP(host) && isPrivateAddress(host)) throw new Error("private address")
}

export class PrivateAddressError extends Error {
  code = "EPRIVATE"
}

/**
 * The DNS lookup the socket itself uses: resolves, then refuses the
 * connection if ANY address is private. Checking in the connect path (not
 * before it) closes the rebinding window — the name cannot resolve public
 * for the check and private for the connect.
 */
export const pinnedLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { all: true, family: options?.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err)
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(new PrivateAddressError(`private address for ${hostname}`))
    }
    if (options?.all) return callback(null, list)
    return callback(null, list[0].address, list[0].family)
  })
}) as unknown as LookupFunction

/** Status + Location of one request — no body is read. */
export interface StatusResponse {
  status: number
  location: string | null
}

/**
 * One request with the pinned lookup and NO redirect following; resolves
 * with the status and Location, discarding any body. Rejects on any error
 * (incl. a private address at connect time). Callers check the URL with
 * assertPublicUrl first and loop on `location` themselves.
 */
export function pinnedStatusRequest(
  url: URL,
  method: "HEAD" | "GET",
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<StatusResponse> {
  const mod = url.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method, agent: false, lookup: pinnedLookup, signal, headers }, (res) => {
      const location = typeof res.headers.location === "string" ? res.headers.location : null
      res.destroy()
      resolve({ status: res.statusCode ?? 0, location })
    })
    req.on("error", reject)
    req.end()
  })
}
