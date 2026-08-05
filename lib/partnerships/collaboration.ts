/**
 * The collaboration types a sponsor can ask for — one list, for the form that
 * offers them and the admin that reads them back.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * There were two lists. The public form offered eight values; the admin kept
 * its own `COLLABORATION_LABELS` map with a partly different set. They had
 * already drifted in both directions:
 *
 *   · the form sent `not_sure` and `custom_strategic`, which the admin had no
 *     label for — so those leads displayed a raw key like `not_sure`, and
 *     `not_sure` is precisely the lead most worth reading carefully.
 *   · the admin carried `multiple_episodes` and `other`, which the form never
 *     sent at all.
 *
 * A label map that lives beside the thing it labels cannot drift. This one is
 * the only place either side reads.
 *
 * ── OFFERED vs KNOWN ───────────────────────────────────────────────────────
 * `COLLABORATION_OPTIONS` is what the form offers TODAY. `COLLABORATION_LABELS`
 * covers those AND every value ever stored, because rows outlive menus: a lead
 * that asked for a live event in 2026 must still read as «فعالية حية» in the
 * admin after we stop offering live events. Retiring an option means removing
 * it from OPTIONS and leaving it in LABELS — never deleting the label.
 */

export interface CollaborationOption {
  value: string
  label: string
}

/**
 * What the form offers, in the order the packages appear on /partner.
 *
 * These ARE the packages. The form used to offer «حلقة بتوقيع مشترك»,
 * «شراكة استراتيجية مخصّصة», «حضور على الموقع», «محتوى على المنصات» and
 * «فعالية حية» — five things the page does not sell, and three of which are
 * simply part of every package rather than a choice. A company could ask for a
 * live event and receive a reply explaining that we do not do those, which is a
 * bad first exchange we were causing ourselves.
 */
export const COLLABORATION_OPTIONS: CollaborationOption[] = [
  { value: "episode_partnership", label: "رعاية حلقة" },
  { value: "multiple_episodes", label: "رعاية 5 حلقات" },
  { value: "season_partnership", label: "شريك الموسم" },
  { value: "promo_video", label: "إضافة فيديو دعائي داخل الحلقة" },
  { value: "not_sure", label: "غير متأكد بعد — أرشدونا" },
]

/** Every value that can appear on a stored lead, current or retired. */
export const COLLABORATION_LABELS: Record<string, string> = {
  ...Object.fromEntries(COLLABORATION_OPTIONS.map((o) => [o.value, o.label])),
  // Retired — kept so old leads still read as what they actually asked for.
  collaborative_episode: "حلقة بتوقيع مشترك",
  custom_strategic: "شراكة استراتيجية مخصّصة",
  website_presence: "حضور على الموقع",
  social_media_content: "محتوى على المنصات",
  live_event: "فعالية حية",
  other: "أخرى",
}

/** The value that means "we do not know yet" — budget is optional for it. */
export const UNDECIDED = "not_sure"

export function collaborationLabel(value: string): string {
  return COLLABORATION_LABELS[value] ?? value
}
