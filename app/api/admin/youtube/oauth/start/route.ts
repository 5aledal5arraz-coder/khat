import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getAdminAuthUser, requireAdminAPI } from "@/lib/api-utils"
import {
  buildAuthUrl,
  oauthConfigProblem,
  resolveRedirectUri,
  signState,
} from "@/lib/youtube/oauth"
import { encryptionKeyStatus } from "@/lib/youtube/token-crypto"

export const dynamic = "force-dynamic"

/**
 * Step 1 of connecting YouTube Analytics: send the operator to Google.
 *
 * ── THE STATE PARAMETER IS NOT DECORATION ─────────────────────────────────
 * Without it, anyone can hand a logged-in OWNER a link to this app's callback
 * carrying THEIR authorization code, and the app will dutifully exchange it
 * and store a grant for the attacker's channel — a login CSRF. From then on
 * /partner publishes a stranger's demographics as خط's.
 *
 * So: a random nonce goes into the URL and, separately, a SIGNED cookie
 * carrying that nonce plus this operator's email. The callback requires both.
 * An attacker can forge the URL or the cookie, never both.
 *
 * ── AND IT IS ALSO THE ONLY THING THE CALLBACK CAN TRUST ──────────────────
 * `__admin_session` is `sameSite: "strict"`, so the browser does NOT send it
 * when Google navigates back from accounts.google.com. The callback therefore
 * cannot see the logged-in admin at all — measured, it 401'd on a perfectly
 * correct flow. This route is the last point where the operator's identity is
 * visible, so it signs it into the state; the callback reads it from there.
 * See the long note in lib/youtube/oauth.ts.
 *
 * ── FAIL BEFORE THE ROUND TRIP, NOT AFTER ─────────────────────────────────
 * Both the client credentials and the encryption key are checked HERE. Google
 * is perfectly happy to run a whole consent flow and hand back a token that
 * we then cannot store because `YOUTUBE_OAUTH_ENC_KEY` was never set — and
 * the operator would have granted access for nothing, with the failure
 * arriving on a callback screen. Checking first turns that into a sentence
 * before the first click.
 */
export async function GET(request: NextRequest) {
  // OWNER only: this grant reads the channel's private analytics, and it is a
  // stored long-lived credential. It is not an editor's decision to make.
  const authError = await requireAdminAPI("OWNER")
  if (authError) return authError

  const configProblem = oauthConfigProblem()
  if (configProblem) {
    return NextResponse.json({ error: configProblem }, { status: 400 })
  }

  const keyStatus = encryptionKeyStatus()
  if (!keyStatus.ok) {
    return NextResponse.json(
      { error: `مفتاح التشفير غير جاهز: ${keyStatus.reason}` },
      { status: 400 }
    )
  }

  let redirectUri: string
  try {
    redirectUri = resolveRedirectUri(request.url)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "redirect URI غير صالح" },
      { status: 400 }
    )
  }

  const nonce = crypto.randomBytes(32).toString("base64url")
  const user = await getAdminAuthUser()

  // The bare nonce travels through Google; the signed pair stays in the cookie.
  const response = NextResponse.redirect(buildAuthUrl(redirectUri, nonce))
  response.cookies.set("__yt_oauth_state", signState(nonce, user?.email ?? ""), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    // `lax`, not `strict`: the callback arrives as a top-level GET navigation
    // from accounts.google.com, and `strict` would withhold the cookie on
    // exactly that request — the flow would fail its own CSRF check every time.
    sameSite: "lax",
    path: "/api/admin/youtube/oauth",
    maxAge: 600, // ten minutes is longer than any real consent screen takes
  })
  return response
}
