/**
 * Phase 0 verification — runs via vitest, not standalone Node.
 *
 *   npm test -- tests/prompts/snapshots.test.ts
 *
 * The colocated vitest snapshot test (tests/prompts/snapshots.test.ts)
 * is the canonical proof of byte-equivalence for the Phase 0 prompt-
 * builder consolidation. It uses the project's path-alias resolver
 * (`@/...`) and the project's vitest config.
 *
 * Why no standalone script: Node's --experimental-strip-types runs TS
 * directly but does not resolve TypeScript path aliases. Adding a
 * resolver shim duplicates the bundler's job and creates drift between
 * the verifier and production runtime. Vitest is the right tool; this
 * file exists only as a pointer.
 */
export {}
