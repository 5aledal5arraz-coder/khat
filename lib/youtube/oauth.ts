import { createHmac, timingSafeEqual } from "crypto"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { youtubeOauthCredentials } from "@/lib/db/schema/youtube-oauth"
import { encryptToken, decryptToken } from "@/lib/youtube/token-crypto"

/**
 * The OAuth grant that lets this app read the channel's OWN analytics.
 *
 * ── WHAT THIS UNLOCKS, AND WHY A KEY CANNOT ───────────────────────────────
 * `YOUTUBE_API_KEY` reads the public YouTube Data API: views, subscribers,
 * video metadata. Age bands, country mix and peak hours are not public — they
 * belong to the channel owner, they live in the YouTube ANALYTICS API, and
 * Google serves them only to a caller acting AS the owner. No API key of any
 * kind will ever return them. That is the whole reason this file exists.
 *
 * ── SCOPES, AND WHY THERE ARE TWO ─────────────────────────────────────────
 * `yt-analytics.readonly` is the one we actually want. `youtube.readonly` is
 * here for a safety check that matters more than its cost:
 *
 * Analytics reports are requested for `ids=channel==MINE`. "MINE" is whoever
 * consented. If the wrong Google account grants access — a personal account,
 * a second channel, someone else's login left in the browser — Google returns
 * THAT channel's numbers, perfectly successfully, and we would publish a
 * stranger's demographics to sponsors on /partner as if they were خط's. There
 * is no error to catch; the failure is silent and it is printed on an invoice
 * page. So the callback resolves the granted channel and refuses any account
 * that is not the configured one. Both scopes are READ-ONLY; neither can
 * modify the channel.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
]

const SINGLETON = "SINGLETON"
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"

export type OauthConfigProblem = string | null

/** Both halves of the client credential, or a sentence saying which is missing. */
export function oauthConfigProblem(): OauthConfigProblem {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) return "GOOGLE_OAUTH_CLIENT_ID غير مضبوط"
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) return "GOOGLE_OAUTH_CLIENT_SECRET غير مضبوط"
  return null
}

/**
 * The redirect URI, which MUST be byte-identical in the authorise call, the
 * token exchange, and the Google Cloud console — Google compares all three
 * and rejects the exchange on any difference, including a trailing slash.
 *
 * `YOUTUBE_OAUTH_REDIRECT_URI` wins when set. Otherwise it is derived from
 * the request, but only for an ALLOWLISTED origin: the `Host` header is
 * attacker-controlled, and an OAuth redirect is precisely the thing you do
 * not want pointed at an origin someone else chose. (Google would reject an
 * unregistered URI anyway — this is the belt to that braces, and it keeps the
 * failure local and legible instead of arriving as a Google error screen.)
 */
const ALLOWED_ORIGINS = [/^https:\/\/khatpodcast\.com$/, /^http:\/\/localhost:\d+$/]

export function resolveRedirectUri(requestUrl: string): string {
  const explicit = process.env.YOUTUBE_OAUTH_REDIRECT_URI
  if (explicit) return explicit

  const origin = new URL(requestUrl).origin
  if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    throw new Error(
      `origin "${origin}" is not an allowed OAuth origin — set YOUTUBE_OAUTH_REDIRECT_URI explicitly`
    )
  }
  return `${origin}/api/admin/youtube/oauth/callback`
}

/**
 * The consent URL.
 *
 * `access_type=offline` + `prompt=consent` together are what guarantee a
 * REFRESH token. Google returns one only on the first consent for a given
 * client/user pair; a second connect without `prompt=consent` comes back with
 * an access token and NO refresh token, and the grant then dies silently an
 * hour later. Forcing the consent screen every time costs one extra click and
 * removes a whole class of "it worked yesterday".
 */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `${GOOGLE_AUTH}?${p.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  })

  const text = await res.text()
  if (!res.ok) {
    // Google puts the useful part in `error_description`. The body is echoed
    // because the generic "invalid_grant" covers a revoked grant, a wrong
    // redirect_uri and a reused code, and telling them apart without it is
    // guesswork. NOTHING here contains a token — this is the error path.
    throw new Error(`Google token endpoint ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as TokenResponse
}

/** Swap the one-time code for tokens. */
export function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  })
}

/**
 * Which channel a freshly granted token actually belongs to.
 *
 * Called during the callback, BEFORE anything is stored — see the scope note
 * at the top of this file. Returns the channel's id and handle so the caller
 * can compare them with the configured channel and refuse a mismatch.
 */
export async function resolveGrantedChannel(
  accessToken: string
): Promise<{ id: string; handle: string | null; title: string | null }> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    throw new Error(`could not read the granting channel (${res.status})`)
  }
  const json = (await res.json()) as {
    items?: { id: string; snippet?: { customUrl?: string; title?: string } }[]
  }
  const item = json.items?.[0]
  if (!item) throw new Error("the granting account owns no YouTube channel")

  return {
    id: item.id,
    handle: item.snippet?.customUrl ?? null,
    title: item.snippet?.title ?? null,
  }
}

/**
 * Whether a granted channel is the one this site is about.
 *
 * Compared on the HANDLE because that is what the app is configured with
 * (`YOUTUBE_CHANNEL_HANDLE=@KhatPodcast`); YouTube returns `customUrl` in
 * lower case, so the comparison is case-insensitive and tolerant of the `@`.
 * If neither a handle nor an id is configured the check cannot run — and it
 * then says so rather than passing, because a check that silently approves
 * everything is worse than no check.
 */
export function channelMatchesConfigured(granted: { id: string; handle: string | null }): {
  ok: boolean
  reason?: string
} {
  const wantId = process.env.YOUTUBE_CHANNEL_ID?.trim()
  const wantHandle = process.env.YOUTUBE_CHANNEL_HANDLE?.trim()

  if (wantId) {
    return granted.id === wantId
      ? { ok: true }
      : { ok: false, reason: `القناة المرتبطة (${granted.id}) ليست قناة خط` }
  }

  if (wantHandle) {
    const norm = (s: string) => s.replace(/^@/, "").toLowerCase()
    return granted.handle && norm(granted.handle) === norm(wantHandle)
      ? { ok: true }
      : {
          ok: false,
          reason: `القناة المرتبطة (${granted.handle ?? granted.id}) ليست ${wantHandle}`,
        }
  }

  return {
    ok: false,
    reason: "لا YOUTUBE_CHANNEL_ID ولا YOUTUBE_CHANNEL_HANDLE مضبوط — لا يمكن التحقق من القناة",
  }
}

// ── Storage ────────────────────────────────────────────────────────────────

export interface StoredGrant {
  granted_scopes: string[]
  channel_id: string | null
  google_account_email: string | null
  connected_by: string | null
  connected_at: Date | null
  last_used_at: Date | null
  last_error: string | null
  last_error_at: Date | null
}

export async function saveGrant(args: {
  refreshToken: string
  scopes: string[]
  channelId: string | null
  accountLabel: string | null
  connectedBy: string | null
}): Promise<void> {
  const row = {
    id: SINGLETON,
    refresh_token_encrypted: encryptToken(args.refreshToken),
    granted_scopes: args.scopes,
    channel_id: args.channelId,
    google_account_email: args.accountLabel,
    connected_by: args.connectedBy,
    connected_at: new Date(),
    last_used_at: null,
    last_error: null,
    last_error_at: null,
    updated_at: new Date(),
  }
  // UPSERT, not insert — reconnecting must REPLACE the grant. An insert would
  // throw on the primary key and leave the old, possibly revoked, token in
  // place while the screen said the connect succeeded.
  await db!
    .insert(youtubeOauthCredentials)
    .values(row)
    .onConflictDoUpdate({ target: youtubeOauthCredentials.id, set: row })
}

/** The grant WITHOUT its token — everything the admin screen needs, nothing it doesn't. */
export async function loadGrantStatus(): Promise<StoredGrant | null> {
  if (!db) return null
  const [row] = await db
    .select({
      granted_scopes: youtubeOauthCredentials.granted_scopes,
      channel_id: youtubeOauthCredentials.channel_id,
      google_account_email: youtubeOauthCredentials.google_account_email,
      connected_by: youtubeOauthCredentials.connected_by,
      connected_at: youtubeOauthCredentials.connected_at,
      last_used_at: youtubeOauthCredentials.last_used_at,
      last_error: youtubeOauthCredentials.last_error,
      last_error_at: youtubeOauthCredentials.last_error_at,
    })
    .from(youtubeOauthCredentials)
    .where(eq(youtubeOauthCredentials.id, SINGLETON))
    .limit(1)
  return row ?? null
}

export async function deleteGrant(): Promise<void> {
  await db!.delete(youtubeOauthCredentials).where(eq(youtubeOauthCredentials.id, SINGLETON))
}

export async function recordSuccess(): Promise<void> {
  await db!
    .update(youtubeOauthCredentials)
    .set({ last_used_at: new Date(), last_error: null, last_error_at: null })
    .where(eq(youtubeOauthCredentials.id, SINGLETON))
}

export async function recordFailure(message: string): Promise<void> {
  await db!
    .update(youtubeOauthCredentials)
    .set({ last_error: message.slice(0, 500), last_error_at: new Date() })
    .where(eq(youtubeOauthCredentials.id, SINGLETON))
}

// ── Access tokens ──────────────────────────────────────────────────────────

/**
 * Access tokens live about an hour. This caches the current one in module
 * memory with a 60-second safety margin, so a page rendering several reports
 * does not mint a token per report — and so a Google outage on the refresh
 * endpoint does not take out a request that already holds a valid token.
 *
 * Deliberately in memory and not in the database: it is short-lived by
 * design, and the fewer places a bearer token is written the better.
 */
let cached: { token: string; expiresAt: number } | null = null

/** For tests, and for "disconnect" — a deleted grant must not keep working. */
export function clearAccessTokenCache(): void {
  cached = null
}

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const problem = oauthConfigProblem()
  if (problem) throw new Error(problem)

  if (!db) throw new Error("no database connection")
  const [row] = await db
    .select({ enc: youtubeOauthCredentials.refresh_token_encrypted })
    .from(youtubeOauthCredentials)
    .where(eq(youtubeOauthCredentials.id, SINGLETON))
    .limit(1)

  if (!row) throw new Error("YouTube Analytics غير مربوط — لا توجد صلاحية محفوظة")

  const refreshToken = decryptToken(row.enc)
  const tokens = await tokenRequest({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    grant_type: "refresh_token",
  })

  cached = {
    token: tokens.access_token,
    expiresAt: Date.now() + Math.max(0, tokens.expires_in - 60) * 1000,
  }
  return cached.token
}

// ── The OAuth state, and why it carries the operator ───────────────────────

/**
 * ── THE BUG THIS EXISTS FOR, FOUND LIVE ───────────────────────────────────
 * The callback used to call `requireAdminAPI("OWNER")`. It returned 401 every
 * single time, on a correct flow, and the reason is not in this file:
 *
 *   `__admin_session` is set `sameSite: "strict"`
 *   (app/api/admin/auth/session/route.ts).
 *
 * A Strict cookie is withheld on a CROSS-SITE navigation, and Google
 * redirecting the operator back from accounts.google.com is exactly that. So
 * the session cookie is not sent, the callback cannot see the logged-in
 * admin, and the grant can never complete. There was no way to satisfy both.
 *
 * The wrong fix is to relax the session cookie to `lax` — that is a real CSRF
 * protection on the whole admin, traded away for one flow. The right fix is
 * the standard one: the OAuth STATE carries the authorisation.
 *
 * `/start` is OWNER-gated. It mints `nonce.email.hmac` into an httpOnly
 * cookie and puts the bare nonce in the URL. The callback requires both,
 * verifies the HMAC, and compares the nonce in constant time. A matching pair
 * therefore proves: an authenticated OWNER began this flow, in this browser,
 * within ten minutes. The cookie is httpOnly and only ever written by the
 * OWNER-gated route, so it cannot be planted; the HMAC means a tampered one
 * is rejected rather than parsed.
 *
 * The key is `YOUTUBE_OAUTH_ENC_KEY`, which this feature already requires —
 * a second secret to configure would be a second secret to forget.
 */
function stateKey(): Buffer {
  const raw = process.env.YOUTUBE_OAUTH_ENC_KEY
  if (!raw) throw new Error("YOUTUBE_OAUTH_ENC_KEY is not set")
  // Domain-separated from the token encryption that uses the same secret, so
  // the two never operate on each other's material.
  return createHmac("sha256", raw).update("yt-oauth-state-v1").digest()
}

export function signState(nonce: string, email: string): string {
  const payload = `${nonce}.${Buffer.from(email).toString("base64url")}`
  const mac = createHmac("sha256", stateKey()).update(payload).digest("base64url")
  return `${payload}.${mac}`
}

/** The nonce + email a cookie attests to, or null if it is absent or forged. */
export function verifyState(cookieValue: string | undefined): {
  nonce: string
  email: string
} | null {
  if (!cookieValue) return null
  const parts = cookieValue.split(".")
  if (parts.length !== 3) return null

  const [nonce, emailB64, mac] = parts
  const expected = createHmac("sha256", stateKey())
    .update(`${nonce}.${emailB64}`)
    .digest("base64url")

  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return { nonce, email: Buffer.from(emailB64, "base64url").toString("utf8") }
}

export { SCOPES, SINGLETON }
