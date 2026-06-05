/**
 * Smoke test for Phase 5 — notifications + responses archive.
 * Usage: npx tsx scripts/smoke-phase5.ts
 *
 * Validates:
 *  1. submitPrepResponse fires a notification row
 *  2. Draft vs final notification types + channels
 *  3. recordPrepLinkOpen logs prep_opened
 *  4. listAllPrepResponses returns archive rows
 *  5. listCandidateNotifications returns the log
 *
 * NOTE: Email delivery is stubbed — if RESEND_API_KEY is not set, the email
 * step is skipped by the catch in notifyPrepSubmitted and the row is still
 * logged with delivery_error populated. This is the intended production
 * behavior for misconfigured envs.
 */
import {
  ensureDefaultTemplate,
  createCandidate,
  createPrepLink,
  recordPrepLinkOpen,
  submitPrepResponse,
  listCandidateNotifications,
  listAllPrepResponses,
  softDeleteCandidate,
} from "../lib/guest-candidates"

async function main() {
  console.log("1. Ensuring default template...")
  const tpl = await ensureDefaultTemplate()
  console.log(`   template: ${tpl.id}`)

  console.log("2. Creating candidate...")
  const cand = await createCandidate({ full_name: "اختبار إشعارات المرحلة ٥", category: "tech" })
  console.log(`   candidate: ${cand.id}`)

  console.log("3. Creating prep link...")
  const link = await createPrepLink({ candidateId: cand.id, adminMessage: "رابط للتجربة" })
  console.log(`   link: ${link.id}`)

  console.log("4. Recording first open (should log prep_opened)...")
  await recordPrepLinkOpen(link.id)

  console.log("5. Submitting draft (should log prep_submitted/in_app)...")
  await submitPrepResponse({
    prepLinkId: link.id,
    candidateId: cand.id,
    responseJson: { preferred_name: "أبو تجربة" },
    isFinal: false,
  })

  console.log("6. Submitting final (should log prep_submitted/email)...")
  await submitPrepResponse({
    prepLinkId: link.id,
    candidateId: cand.id,
    responseJson: {
      preferred_name: "أبو تجربة",
      phone_whatsapp: "+966500000000",
      topics_excited_about: "التقنية والفلسفة",
    },
    isFinal: true,
  })

  console.log("7. Listing notifications for candidate...")
  const notifs = await listCandidateNotifications(cand.id)
  console.log(`   ${notifs.length} notification(s):`)
  for (const n of notifs) {
    const errSuffix = n.delivery_error ? ` — error: ${n.delivery_error.slice(0, 40)}...` : ""
    console.log(`   • ${n.notification_type} / ${n.delivery_channel}${errSuffix}`)
  }

  console.log("8. Listing archive (all responses)...")
  const archive = await listAllPrepResponses({ limit: 10 })
  const matching = archive.filter((r) => r.candidate.id === cand.id)
  console.log(`   archive rows for candidate: ${matching.length}`)
  if (matching.length > 0) {
    const first = matching[0]
    console.log(`   → ${first.candidate.full_name} — ${Math.round(first.response.completion_percent ?? 0)}%`)
  }

  // Assertions
  const hasOpened = notifs.some((n) => n.notification_type === "prep_opened")
  const hasDraftLog = notifs.some((n) => n.notification_type === "prep_submitted" && n.delivery_channel === "in_app")
  const hasFinalLog = notifs.some((n) => n.notification_type === "prep_submitted" && n.delivery_channel === "email")
  if (!hasOpened) throw new Error("Missing prep_opened notification")
  if (!hasDraftLog) throw new Error("Missing draft prep_submitted/in_app notification")
  if (!hasFinalLog) throw new Error("Missing final prep_submitted/email notification")
  if (matching.length === 0) throw new Error("Archive did not contain candidate's response")

  console.log("9. Cleaning up...")
  await softDeleteCandidate(cand.id)
  console.log("   done")
  console.log("")
  console.log("✓ Phase 5 smoke PASS")
  process.exit(0)
}

main().catch((e) => {
  console.error("SMOKE FAIL:", e)
  process.exit(1)
})
