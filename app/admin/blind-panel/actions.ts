"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
// Leaf modules, not the barrel. `actions.ts` is imported BY the client
// component, and although "use server" is a boundary, keeping the barrel out
// of this file's graph entirely is the version that cannot regress.
import { isBlindPanelEnabled } from "@/lib/ai-router/blind-panel/enabled"
import { recordVerdict, revealPanel } from "@/lib/ai-router/blind-panel/store"
import type { PanelVerdict } from "@/lib/ai-router/blind-panel/types"

type ActionResult = { success: boolean; error?: string }

/**
 * Writes for the blind judgment panel. TWO actions: record a verdict, and
 * reveal. There is deliberately no "generate" action and no "reset" — pairs
 * come from `npm run ai:blind-panel -- --generate`, an explicit command run
 * from a terminal, because generating them spends real money and a button
 * that spends money is a button someone clicks by accident.
 *
 * Both actions re-check `isBlindPanelEnabled()`. Server actions are POST
 * endpoints that exist independently of whether the page rendered, so gating
 * only the page would leave these reachable in production.
 */
function guard(): ActionResult | null {
  if (!isBlindPanelEnabled()) {
    return { success: false, error: "لوحة التحكيم أداة محلية فقط" }
  }
  return null
}

export async function recordVerdictAction(
  pairIndex: number,
  verdict: PanelVerdict,
): Promise<ActionResult> {
  const blocked = guard()
  if (blocked) return blocked

  // ADMIN — the same bar as `/admin/ops/details`, and deliberately NOT OWNER.
  //
  // OWNER was the first instinct, because the experiment is specifically
  // "what does the person whose taste defines the show think", and mixing a
  // second opinion into the same 20 pairs is a different measurement wearing
  // the same label. But a role gate cannot enforce that: there is nothing
  // stopping one OWNER from judging pairs meant for another, so the gate buys
  // no protection it appears to buy. What it DOES buy is a page that only one
  // account in the system can ever open — which makes it unverifiable by QA,
  // by review, and by anyone diagnosing it later.
  //
  // The real restriction is `isBlindPanelEnabled()`: this never exists outside
  // a local dev machine. "These are Khaled's 20 pairs" is a fact about the
  // session, and it belongs in the session record and the UI copy, not in an
  // access check that can't tell two people apart.
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) return { success: false, error: gate.error }

  if (!Number.isInteger(pairIndex)) return { success: false, error: "رقم الزوج غير صالح" }
  if (verdict !== "a" && verdict !== "b" && verdict !== "tie") {
    return { success: false, error: "حكم غير صالح" }
  }

  const result = await recordVerdict(pairIndex, verdict)
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath("/admin/blind-panel")
  return { success: true }
}

export async function revealPanelAction(): Promise<ActionResult> {
  const blocked = guard()
  if (blocked) return blocked

  const gate = await requireActionRole("OWNER")
  if (!gate.ok) return { success: false, error: gate.error }

  const result = await revealPanel()
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath("/admin/blind-panel")
  return { success: true }
}
