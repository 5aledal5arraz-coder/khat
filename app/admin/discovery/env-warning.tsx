/**
 * UX-11 — Discovery env-config warning panel.
 *
 * Server component. Reads the env-var presence (via the action server
 * env, not exposed to the client) and surfaces a clear warning for
 * each missing key, naming which search source will fail silently.
 * Without this, operators see runs complete with zero candidates and
 * have no idea why.
 */

import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react"

interface SourceEnv {
  source: string
  label: string
  vars: string[]
  configured: boolean
  helpUrl: string
}

function checkEnv(): SourceEnv[] {
  const webProvider =
    process.env.WEB_SEARCH_PROVIDER === "google_cse" ? "google_cse" : "brave"
  const webRow: SourceEnv =
    webProvider === "google_cse"
      ? {
          source: "google_web",
          label: "Web Search (Google CSE — rollback)",
          vars: ["GOOGLE_CSE_KEY", "GOOGLE_CSE_CX"],
          configured:
            !!process.env.GOOGLE_CSE_KEY && !!process.env.GOOGLE_CSE_CX,
          helpUrl:
            "https://developers.google.com/custom-search/v1/introduction",
        }
      : {
          source: "google_web",
          label: "Web Search (Brave)",
          vars: ["BRAVE_SEARCH_KEY"],
          configured: !!process.env.BRAVE_SEARCH_KEY,
          helpUrl: "https://brave.com/search/api/",
        }
  return [
    {
      source: "youtube",
      label: "YouTube",
      vars: ["YOUTUBE_API_KEY"],
      configured: !!process.env.YOUTUBE_API_KEY,
      helpUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    },
    webRow,
    {
      source: "openai",
      label: "OpenAI (الذكاء الاصطناعي)",
      vars: ["OPENAI_API_KEY"],
      configured: !!process.env.OPENAI_API_KEY,
      helpUrl: "https://platform.openai.com/api-keys",
    },
  ]
}

export function DiscoveryEnvWarning() {
  const sources = checkEnv()
  const missing = sources.filter((s) => !s.configured)
  const stubbed: Array<{ label: string; reason: string }> = [
    { label: "X / Twitter", reason: "يتطلّب وصولاً مرفوعاً غير مهيأ" },
    { label: "Instagram", reason: "يتطلّب موافقة Meta Graph غير مهيأ" },
    { label: "TikTok", reason: "يتطلّب شراكة TikTok غير مهيأ" },
  ]

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {missing.length === 0 ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> مصادر البحث المُهيّأة
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3 text-amber-400" /> مصادر البحث ({missing.length} غير مُهيّأ)
          </>
        )}
      </div>
      <ul className="space-y-0.5 text-[11.5px]">
        {sources.map((s) => (
          <li
            key={s.source}
            className="flex items-center justify-between gap-2"
          >
            <span
              className={
                s.configured
                  ? "inline-flex items-center gap-1.5 text-emerald-300"
                  : "inline-flex items-center gap-1.5 text-amber-300"
              }
            >
              {s.configured ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              <span>{s.label}</span>
              {!s.configured && (
                <span className="text-muted-foreground/70" dir="ltr">
                  — set {s.vars.join(" + ")}
                </span>
              )}
            </span>
            {!s.configured && (
              <a
                href={s.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10.5px] text-violet-300 hover:underline"
                dir="ltr"
              >
                docs <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </li>
        ))}
      </ul>
      {stubbed.length > 0 && (
        <div className="mt-2 border-t border-border/30 pt-2 text-[10.5px] text-muted-foreground/80">
          غير مفعّل بعد:{" "}
          {stubbed.map((s, i) => (
            <span key={s.label}>
              {s.label}
              {i < stubbed.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
