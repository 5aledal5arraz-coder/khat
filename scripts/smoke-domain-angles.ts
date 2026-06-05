/**
 * Phase-D smoke test — pure, no DB.
 *
 * Validates the shape + coverage of the Phase-D angle catalog and
 * asserts that the loader-side grouping logic (simulated) bucketizes
 * angles into `angles_by_domain` correctly.
 *
 * Checks:
 *   1. DOMAIN_ANGLE_CATALOG has 10 domains with ≥8 angles each
 *   2. Every angle has { code, title_ar, summary_ar, episode_type }
 *   3. angle codes are unique across the catalog (no collisions)
 *   4. Code prefix matches the domain (e.g. "psychology.*" → psychology)
 *   5. DOMAIN_ANGLE_SEEDS has one row per angle with category=domain
 *   6. Simulated grouping reproduces the loader's
 *      `angles_by_domain` + freshness-first ordering
 *
 * Invocation:
 *   npx tsx scripts/smoke-domain-angles.ts
 */

import {
  DOMAIN_ANGLE_CATALOG,
  DOMAIN_ANGLE_SEEDS,
} from "@/lib/khat-map/core/constitution"
import type {
  KhatMapTopicBankEntry,
  KhatMapTopicDomain,
} from "@/types/khat-map"

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error("❌ Assertion failed:", message)
    process.exit(1)
  }
}

// ─── 1. Domain coverage ────────────────────────────────────────────────────
const expectedDomains: KhatMapTopicDomain[] = [
  "relationships",
  "philosophy",
  "religion",
  "money_career",
  "technology_ai",
  "internet_culture",
  "psychology",
  "crime_mystery",
  "hidden_history",
  "identity_masculinity",
]
for (const d of expectedDomains) {
  const angles = DOMAIN_ANGLE_CATALOG[d]
  assert(angles, `catalog missing domain ${d}`)
  assert(
    angles!.length >= 8,
    `${d} should have ≥8 angles, got ${angles!.length}`,
  )
}
console.log(
  `  ✓ Case 1 — all 10 domains present with ≥8 angles each`,
)

// ─── 2. Angle shape ────────────────────────────────────────────────────────
let totalAngles = 0
for (const [domain, angles] of Object.entries(DOMAIN_ANGLE_CATALOG)) {
  for (const a of angles ?? []) {
    totalAngles++
    assert(a.code, `${domain}: angle missing code`)
    assert(a.title_ar, `${domain}: angle missing title_ar`)
    assert(a.summary_ar, `${domain}: angle missing summary_ar`)
    assert(a.episode_type, `${domain}: angle missing episode_type`)
  }
}
console.log(`  ✓ Case 2 — ${totalAngles} angles all well-formed`)

// ─── 3. Unique codes ───────────────────────────────────────────────────────
const codes = new Set<string>()
for (const angles of Object.values(DOMAIN_ANGLE_CATALOG)) {
  for (const a of angles ?? []) {
    assert(!codes.has(a.code), `duplicate angle code: ${a.code}`)
    codes.add(a.code)
  }
}
console.log(`  ✓ Case 3 — all ${codes.size} angle codes are unique`)

// ─── 4. Code prefix matches domain ─────────────────────────────────────────
// Each code starts with a domain-related prefix matching the catalog key,
// with the exception of shortened aliases (e.g. "internet.*" for
// `internet_culture`, "technology.*" for `technology_ai`, "identity.*"
// for `identity_masculinity`, "hidden.*" for `hidden_history`, "crime.*"
// for `crime_mystery`, "money.*" for `money_career`). The check allows
// either the exact domain prefix or a registered alias.
const aliasMap: Record<string, string> = {
  internet_culture: "internet",
  technology_ai: "technology",
  identity_masculinity: "identity",
  hidden_history: "hidden",
  crime_mystery: "crime",
  money_career: "money",
}
for (const [domain, angles] of Object.entries(DOMAIN_ANGLE_CATALOG)) {
  const expectedPrefix = aliasMap[domain] ?? domain
  for (const a of angles ?? []) {
    const prefix = a.code.split(".")[0]
    assert(
      prefix === expectedPrefix,
      `${domain}: angle code "${a.code}" prefix should be "${expectedPrefix}" got "${prefix}"`,
    )
  }
}
console.log(`  ✓ Case 4 — every code prefix matches its domain`)

// ─── 5. DOMAIN_ANGLE_SEEDS shape ───────────────────────────────────────────
assert(
  DOMAIN_ANGLE_SEEDS.length === totalAngles,
  `seeds length ${DOMAIN_ANGLE_SEEDS.length} != catalog total ${totalAngles}`,
)
for (const s of DOMAIN_ANGLE_SEEDS) {
  assert(s.angle_code, "seed missing angle_code")
  assert(s.category, "seed missing category")
  assert(s.title, "seed missing title")
  assert(s.description, "seed missing description")
  assert(s.freshness === "fresh", "seed freshness should start at 'fresh'")
  assert(s.source === "admin_seeded", "seed source should be 'admin_seeded'")
  assert(s.status === "active", "seed status should be 'active'")
  assert(s.tags.includes(s.category), "seed tags should include its category")
}
console.log(`  ✓ Case 5 — DOMAIN_ANGLE_SEEDS well-formed with fresh status`)

// ─── 6. Simulated loader grouping ─────────────────────────────────────────
// Build a fake topic_bank that contains the seeds at mixed freshness
// levels, then replicate loadGenerationMemory's bucketing + sorting.
//
// `category` on KhatMapTopicBankEntry is `string | null` in the DB — it can
// carry legacy non-domain values such as "invasion" that predate the
// KhatMapTopicDomain union. The loader must reject anything that isn't a
// valid domain, so this test exercises a real runtime type guard rather
// than a type assertion.
const KHAT_MAP_TOPIC_DOMAINS = [
  "philosophy",
  "psychology",
  "relationships",
  "religion",
  "identity_masculinity",
  "money_career",
  "technology_ai",
  "internet_culture",
  "crime_mystery",
  "hidden_history",
  "power_manipulation",
  "parenting",
  "kuwait_gulf",
  "historical",
  "social_issues",
  "modern_society",
  "emotions_inner_life",
  "none",
] as const satisfies readonly KhatMapTopicDomain[]

function isKhatMapTopicDomain(s: string): s is KhatMapTopicDomain {
  return (KHAT_MAP_TOPIC_DOMAINS as readonly string[]).includes(s)
}

function makeEntry(
  category: string | null,
  code: string,
  freshness: KhatMapTopicBankEntry["freshness"],
): KhatMapTopicBankEntry {
  return {
    id: `id-${code}`,
    title: code,
    description: null,
    angle_notes: null,
    angle_code: code,
    episode_type: null,
    category,
    tags: [],
    freshness,
    last_used_season_id: null,
    last_used_at: null,
    usage_count: 0,
    source: "admin_seeded",
    importance_score: null,
    status: "active",
    quality: "normal",
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}
const fakeBank: KhatMapTopicBankEntry[] = [
  makeEntry("psychology", "psychology.a", "deeply_covered"),
  makeEntry("psychology", "psychology.b", "fresh"),
  makeEntry("psychology", "psychology.c", "recently_used"),
  makeEntry("philosophy", "philosophy.a", "lightly_covered"),
  // Legacy non-domain category — the loader must reject this bucket.
  makeEntry("invasion", "invasion.x", "fresh"),
  // Null category — also rejected.
  makeEntry(null, "free.a", "fresh"),
]
const freshnessOrder: Record<KhatMapTopicBankEntry["freshness"], number> = {
  fresh: 0,
  lightly_covered: 1,
  recently_used: 2,
  deeply_covered: 3,
}
const grouped: Partial<Record<KhatMapTopicDomain, KhatMapTopicBankEntry[]>> = {}
for (const t of fakeBank) {
  if (!t.category) continue
  if (!isKhatMapTopicDomain(t.category)) continue
  const bucket = grouped[t.category] ?? []
  bucket.push(t)
  grouped[t.category] = bucket
}
for (const bucket of Object.values(grouped)) {
  bucket?.sort(
    (a, b) => freshnessOrder[a.freshness] - freshnessOrder[b.freshness],
  )
}
// "invasion" is not a member of KhatMapTopicDomain, so by construction it
// cannot appear as a key of `grouped`. We still assert it at runtime by
// scanning the actual keys — that proves the type guard above really did
// reject it, rather than relying on the type system alone.
assert(
  !Object.keys(grouped).includes("invasion"),
  "invasion must be excluded from angles_by_domain",
)
assert(grouped.psychology?.length === 3, "psychology bucket should have 3")
assert(
  grouped.psychology?.[0].freshness === "fresh",
  "psychology bucket should be sorted fresh-first",
)
assert(
  grouped.psychology?.[2].freshness === "deeply_covered",
  "deeply_covered should come last",
)
assert(grouped.philosophy?.length === 1, "philosophy bucket should have 1")
console.log(
  `  ✓ Case 6 — loader bucketing groups by category + excludes invasion + sorts freshness-first`,
)

console.log("\n✅ smoke-domain-angles: all 6 cases passed")
process.exit(0)
