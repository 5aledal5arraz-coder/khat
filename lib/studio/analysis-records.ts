/**
 * Khat Brain Phase 4 — Studio analysis records repository.
 *
 * Single persistence module for the consolidated `studio_analysis_records`
 * table. Lib/studio/{chapters,clips,deep-analysis,guest-intelligence}.ts
 * call into this module instead of touching the legacy `studio_*` tables.
 *
 * Validation strategy: lightweight at the repo boundary. Each domain
 * shape is documented in `lib/studio/types.ts` (existing). The repo
 * checks `data` is an object and `kind` is in the enum. Stricter
 * per-kind validation is the caller's responsibility for now —
 * documented in the Phase 4 report.
 *
 * The legacy tables intentionally still exist; nothing here drops or
 * dual-writes. Callers that have migrated read+write through this
 * module exclusively. Callers that haven't migrated keep using the
 * legacy tables until Phase 5+.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  studioAnalysisRecords,
  STUDIO_ANALYSIS_KINDS,
  type StudioAnalysisKind,
  type StudioAnalysisStatus,
} from "@/lib/db/schema/studio-analysis"

type Row = typeof studioAnalysisRecords.$inferSelect

export interface StudioAnalysisRecord {
  id: string
  eir_id: string | null
  studio_session_id: string | null
  kind: StudioAnalysisKind
  status: StudioAnalysisStatus
  data: Record<string, unknown>
  raw_provider_response: Record<string, unknown> | null
  error: string | null
  edited_fields: Record<string, unknown> | null
  generated_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

function mapRow(r: Row): StudioAnalysisRecord {
  return {
    id: r.id,
    eir_id: r.eir_id,
    studio_session_id: r.studio_session_id,
    kind: r.kind as StudioAnalysisKind,
    status: r.status as StudioAnalysisStatus,
    data: (r.data ?? {}) as Record<string, unknown>,
    raw_provider_response: (r.raw_provider_response ?? null) as Record<string, unknown> | null,
    error: r.error,
    edited_fields: (r.edited_fields ?? null) as Record<string, unknown> | null,
    generated_at: r.generated_at ? r.generated_at.toISOString() : null,
    published_at: r.published_at ? r.published_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }
}

function assertKind(kind: string): StudioAnalysisKind {
  if (!(STUDIO_ANALYSIS_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`studio analysis: unknown kind "${kind}"`)
  }
  return kind as StudioAnalysisKind
}

export interface UpsertStudioAnalysisInput {
  /** Either studio_session_id OR eir_id (or both) must be set. */
  studio_session_id?: string | null
  eir_id?: string | null
  kind: StudioAnalysisKind
  status?: StudioAnalysisStatus
  data: Record<string, unknown>
  raw_provider_response?: Record<string, unknown> | null
  error?: string | null
  edited_fields?: Record<string, unknown> | null
  generated_at?: Date | null
  published_at?: Date | null
  /**
   * When true (default), an existing row for the same
   * (studio_session_id, kind) pair is replaced. When false, a fresh
   * row is inserted (multiple history records per kind).
   */
  replace?: boolean
}

/**
 * Upsert by (studio_session_id, kind). Mirrors the legacy "delete then
 * insert" idiom that lib/studio/chapters.ts etc. use.
 *
 * If neither studio_session_id nor eir_id is set, throws.
 */
export async function upsertStudioAnalysisRecord(
  input: UpsertStudioAnalysisInput,
): Promise<StudioAnalysisRecord> {
  if (!input.studio_session_id && !input.eir_id) {
    throw new Error(
      "upsertStudioAnalysisRecord: at least one of studio_session_id or eir_id must be set",
    )
  }
  if (typeof input.data !== "object" || input.data === null) {
    throw new Error("upsertStudioAnalysisRecord: data must be a JSON object")
  }
  const kind = assertKind(input.kind)
  const replace = input.replace !== false

  const values = {
    eir_id: input.eir_id ?? null,
    studio_session_id: input.studio_session_id ?? null,
    kind,
    status: input.status ?? "ready",
    data: input.data,
    raw_provider_response: input.raw_provider_response ?? null,
    error: input.error ?? null,
    edited_fields: input.edited_fields ?? null,
    generated_at: input.generated_at ?? null,
    published_at: input.published_at ?? null,
  }

  // Replace + session-keyed records are unique on (studio_session_id, kind):
  // upsert ATOMICALLY via ON CONFLICT (the partial unique index) so two
  // concurrent same-kind writes (e.g. an SSE retry racing the original) can't
  // leave duplicate rows — the previous DELETE-then-INSERT was non-atomic.
  // Append-mode (push_log) and eir-keyed records fall through to a plain insert.
  const [row] =
    replace && input.studio_session_id && kind !== "push_log"
      ? await db!
          .insert(studioAnalysisRecords)
          .values(values)
          .onConflictDoUpdate({
            target: [studioAnalysisRecords.studio_session_id, studioAnalysisRecords.kind],
            targetWhere: sql`studio_session_id IS NOT NULL AND kind <> 'push_log'`,
            set: {
              status: values.status,
              data: values.data,
              raw_provider_response: values.raw_provider_response,
              error: values.error,
              edited_fields: values.edited_fields,
              generated_at: values.generated_at,
              published_at: values.published_at,
              updated_at: new Date(),
            },
          })
          .returning()
      : await db!.insert(studioAnalysisRecords).values(values).returning()
  return mapRow(row)
}

/** Get the most-recent record for a (studio_session_id, kind) pair. */
export async function getStudioAnalysisRecord(
  studio_session_id: string,
  kind: StudioAnalysisKind,
): Promise<StudioAnalysisRecord | null> {
  const rows = await db!
    .select()
    .from(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.studio_session_id, studio_session_id),
        eq(studioAnalysisRecords.kind, kind),
      ),
    )
    .orderBy(desc(studioAnalysisRecords.created_at))
    .limit(1)
  return rows[0] ? mapRow(rows[0]) : null
}

export interface ListStudioAnalysisOptions {
  studio_session_id?: string
  eir_id?: string
  kinds?: StudioAnalysisKind[]
  status?: StudioAnalysisStatus
  limit?: number
}

export async function listStudioAnalysisRecords(
  opts: ListStudioAnalysisOptions = {},
): Promise<StudioAnalysisRecord[]> {
  const conditions = []
  if (opts.studio_session_id)
    conditions.push(eq(studioAnalysisRecords.studio_session_id, opts.studio_session_id))
  if (opts.eir_id) conditions.push(eq(studioAnalysisRecords.eir_id, opts.eir_id))
  if (opts.kinds && opts.kinds.length > 0)
    conditions.push(inArray(studioAnalysisRecords.kind, opts.kinds))
  if (opts.status) conditions.push(eq(studioAnalysisRecords.status, opts.status))

  const rows = await db!
    .select()
    .from(studioAnalysisRecords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(studioAnalysisRecords.created_at))
    .limit(opts.limit ?? 200)
  return rows.map(mapRow)
}

export async function deleteStudioAnalysisRecord(
  studio_session_id: string,
  kind: StudioAnalysisKind,
): Promise<number> {
  const rows = await db!
    .delete(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.studio_session_id, studio_session_id),
        eq(studioAnalysisRecords.kind, kind),
      ),
    )
    .returning({ id: studioAnalysisRecords.id })
  return rows.length
}

/**
 * Look up the EIR linked to a studio_sessions row. Helper for callers
 * that want to stamp eir_id on the analysis record without duplicating
 * the SELECT. Returns null silently for non-UUID inputs (the legacy
 * studio_sessions table uses uuid PKs; tests and synthetic ids may
 * pass arbitrary strings).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveEirIdForSession(
  studio_session_id: string,
): Promise<string | null> {
  if (!UUID_REGEX.test(studio_session_id)) return null
  try {
    const { studioSessions } = await import("@/lib/db/schema/studio")
    const rows = await db!
      .select({ eir_id: studioSessions.eir_id })
      .from(studioSessions)
      .where(eq(studioSessions.id, studio_session_id))
      .limit(1)
    return rows[0]?.eir_id ?? null
  } catch {
    return null
  }
}

/**
 * Stats helper for the dashboard — counts by kind across all sessions.
 */
export async function countStudioAnalysisByKind(): Promise<
  Record<StudioAnalysisKind, number>
> {
  const out = {} as Record<StudioAnalysisKind, number>
  for (const k of STUDIO_ANALYSIS_KINDS) out[k] = 0
  const rows = await db!
    .select({
      kind: studioAnalysisRecords.kind,
    })
    .from(studioAnalysisRecords)
  for (const r of rows) {
    const k = r.kind as StudioAnalysisKind
    if (k in out) out[k]++
  }
  return out
}
