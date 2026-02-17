import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * Thin CORS proxy for YouTube InnerTube / timedtext requests.
 *
 * The browser cannot fetch youtube.com cross-origin (no CORS headers).
 * This route forwards requests from our client code and relays responses.
 *
 * Two actions:
 *   GET ?action=tracks&videoId=X   — InnerTube WEB player → caption track list
 *   GET ?action=captions&url=X     — fetch raw caption XML/JSON from timedtext URL
 */

const WEB_CLIENT_VERSION = "2.20240101.00.00"

export async function GET(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { searchParams } = request.nextUrl
  const action = searchParams.get("action")

  if (action === "tracks") {
    return handleTracks(searchParams)
  }

  if (action === "captions") {
    return handleCaptions(searchParams)
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}

// ---------------------------------------------------------------------------
// action=tracks — call InnerTube WEB player API for caption track list
// ---------------------------------------------------------------------------

async function handleTracks(params: URLSearchParams) {
  const videoId = params.get("videoId")
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 })
  }

  try {
    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: WEB_CLIENT_VERSION,
              hl: "ar",
              gl: "KW",
            },
          },
          videoId,
        }),
      }
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `YouTube player API returned ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()

    // Extract just the caption tracks (don't leak the full player response)
    const captionTracks =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []

    return NextResponse.json({ captionTracks })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// ---------------------------------------------------------------------------
// action=captions — fetch raw caption content from a timedtext URL
// ---------------------------------------------------------------------------

async function handleCaptions(params: URLSearchParams) {
  const url = params.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 })
  }

  // Only allow youtube.com timedtext URLs
  try {
    const parsed = new URL(url)
    const isAllowedDomain = (hostname: string, domain: string) =>
      hostname === domain || hostname.endsWith("." + domain)
    if (
      !isAllowedDomain(parsed.hostname, "youtube.com") &&
      !isAllowedDomain(parsed.hostname, "googlevideo.com") &&
      !isAllowedDomain(parsed.hostname, "ytimg.com")
    ) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Caption fetch returned ${res.status}` },
        { status: 502 }
      )
    }

    const contentType = res.headers.get("content-type") || ""
    const body = await res.text()

    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": contentType || "text/plain" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Proxy error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
