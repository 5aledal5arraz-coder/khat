/**
 * Smoke test for the guest-candidates prep form system.
 * Usage: npx tsx scripts/smoke-prep-forms.ts
 */
import {
  ensureDefaultTemplate,
  createCandidate,
  createPrepLink,
  validatePrepLinkByToken,
  submitPrepResponse,
  softDeleteCandidate,
  listResponses,
} from "../lib/guest-candidates"

async function main() {
  console.log("1. Ensuring default template...")
  const tpl = await ensureDefaultTemplate()
  console.log(`   template: ${tpl.id} — ${tpl.name} — sections: ${tpl.schema_json.sections.length}`)

  console.log("2. Creating test candidate...")
  const cand = await createCandidate({ full_name: "اختبار نموذج التحضير", category: "media" })
  console.log(`   candidate: ${cand.id}`)

  console.log("3. Creating prep link...")
  const link = await createPrepLink({
    candidateId: cand.id,
    adminMessage: "مرحباً — رابط تجربة",
  })
  console.log(`   link: ${link.id} — token len: ${link.token.length} — status: ${link.status}`)

  console.log("4. Validating by token...")
  const v = await validatePrepLinkByToken(link.token)
  if (!v.ok) throw new Error(`validation failed: ${v.reason}`)
  console.log(`   ok — candidate: ${v.data.candidate.full_name}`)

  console.log("5. Submitting draft response...")
  const r1 = await submitPrepResponse({
    prepLinkId: link.id,
    candidateId: cand.id,
    responseJson: { preferred_name: "أبو فلان", phone_whatsapp: "+966500000000" },
    isFinal: false,
  })
  console.log(`   draft completion: ${r1.response.completion_percent}%`)

  console.log("6. Submitting final response...")
  const r2 = await submitPrepResponse({
    prepLinkId: link.id,
    candidateId: cand.id,
    responseJson: {
      preferred_name: "أبو فلان",
      phone_whatsapp: "+966500000000",
      topics_excited_about: "الفلسفة والفن",
      preferred_filming_days: ["الأحد", "الإثنين"],
      preferred_filming_time: "صباحاً",
      preferred_drink: "قهوة",
    },
    isFinal: true,
  })
  console.log(`   final completion: ${r2.response.completion_percent}% — link status: ${r2.link.status}`)

  console.log("7. Listing responses for candidate...")
  const responses = await listResponses(cand.id)
  console.log(`   ${responses.length} response(s)`)

  console.log("8. Cleaning up...")
  await softDeleteCandidate(cand.id)
  console.log("   done")
  process.exit(0)
}

main().catch((e) => {
  console.error("SMOKE FAIL:", e)
  process.exit(1)
})
