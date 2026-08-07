import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"

import {
  channelMatchesConfigured,
  clearAccessTokenCache,
  exchangeCode,
  resolveGrantedChannel,
  resolveRedirectUri,
  saveGrant,
  SCOPES,
  verifyState,
} from "@/lib/youtube/oauth"

export const dynamic = "force-dynamic"

const SCREEN = "/admin/youtube-analytics"

/**
 * Back to the admin screen with a message it can render. Never leaks a token.
 *
 * ── WHY THIS IS A PAGE AND NOT A 302 ──────────────────────────────────────
 * It WAS a `NextResponse.redirect`, and the operator landed on
 * `/admin/login?connected=@khatpodcast` — the grant had succeeded and the
 * screen still asked them to sign in again.
 *
 * Same root cause as everything else in this flow: `__admin_session` is
 * `sameSite: "strict"`. A 302 issued during a navigation that STARTED at
 * accounts.google.com keeps the whole chain cross-site, so the session cookie
 * is withheld from `/admin/youtube-analytics` too, and the middleware bounces
 * it to the login page.
 *
 * A navigation initiated by a document on OUR origin is same-site, and the
 * cookie rides along. So this returns a minimal same-origin document that
 * immediately continues to the screen. `<meta refresh>` does the work with no
 * JavaScript, and the plain link underneath is what a reader sees if anything
 * blocks it.
 */
function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL(SCREEN, request.nextUrl.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const href = url.pathname + url.search

  const escaped = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  const res = new NextResponse(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="0;url=${escaped}">` +
      `<title>جارٍ العودة…</title></head>` +
      `<body style="font-family:system-ui;padding:2rem">` +
      `<p>جارٍ العودة إلى لوحة التحكم… <a href="${escaped}">اضغط هنا إن لم تنتقل</a></p>` +
      `</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
  // The state cookie is single-use whatever the outcome — success, failure or
  // forgery. Leaving it alive would let a replayed code pass the check twice.
  res.cookies.delete("__yt_oauth_state")
  return res
}

/**
 * Step 2: Google sends the operator back here with a one-time code.
 *
 * The order of the checks below is deliberate — each one refuses before
 * anything is stored, and the channel check is the one that matters most:
 * a grant from the wrong Google account succeeds at every earlier step and
 * then publishes a stranger's audience numbers to sponsors. See lib/youtube/oauth.ts.
 *
 * ── THERE IS NO `requireAdminAPI` HERE, AND THAT IS NOT AN OVERSIGHT ──────
 * It was here, and it returned 401 on every correct flow: `__admin_session`
 * is `sameSite: "strict"`, so the browser withholds it on the cross-site
 * navigation back from accounts.google.com. Relaxing that cookie to `lax`
 * would trade a real CSRF protection on the entire admin for one flow.
 *
 * The authorisation is instead carried by the SIGNED STATE. `/start` is
 * OWNER-gated and mints `nonce.email.hmac` into an httpOnly, path-scoped,
 * ten-minute cookie. A cookie whose HMAC verifies and whose nonce matches the
 * one Google echoed back therefore proves an authenticated OWNER started this
 * exact flow in this browser — which is what the check was for.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  // Google's own refusal (the operator pressed «إلغاء», or consent was denied).
  const googleError = params.get("error")
  if (googleError) {
    return back(request, { error: `أُلغيت الموافقة من جوجل: ${googleError}` })
  }

  const code = params.get("code")
  const state = params.get("state")

  if (!code || !state) {
    return back(request, { error: "رد جوجل ناقص (لا code أو state)" })
  }

  // The cookie is verified BEFORE its contents are used: a bad HMAC returns
  // null rather than a parsed payload, so a forged cookie never reaches the
  // comparison below.
  const attested = verifyState(request.cookies.get("__yt_oauth_state")?.value)
  if (!attested) {
    return back(request, { error: "فشل تحقق state — أعد المحاولة من الشاشة نفسها" })
  }

  // timingSafeEqual, and a length check first because it THROWS on unequal
  // lengths rather than returning false. `state` is attacker-influenced.
  const a = Buffer.from(state)
  const b = Buffer.from(attested.nonce)
  if (a.length !== b.length || a.length === 0 || !crypto.timingSafeEqual(a, b)) {
    return back(request, { error: "فشل تحقق state — أعد المحاولة من الشاشة نفسها" })
  }

  try {
    const redirectUri = resolveRedirectUri(request.url)
    const tokens = await exchangeCode(code, redirectUri)

    // ── No refresh token means the grant dies in an hour ──────────────────
    // Google returns one only on a fresh consent. `prompt=consent` is set on
    // the way out precisely to force that, so this branch should be
    // unreachable — but if it ever is reached, storing nothing and saying so
    // beats storing a token that stops working after lunch.
    if (!tokens.refresh_token) {
      return back(request, {
        error: "لم ترجع جوجل refresh token — افصل الصلاحية من حسابك وأعد الربط",
      })
    }

    // ── Did Google actually grant what we asked for? ──────────────────────
    const granted = (tokens.scope ?? "").split(" ").filter(Boolean)
    const missing = SCOPES.filter((s) => !granted.includes(s))
    if (missing.length) {
      return back(request, {
        error: `صلاحيات ناقصة: ${missing.join(", ")} — لا بد من الموافقة عليها كلها`,
      })
    }

    // ── THE CHECK THAT MATTERS: is this خط's channel? ─────────────────────
    const channel = await resolveGrantedChannel(tokens.access_token)
    const match = channelMatchesConfigured(channel)
    if (!match.ok) {
      // Nothing is stored. The operator connected the wrong Google account,
      // and the honest outcome is to say which one, so they can sign out of
      // it and retry rather than wonder why the numbers look unfamiliar.
      return back(request, { error: match.reason ?? "القناة المرتبطة غير مطابقة" })
    }

    await saveGrant({
      refreshToken: tokens.refresh_token,
      scopes: granted,
      channelId: channel.id,
      accountLabel: channel.title ?? channel.handle,
      // From the signed state, not from a session cookie the browser will not
      // send on this request. See the note at the top of this file.
      connectedBy: attested.email ? `admin:${attested.email}` : null,
    })
    clearAccessTokenCache()

    return back(request, { connected: channel.handle ?? channel.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // The message can carry Google's error body, which on this path never
    // contains a token — the exchange either failed or we threw after it.
    return back(request, { error: message.slice(0, 300) })
  }
}
