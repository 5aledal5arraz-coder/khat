export * from "./episodes"
export * from "./guests"
export * from "./studio"
export * from "./content"
export * from "./system"
export * from "./partnerships"
export * from "./newsletter"
export * from "./admin-auth"
export * from "./audio-platforms"
export * from "./sponsorship-ai"
export * from "./guest-ai"
export * from "./guest-prep"
export * from "./guest-candidates"
export * from "./preparation"
export * from "./collaboration"
export * from "./khat-map"

// ─── Khat Brain core ────────────────────────────────────────────────────
export * from "./eir"
export * from "./ai-runs"
export * from "./jobs"
export * from "./studio-analysis"
export * from "./discovery"
export * from "./market-intelligence"
export * from "./editorial-intelligence"

// Phase 1.7 — these four schema files have pgTable definitions but
// were never wired into the schema index, so drizzle-kit push has
// been silently skipping them. Adding them ensures db:push creates
// guest_identity_profiles, hybrid_topics_*, original_thinking_*,
// and performance_signals_* tables on every local DB sync.
export * from "./guest-identity"
export * from "./hybrid-topics"
export * from "./original-thinking"
export * from "./performance-signals"

// ─── Phase 1.3 — JSONB drift telemetry ──────────────────────────────────
export * from "./jsonb-validation-events"

// ─── Phase 1.5 — Retention roll-up ──────────────────────────────────────
export * from "./ai-runs-summary"

// ─── Phase 1.6 — AI rate-limit audit ────────────────────────────────────
export * from "./ai-rate-limit-events"
export * from "./ai-subject-locks"

// ─── Phase 2.1 — EIR invalid-transition audit (P2.1.a) ─────────────────
export * from "./eir-invalid-transition-attempts"

// ─── Phase 2.3 — Unified system events log (P2.3.a) ────────────────────
export * from "./system-events"

// ─── Phase Beta — Editorial voice fingerprint capture ─────────────────
export * from "./editorial-voice"

export * from "./relations"
