/**
 * Khat Map conversion — shared types.
 *
 * Every conversion function returns a discriminated-union result. The
 * UI and analytics layer never have to guess whether a duplicate was
 * prevented or a fresh record created.
 */

export type ConversionKind =
  | "episode_to_preparation"
  | "guest_to_candidate"
  | "research_to_preparation"

export interface ConversionLink {
  kind: ConversionKind
  /**
   * Downstream record id (preparation id, guest candidate id, etc.).
   */
  target_id: string
  /**
   * Deep-link path the UI can navigate to.
   */
  href: string
  /**
   * Human-readable short label for the link (e.g. "إعداد جديد").
   */
  label: string
  /**
   * When the link was established. ISO.
   */
  converted_at: string
}

export type ConversionResult =
  | {
      ok: true
      /** Fresh conversion just made. */
      created: boolean
      /** Was already converted before this call? Idempotent signal. */
      was_existing: boolean
      link: ConversionLink
      /**
       * A NON-fatal problem that happened after the record was created —
       * today, `prep_v2` generation failing while the preparation row itself
       * landed fine. Arabic, operator-facing.
       *
       * It is deliberately a field on the SUCCESS variant rather than a flip
       * to `ok: false`: the conversion genuinely succeeded, and reporting it
       * as a failure would tell the operator nothing was created while the
       * row (and its back-link) exist — leaving them with no link to open and
       * a bulk run that marks a converted card "failed".
       */
      warning?: string
    }
  | {
      ok: false
      reason:
        | "not_found"
        | "missing_linked_guest"
        | "missing_research_snapshot"
        | "db_error"
        | "conflict"
        | "preparation_not_found"
      message: string
      detail?: string
    }

/**
 * Candidate entry in the conversion-history view. Enough context to render
 * the row without a second query; deeper detail (preparation status,
 * downstream guest status) is joined-in by the query layer.
 */
export interface ConversionHistoryRow {
  kind: ConversionKind
  /** The Khat Map candidate id (episode or guest). */
  source_id: string
  source_title: string
  source_type: "episode_candidate" | "guest_candidate" | "research_snapshot"
  target_id: string
  target_label: string
  target_href: string
  /** Downstream record status (if we can read it). */
  downstream_status: string | null
  /** Downstream record's current stage or lifecycle state. */
  downstream_stage: string | null
  converted_at: string
}
