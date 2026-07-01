/**
 * Partner task reminder — a daily sweep that emails operators the partnership
 * tasks that are overdue or due within the horizon, so follow-ups never slip.
 *
 * Tasks are grouped by their lead's `owner` (the operator who owns the
 * relationship); unowned tasks fall back to ADMIN_NOTIFY_EMAIL. Each recipient
 * gets one digest with deep links into the 360 record.
 *
 * Follows the market.scheduler pattern: the registered handler runs the sweep
 * and then self-re-enqueues the next tick. Bootstrapped at worker startup via
 * ensurePartnerTaskReminderSchedule().
 */

import { env } from "@/lib/env"
import { and, asc, eq, isNotNull, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { crmTasks } from "@/lib/db/schema/crm"
import { sponsorshipLeads } from "@/lib/db/schema/system"
import { sendPartnerTaskReminder } from "@/lib/email/send"
import type { PartnerReminderItem } from "@/lib/email/templates"
import { registerHandler } from "../registry"
import { enqueueRecurringTick } from "../queue"

const DAY_MS = 24 * 60 * 60 * 1000

function adminFallback(): string {
  return env.ADMIN_NOTIFY_EMAIL || "khatpodcast@hotmail.com"
}

export function reminderIntervalMs(): number {
  const v = Number(process.env.KHAT_PARTNER_REMINDER_INTERVAL_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DAY_MS
}

function dueLabel(due: Date, now: number): { label: string; overdue: boolean } {
  const diff = now - due.getTime()
  if (diff > 0) {
    const days = Math.floor(diff / DAY_MS)
    return { label: days >= 1 ? `متأخرة منذ ${days} يوم` : "متأخرة", overdue: true }
  }
  const ahead = due.getTime() - now
  if (ahead <= DAY_MS) return { label: "تستحق اليوم", overdue: false }
  return { label: `تستحق خلال ${Math.ceil(ahead / DAY_MS)} يوم`, overdue: false }
}

export interface ReminderSweepResult {
  tasks: number
  overdue: number
  recipients: number
  emails_sent: number
  emails_failed: number
  dry_run: boolean
  groups: { recipient: string; count: number }[]
}

/**
 * Find open tasks due within the horizon, group by owner, and email each
 * recipient a digest. `dryRun` skips the actual send (returns what it would do).
 */
export async function runPartnerTaskReminderSweep(opts?: {
  dryRun?: boolean
  horizonMs?: number
}): Promise<ReminderSweepResult> {
  const dryRun = opts?.dryRun ?? false
  const horizonMs = opts?.horizonMs ?? DAY_MS
  const now = Date.now()
  const empty: ReminderSweepResult = {
    tasks: 0,
    overdue: 0,
    recipients: 0,
    emails_sent: 0,
    emails_failed: 0,
    dry_run: dryRun,
    groups: [],
  }
  if (!db) return empty

  const horizon = new Date(now + horizonMs)
  // Partner tasks live on the shared polymorphic CRM core (subject_kind="partner",
  // subject_id=lead_id), joined back to the lead for the owner + company name.
  const rows = await db
    .select({
      title: crmTasks.title,
      priority: crmTasks.priority,
      due_at: crmTasks.due_at,
      leadId: sponsorshipLeads.id,
      company: sponsorshipLeads.company_name,
      owner: sponsorshipLeads.owner,
    })
    .from(crmTasks)
    .innerJoin(sponsorshipLeads, eq(crmTasks.subject_id, sponsorshipLeads.id))
    .where(
      and(
        eq(crmTasks.subject_kind, "partner"),
        eq(crmTasks.status, "open"),
        isNotNull(crmTasks.due_at),
        lte(crmTasks.due_at, horizon),
      ),
    )
    .orderBy(asc(crmTasks.due_at))

  if (rows.length === 0) return empty

  // Group by recipient email (owner, stripped of the "admin:" prefix; else admin fallback).
  const byRecipient = new Map<string, PartnerReminderItem[]>()
  let overdueTotal = 0
  for (const r of rows) {
    if (!r.due_at) continue
    const { label, overdue } = dueLabel(r.due_at, now)
    if (overdue) overdueTotal++
    const recipient = r.owner ? r.owner.replace(/^admin:/, "") : adminFallback()
    const item: PartnerReminderItem = {
      company: r.company,
      title: r.title,
      dueLabel: label,
      overdue,
      priority: r.priority,
      leadId: r.leadId,
    }
    const list = byRecipient.get(recipient)
    if (list) list.push(item)
    else byRecipient.set(recipient, [item])
  }

  let sent = 0
  let failed = 0
  if (!dryRun) {
    for (const [recipient, items] of byRecipient) {
      try {
        await sendPartnerTaskReminder(recipient, items)
        sent++
      } catch (err) {
        failed++
        console.error("[partner-task-reminder] send failed for", recipient, err)
      }
    }
  }

  return {
    tasks: rows.length,
    overdue: overdueTotal,
    recipients: byRecipient.size,
    emails_sent: sent,
    emails_failed: failed,
    dry_run: dryRun,
    groups: [...byRecipient].map(([recipient, items]) => ({ recipient, count: items.length })),
  }
}

// ─── Registered job handler (self-re-enqueues, like market.scheduler) ────────

registerHandler<{ horizonMs?: number }, ReminderSweepResult>(
  "partner.task_reminder",
  async (payload) => {
    // Schedule the next daily tick FIRST, so a failing sweep can't break the
    // recurring schedule. Idempotent — a reclaim/restart re-run won't add a
    // second chain (enqueueRecurringTick skips when a tick is already queued).
    const runAfter = new Date(Date.now() + reminderIntervalMs())
    await enqueueRecurringTick("partner.task_reminder", {}, { priority: 2, maxAttempts: 1, runAfter })
    return runPartnerTaskReminderSweep({ horizonMs: payload?.horizonMs })
  },
)
