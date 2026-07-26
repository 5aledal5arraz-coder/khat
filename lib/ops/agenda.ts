/**
 * `/admin/ops` — «الأيام الجاية»: every dated commitment, in one list.
 *
 * WHY THIS SECTION EXISTS
 * -----------------------
 * Three tables carry a date the operator is expected to act on, and NOT ONE of
 * them had a cross-record reader. `crm_tasks.due_at` is the starkest case: the
 * column exists, it is indexed on `(status, due_at)`, and the only way to see
 * a due follow-up is to already be looking at the record it hangs off. A
 * reminder nobody can enumerate is a reminder that gets missed silently — the
 * exact failure mode «الوارد» was built to end for the human queues.
 *
 * THE THREE SOURCES, and why each predicate is what it is:
 *   • `episode_intelligence_records.recording_scheduled_at` — the planned
 *     FILMING date. Archived records are excluded: an archived episode is not
 *     a commitment. (This column is admin-only and must never reach a public
 *     surface — see the note on it in `lib/db/schema/eir.ts`.)
 *   • `episode_enrichments.scheduled_for` where the enrichment is NOT yet
 *     published. A row that is already `published` has nothing pending, so a
 *     future `scheduled_for` on it is history, not an obligation. The status
 *     is read with `COALESCE(...,'published')` to match `isEnrichmentPublic()`
 *     in `lib/episodes/enrichments.ts`, whose inert-first rule treats a
 *     missing status as published.
 *   • `crm_tasks` with `status='open'` and a `due_at`. Done and dismissed
 *     tasks are not commitments.
 *
 * DELIBERATELY NOT A SOURCE: `episodes.release_date`. It is NOT a publish
 * gate — a future-dated episode row is already visible to the public — so
 * reading it here would report as "upcoming" work that has in fact shipped.
 * There is no "target publish date" column in the schema, and this section
 * introduces no migration to add one.
 *
 * THE WINDOW. The forward edge is 14 days: past that, a date is a plan, not
 * something to act on today. There is NO backward edge. An overdue commitment
 * does not stop mattering because it aged out of a window — dropping it would
 * rebuild the silent-miss this section exists to fix — so overdue rows are
 * always included and, being the earliest dates, an ascending sort puts them
 * on top where they belong.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/** Forward edge of the window, in days. */
export const AGENDA_WINDOW_DAYS = 14

/** Rows rendered. The card is a glance, not a task manager. */
export const AGENDA_ROW_LIMIT = 6

export type AgendaKind = "recording" | "enrichment" | "task"

/** A raw row as the SQL returns it, before any display decision. */
export interface AgendaRow {
  kind: AgendaKind
  /** The record to open — an EIR id, an episode id, or a CRM task id. */
  id: string
  title: string
  /** ISO 8601. */
  due_at: string
  /** `crm_tasks.subject_kind` — present on tasks only, it picks the route. */
  subject_kind: string | null
  /** `crm_tasks.subject_id` — the record the task hangs off. */
  subject_id: string | null
}

/** `null` = the agenda could not be read. NEVER render that as "nothing due". */
export type AgendaRows = AgendaRow[] | null

/**
 * The whole agenda in ONE statement — same reasoning as `INBOX_COUNTS_SQL`:
 * this page is where every admin session lands, and three awaits is three
 * times the latency. Exported so a test can assert the exact predicates;
 * they are the feature, and a silent edit to one turns the section into a
 * list that lies.
 *
 * `LIMIT` is `AGENDA_ROW_LIMIT + 1`: one row past what is rendered, which is
 * exactly enough to know whether to say "and there are more" without a second
 * COUNT round-trip.
 *
 * The window and the limit are spliced from the constants above with
 * `sql.raw` — they are module-level integers, never input — so the SQL and
 * the documented numbers cannot drift apart.
 */
const WINDOW = sql.raw(`interval '${AGENDA_WINDOW_DAYS} days'`)
const FETCH_LIMIT = sql.raw(String(AGENDA_ROW_LIMIT + 1))

export const AGENDA_SQL = sql`
  SELECT kind, id, title, due_at, subject_kind, subject_id
  FROM (
    SELECT
      'recording' AS kind,
      e.id AS id,
      e.working_title AS title,
      e.recording_scheduled_at AS due_at,
      NULL::text AS subject_kind,
      NULL::text AS subject_id
    FROM episode_intelligence_records e
    WHERE e.recording_scheduled_at IS NOT NULL
      AND e.archived_at IS NULL
      AND e.recording_scheduled_at <= now() + ${WINDOW}
    UNION ALL
    SELECT
      'enrichment' AS kind,
      en.episode_id AS id,
      COALESCE(ep.title, en.episode_id) AS title,
      en.scheduled_for AS due_at,
      NULL::text AS subject_kind,
      NULL::text AS subject_id
    FROM episode_enrichments en
    LEFT JOIN episodes ep ON ep.id = en.episode_id
    WHERE en.scheduled_for IS NOT NULL
      AND COALESCE(en.publish_status, 'published') <> 'published'
      AND en.scheduled_for <= now() + ${WINDOW}
    UNION ALL
    SELECT
      'task' AS kind,
      t.id AS id,
      t.title AS title,
      t.due_at AS due_at,
      t.subject_kind AS subject_kind,
      t.subject_id AS subject_id
    FROM crm_tasks t
    WHERE t.status = 'open'
      AND t.due_at IS NOT NULL
      AND t.due_at <= now() + ${WINDOW}
  ) agenda
  ORDER BY due_at ASC
  LIMIT ${FETCH_LIMIT}
`

export async function getAgendaRows(): Promise<AgendaRows> {
  if (!db) return null
  try {
    const res = await db.execute(AGENDA_SQL)
    const out: AgendaRow[] = []
    for (const raw of res.rows as Record<string, unknown>[]) {
      const due = raw.due_at
      const at =
        due instanceof Date
          ? due.toISOString()
          : typeof due === "string"
            ? due
            : null
      // A row we cannot date is a row we cannot place. Skipping it is right —
      // it can only have come from a NULL that the WHERE clause excludes.
      if (!at || typeof raw.id !== "string" || typeof raw.kind !== "string") continue
      out.push({
        kind: raw.kind as AgendaKind,
        id: raw.id,
        title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "بلا عنوان",
        due_at: at,
        subject_kind: typeof raw.subject_kind === "string" ? raw.subject_kind : null,
        subject_id: typeof raw.subject_id === "string" ? raw.subject_id : null,
      })
    }
    return out
  } catch (e) {
    console.error("getAgendaRows exception:", e)
    return null
  }
}

// ─── Display derivation (pure) ───────────────────────────────────────

/** Arabic name for what kind of commitment a row is. */
export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  recording: "تصوير",
  enrichment: "نشر محتوى الحلقة",
  task: "متابعة",
}

export interface AgendaItem extends AgendaRow {
  /** Due date has passed. Renders the warning marker and sorts first. */
  overdue: boolean
  kindLabel: string
  /** Where the row opens — the record the date belongs to. */
  href: string
}

export interface Agenda {
  items: AgendaItem[]
  /** More rows matched than are rendered — say so instead of hiding them. */
  hasMore: boolean
}

/**
 * A CRM task links to its SUBJECT's record page, because that is where the
 * task is actually actionable (there is no standalone task view). An unknown
 * subject kind falls back to the record-less home rather than a 404 route.
 */
function taskHref(subjectKind: string | null, subjectId: string | null): string {
  if (!subjectId) return "/admin/ops"
  switch (subjectKind) {
    case "guest":
      return `/admin/casting/${subjectId}`
    case "partner":
      return `/admin/partnerships/${subjectId}`
    case "community":
      return `/admin/community/${subjectId}`
    default:
      return "/admin/ops"
  }
}

function hrefFor(row: AgendaRow): string {
  switch (row.kind) {
    case "recording":
      return `/admin/khat-brain/episodes/${row.id}?tab=recording`
    case "enrichment":
      return `/admin/episodes/${row.id}`
    case "task":
      return taskHref(row.subject_kind, row.subject_id)
  }
}

/**
 * Rows in, display items out. Ascending by date — which is also what puts
 * overdue first, since an overdue date is by definition the earliest one.
 * Kept out of the component so the window, the cap, the overdue rule and the
 * empty state are unit-testable.
 *
 * `now` is injectable so the overdue boundary is deterministic in tests.
 */
export function buildAgenda(rows: AgendaRows, now: number = Date.now()): Agenda | null {
  if (rows === null) return null
  const sorted = [...rows].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
  const items = sorted.slice(0, AGENDA_ROW_LIMIT).map((row) => ({
    ...row,
    overdue: Date.parse(row.due_at) < now,
    kindLabel: AGENDA_KIND_LABEL[row.kind] ?? row.kind,
    href: hrefFor(row),
  }))
  return { items, hasMore: sorted.length > AGENDA_ROW_LIMIT }
}
