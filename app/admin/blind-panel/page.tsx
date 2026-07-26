/**
 * `/admin/blind-panel` — the blind judgment panel.
 *
 * Local-only (see `isBlindPanelEnabled`) and deliberately absent from the
 * sidebar: it is a bench instrument for one person on one question, not a
 * section of the admin. Reachable by typing the URL, which is the right
 * amount of discoverability for a tool that should be opened once.
 *
 * Server component. It reads the session through `toPublicView()`, which is
 * where the blinding lives — while the session is un-revealed the model
 * names and per-pair sources are NOT in the payload this page sends, so
 * there is nothing to un-blind by opening DevTools.
 *
 * Auth: ADMIN — same bar as `/admin/ops/details`. The panel measures one
 * person's taste on purpose, but that is a property of the session, not
 * something a role check can enforce; see the note in actions.ts.
 */

import { notFound } from "next/navigation"
import {
  isBlindPanelEnabled,
  readBlindPanel,
  toPublicView,
  tallyPanel,
  judgeAgreement,
  PANEL_PAIR_COUNT,
} from "@/lib/ai-router/blind-panel"
import { checkPageRole } from "@/lib/api-utils"
import { NoAccess } from "../ops/_components/no-access"
import { BlindPanelClient } from "./panel-client"
import { PanelEmptyState } from "./empty-state"

export const dynamic = "force-dynamic"

export default async function BlindPanelPage() {
  if (!isBlindPanelEnabled()) notFound()

  const gate = await checkPageRole("ADMIN")
  if (!gate.ok) return <NoAccess roleLabelAr="مدير" />

  const session = await readBlindPanel()
  if (!session) return <PanelEmptyState />

  const view = toPublicView(session)

  // The tally is computed on the SERVER from the stored session, not in the
  // client from the view: while blind, the view has no sources, so the client
  // physically cannot compute who is winning — which is the point. Results
  // are only handed over once `revealed` is true.
  const pairResults = session.pairs.map((p) => ({
    aSource: p.aSource,
    verdict: session.verdicts[String(p.index)] ?? null,
    judgeVerdict: p.judgeVerdict,
  }))
  const tally = tallyPanel(pairResults)
  const agreement = judgeAgreement(pairResults)

  return (
    <BlindPanelClient
      view={view}
      pairCount={PANEL_PAIR_COUNT}
      // Withheld until reveal for the same reason the labels are: a running
      // score is a running hint about which side you have been preferring.
      result={
        view.revealed
          ? {
              tally,
              agreement,
              currentModel: session.currentModel,
              candidateModel: session.candidateModel,
              judgeModel: session.judgeModel,
              promptVersion: session.promptVersion,
            }
          : null
      }
      judgedCount={tally.decided}
    />
  )
}
