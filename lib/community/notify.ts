/**
 * Contributor follow-up — closes the loop when a contribution reaches a real
 * outcome (accepted, or routed into production). Sent ONCE per contribution
 * (guarded by outcome_emailed_at) and only when the contributor left an email.
 * Fire-and-forget: it never blocks the operator's action.
 */

import { updateCommunityContribution } from "./queries"
import { sendCommunityOutcome } from "@/lib/email/send"
import { logActivity } from "@/lib/crm"
import type { CommunityContribution } from "@/types/database"

const TYPE_LABEL: Record<string, string> = {
  guest: "اقتراح الضيف",
  topic: "فكرة الحلقة",
  question: "سؤال النقاش",
  concept: "فكرة المحتوى",
  improvement: "اقتراح التحسين",
}

export async function notifyContributionOutcome(
  c: CommunityContribution,
  outcome: "accepted" | "routed",
): Promise<void> {
  try {
    if (!c.contributor_email) return
    if (c.outcome_emailed_at) return // already notified — one outcome email per contribution

    await sendCommunityOutcome(
      c.contributor_email,
      c.contributor_name || "",
      TYPE_LABEL[c.type] || "مساهمتك",
      outcome,
      c.reference || undefined,
    )
    await updateCommunityContribution(c.id, { outcome_emailed_at: new Date().toISOString() })
    await logActivity("community", c.id, {
      type: "outcome_emailed",
      summary: outcome === "routed" ? "أُبلغ المساهم: فكرته دخلت الإنتاج" : "أُبلغ المساهم بقبول مساهمته",
      actor: "system:community",
      metadata: { outcome },
    })
  } catch (err) {
    console.error("[community] outcome email failed for", c.id, err)
  }
}
