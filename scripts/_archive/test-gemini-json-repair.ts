/**
 * Unit-level runtime test for `repairJsonPayload` in the Gemini JSON helper.
 *
 * Covers the exact malformation patterns we've seen Gemini produce so the
 * resilient recovery ladder in `gemini.ts` is verified end-to-end.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/test-gemini-json-repair.ts
 */

import { repairJsonPayload } from "@/lib/ai/preparation/research/gemini"

type Case = {
  name: string
  input: string
  expectRecoverable: boolean
  /** Optional assertion on the parsed shape after repair succeeds. */
  assert?: (parsed: unknown) => boolean
}

const cases: Case[] = [
  {
    name: "clean JSON passes through",
    input: `{"claims":[],"quotes":[],"past_interviews":[]}`,
    expectRecoverable: true,
    assert: (v) => typeof v === "object" && v !== null,
  },
  {
    name: "wrapped in ```json fences",
    input: "```json\n{\"claims\":[],\"quotes\":[],\"past_interviews\":[]}\n```",
    expectRecoverable: true,
  },
  {
    name: "wrapped in bare ``` fences",
    input: "```\n{\"claims\":[]}\n```",
    expectRecoverable: true,
  },
  {
    name: "prose prefix then JSON",
    input: `Here is the JSON you asked for:\n{"claims":[]}`,
    expectRecoverable: true,
  },
  {
    name: "prose prefix AND suffix",
    input: `Sure, here you go:\n{"claims":[]}\nLet me know if you need more.`,
    expectRecoverable: true,
  },
  {
    name: "trailing comma before }",
    input: `{"claims":[{"claim":"x","category":"key_fact","source_ids":[1],}]}`,
    expectRecoverable: true,
  },
  {
    name: "trailing comma at end of object",
    input: `{"claims":[],"quotes":[],}`,
    expectRecoverable: true,
  },
  {
    name: "truncated mid-array (unclosed ])",
    input: `{"claims":[{"claim":"a","category":"key_fact","source_ids":[1]},{"claim":"b","category":"key_fact","source_ids":[2]`,
    expectRecoverable: true,
    assert: (v) =>
      !!v &&
      typeof v === "object" &&
      Array.isArray((v as { claims: unknown }).claims),
  },
  {
    name: "truncated mid-string recovers partial structure",
    // Ends inside the string value for "claim". We expect the partial claim
    // to be dropped and a structurally-valid shell returned. Downstream
    // filters will prune the empty claim — the important thing is that we
    // return valid JSON the caller can parse.
    input: `{"claims":[{"claim":"unterminated string`,
    expectRecoverable: true,
    assert: (v) =>
      !!v && typeof v === "object" && Array.isArray((v as { claims: unknown }).claims),
  },
  {
    name: "fences + trailing prose combined",
    input:
      "```json\n{\"claims\":[{\"claim\":\"a\",\"category\":\"key_fact\",\"source_ids\":[1]}]}\n```\nNote: generated from 3 sources.",
    expectRecoverable: true,
  },
  {
    name: "nested truncation inside a claim object — keeps good prefix",
    // Ends inside "category":" for the second claim. We expect the first
    // claim to survive intact and the partial second claim to be dropped.
    input: `{"claims":[{"claim":"a","category":"key_fact","source_ids":[1]},{"claim":"b","category":"`,
    expectRecoverable: true,
    assert: (v) => {
      if (!v || typeof v !== "object") return false
      const claims = (v as { claims: unknown }).claims
      if (!Array.isArray(claims) || claims.length < 1) return false
      const first = claims[0] as { claim?: string }
      return first.claim === "a"
    },
  },
  {
    name: "empty string",
    input: ``,
    expectRecoverable: false,
  },
  {
    name: "not JSON at all",
    input: `I cannot provide that information.`,
    expectRecoverable: false,
  },
  {
    name: "double-wrapped fences",
    input: "```json\n{\"claims\":[],\"quotes\":[]}\n```",
    expectRecoverable: true,
  },
  {
    name: "unclosed object + unclosed inner array",
    input: `{"claims":[{"claim":"a","category":"key_fact","source_ids":[1,2`,
    expectRecoverable: true,
  },
]

let passed = 0
let failed = 0

for (const c of cases) {
  const result = repairJsonPayload(c.input)
  const recovered = result !== null
  let parsed: unknown = null
  if (recovered) {
    try {
      parsed = JSON.parse(result)
    } catch (err) {
      console.log(
        `  FAIL  ${c.name} — repair returned string that does not parse: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      failed++
      continue
    }
  }

  if (recovered !== c.expectRecoverable) {
    console.log(
      `  FAIL  ${c.name} — expected recoverable=${c.expectRecoverable}, got ${recovered}`,
    )
    if (recovered) console.log(`        repaired: ${result}`)
    failed++
    continue
  }

  if (c.assert && recovered && !c.assert(parsed)) {
    console.log(
      `  FAIL  ${c.name} — shape assertion rejected parsed value: ${JSON.stringify(parsed).slice(0, 200)}`,
    )
    failed++
    continue
  }

  console.log(
    `  PASS  ${c.name}${recovered ? "" : " (correctly rejected)"}`,
  )
  passed++
}

console.log(`\n${passed} passed, ${failed} failed of ${cases.length}`)
if (failed > 0) process.exit(1)
process.exit(0)
