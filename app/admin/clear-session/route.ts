import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { deleteAdminSession } from "@/lib/admin/auth"

export const dynamic = "force-dynamic"

/**
 * Clears a stale `__admin_session` cookie and bounces to /admin/login.
 * Used by the admin layout when DB-side session verification fails so
 * the middleware's cookie-existence bounce doesn't trap the browser
 * in a /admin ↔ /admin/login redirect loop.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get("__admin_session")?.value
  if (token) {
    try {
      await deleteAdminSession(token)
    } catch {
      // best-effort: even if DB delete fails, still clear the cookie below
    }
  }

  const url = new URL("/admin/login", request.url)
  const response = NextResponse.redirect(url)
  response.cookies.set("__admin_session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  })
  return response
}
