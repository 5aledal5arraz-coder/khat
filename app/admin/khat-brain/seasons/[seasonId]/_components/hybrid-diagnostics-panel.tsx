/**
 * Hybrid Generator — diagnostics panel (dev-only).
 *
 * Surfaces the readiness snapshot so engineering can see WHY the
 * generator is or isn't ready at a glance. Hidden in production builds
 * — gated on `process.env.NODE_ENV !== "production"` at the
 * call-site (page.tsx).
 *
 * No operator copy here. Internal labels are fine: this panel is for
 * us, not the operator.
 */

import type { HybridReadiness } from "@/lib/hybrid-topics/diagnostics"

export function HybridDiagnosticsPanel({
  readiness,
}: {
  readiness: HybridReadiness
}) {
  return (
    <div
      data-hybrid-diagnostics
      dir="ltr"
      className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-[11px] font-mono text-amber-100/90"
    >
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">
        dev · hybrid readiness
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <Row k="market_signals" v={readiness.market_signals_total} ok={readiness.has_recent_signals} />
        <Row
          k="signals_extracted"
          v={`${readiness.market_signals_extracted}/${readiness.market_signals_total}`}
          ok={readiness.market_signals_extracted > 0}
        />
        <Row
          k="signals_scored"
          v={`${readiness.market_signals_scored}/${readiness.market_signals_extracted}`}
          ok={readiness.has_scored_signals}
        />
        <Row k="clusters" v={readiness.market_clusters_total} ok={readiness.has_clusters} />
        <Row k="originals" v={readiness.original_topics_fresh} ok={readiness.has_originals} />
        <Row
          k="memory (strong/weak)"
          v={`${readiness.worked_strong_domains}/${readiness.worked_weak_domains}`}
          ok={readiness.has_memory}
        />
        <Row
          k="generator_ready"
          v={readiness.generator_ready ? "yes" : "no"}
          ok={readiness.generator_ready}
        />
        <Row
          k="blocking_reason"
          v={readiness.blocking_reason ?? "—"}
          ok={readiness.blocking_reason === null}
        />
      </ul>
      {(readiness.should_trigger_extraction ||
        readiness.should_trigger_scoring ||
        readiness.should_trigger_clustering) && (
        <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1">
          self-heal pending →{" "}
          {[
            readiness.should_trigger_extraction && "market.extract",
            readiness.should_trigger_scoring && "market.score_signals",
            readiness.should_trigger_clustering && "market.cluster_signals",
          ]
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
      {(readiness.inflight.collect ||
        readiness.inflight.extract ||
        readiness.inflight.score ||
        readiness.inflight.cluster) && (
        <div className="mt-2 text-[10px] opacity-80">
          inflight:{" "}
          {[
            readiness.inflight.collect && "collect",
            readiness.inflight.extract && "extract",
            readiness.inflight.score && "score",
            readiness.inflight.cluster && "cluster",
          ]
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
    </div>
  )
}

function Row({ k, v, ok }: { k: string; v: string | number; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-amber-500/10 py-0.5">
      <span className="opacity-80">{k}</span>
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span>{v}</span>
        <span className={ok ? "text-emerald-400" : "text-rose-400"}>
          {ok ? "✓" : "✗"}
        </span>
      </span>
    </li>
  )
}
