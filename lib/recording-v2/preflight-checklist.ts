/**
 * Pre-shoot checklist — catalogue + flow derivation.
 *
 * The 17 items the director confirms before the host may start recording. The
 * CATALOGUE lives here in code (same as `marker-types.ts`), not in the DB: the
 * database only records which key was confirmed, when, and by whom. So editing
 * a label or adding an item is a code change with no migration.
 *
 * Everything below is PURE — no DB, no React, no I/O — so the flow rules and the
 * unlock condition are unit-tested in isolation and the components stay dumb
 * renderers, exactly like `lib/studio/project-stepper.ts`.
 *
 * Why a gate at all: the host's "ابدأ التسجيل" is genuinely blocked until every
 * item is resolved. The cost of shooting an unusable take — flat batteries, an
 * unformatted card, a mismatched white balance across five cameras — is a lost
 * guest, not a lost minute.
 */

// ─── Catalogue ──────────────────────────────────────────────────────────────

export const CHECKLIST_GROUP_KEYS = [
  "media_power",
  "light_set",
  "cameras",
  "matching",
  "sound",
  "final",
] as const

export type ChecklistGroupKey = (typeof CHECKLIST_GROUP_KEYS)[number]

export interface ChecklistItemDef {
  key: string
  group: ChecklistGroupKey
  /** Arabic label shown on the row. */
  label: string
  /** Optional grey sub-line under this row. */
  hint?: string
  /** Optional long-form explanation (title attribute — never hover-ONLY info). */
  tooltip?: string
}

export interface ChecklistGroupDef {
  key: ChecklistGroupKey
  /** Arabic group heading. */
  label: string
  /** Grey reminder line rendered under the whole group's rows. */
  footnote?: string
}

/**
 * `الفلتر` throughout means the Black Mist diffusion filter on the lens. Spelled
 * out in the tooltip so a new operator is never guessing which filter.
 */
const BLACK_MIST_TOOLTIP =
  "الفلتر المقصود: Black Mist (فلتر التنعيم) على العدسة — نفس النوع على كل الكاميرات"

export const CHECKLIST_GROUPS: readonly ChecklistGroupDef[] = [
  { key: "media_power", label: "الميديا والطاقة" },
  { key: "light_set", label: "الإضاءة والمشهد" },
  {
    key: "cameras",
    label: "الكاميرات",
    // One reminder for all five camera rows rather than repeating it per row —
    // the director runs the same five sub-checks on each body.
    footnote: "لكل كاميرا: الفلتر · الفتحة · الكادر · الكارت والبطارية · التسجيل",
  },
  { key: "matching", label: "المطابقة" },
  { key: "sound", label: "الصوت" },
  { key: "final", label: "قبل «أكشن»" },
]

/**
 * The 17 items, in confirmation order. Order matters: `deriveChecklistModel`
 * derives the "current" group from the first unresolved item, so this sequence
 * is the flow.
 */
export const CHECKLIST_ITEMS: readonly ChecklistItemDef[] = [
  // ١· الميديا والطاقة
  {
    key: "media.cards_offloaded_formatted",
    group: "media_power",
    label: "تفريغ كروت الذاكرة من التصوير السابق ثم الفورمات",
  },
  {
    key: "power.batteries",
    group: "media_power",
    label: "بطاريات مشحونة + احتياط — كاميرات وكشافات",
  },
  {
    key: "power.light_mains",
    group: "media_power",
    label: "كهرباء الإضاءة — الكشافات موصولة والوصلات ثابتة",
  },

  // ٢· الإضاءة والمشهد
  { key: "light.placement", group: "light_set", label: "توزيع وتوجيه الإضاءة" },
  {
    key: "set.practical_lamps",
    group: "light_set",
    label: "لمبات الديكور (الخلفية) شغّالة",
  },
  { key: "set.decor", group: "light_set", label: "الديكور مرتّب وجاهز للكادر" },

  // ٣· الكاميرات
  {
    key: "cam.guest_main",
    group: "cameras",
    label: "كام ١ · الضيف (أساسية)",
    tooltip: BLACK_MIST_TOOLTIP,
  },
  {
    key: "cam.guest_zoom",
    group: "cameras",
    label: "كام ٢ · الضيف (زوم)",
    tooltip: BLACK_MIST_TOOLTIP,
  },
  {
    key: "cam.guest_bts",
    group: "cameras",
    label: "كام ٣ · الضيف (كواليس)",
    tooltip: BLACK_MIST_TOOLTIP,
  },
  {
    key: "cam.wide",
    group: "cameras",
    label: "كام ٤ · واسعة",
    tooltip: BLACK_MIST_TOOLTIP,
  },
  {
    key: "cam.host",
    group: "cameras",
    label: "كام ٥ · المقدم",
    tooltip: BLACK_MIST_TOOLTIP,
  },

  // ٤· المطابقة
  {
    key: "match.white_balance",
    group: "matching",
    label: "وايت بالانس موحّد على كل الكاميرات",
    hint: "تأكّد إن الفلتر نفسه على كل الكاميرات",
    tooltip: BLACK_MIST_TOOLTIP,
  },

  // ٥· الصوت
  {
    key: "sound.recorder",
    group: "sound",
    label: "جهاز الصوت جاهز (كارت + مساحة + يسجّل فعلاً)",
  },
  {
    key: "sound.mics",
    group: "sound",
    label: "المايكات: بطاريات + تركيب + اختبار مستويات",
  },

  // ٦· قبل «أكشن»
  { key: "final.ac", group: "final", label: "التكييف مضبوط ومو مسموع في التسجيل" },
  {
    key: "final.focus",
    group: "final",
    label: "الفوكس النهائي بعد جلوس الضيف والمقدم",
  },
  {
    key: "final.test_take",
    group: "final",
    label: "تجربة تسجيل ٣٠ ثانية وسماعها",
  },
]

export const CHECKLIST_TOTAL = CHECKLIST_ITEMS.length

/** Fast membership test — guards against stale DB rows for removed items. */
const ITEM_KEYS = new Set(CHECKLIST_ITEMS.map((i) => i.key))
export function isChecklistItemKey(key: string): boolean {
  return ITEM_KEYS.has(key)
}

/**
 * Canned reasons for waiving an item, plus free text. Kept short on purpose: a
 * long menu invites clicking the first option, and the point is a real answer to
 * "why did we shoot without this?".
 *
 * (Sara's spec asked for "2-3 ready reasons or short text" without naming them;
 * these three are my call — see the report.)
 */
export const NOT_APPLICABLE_REASONS: readonly string[] = [
  "غير متوفّر اليوم",
  "مب مطلوب لهذي الحلقة",
  "معطّل",
]

/** Reasons are stored as free text; bound the length so the column stays sane. */
export const MAX_NA_REASON_LENGTH = 200

// ─── Stored state ───────────────────────────────────────────────────────────

/** One persisted row, narrowed to what the flow needs. */
export interface ChecklistEntry {
  item_key: string
  checked_at: string | Date | null
  checked_by: string | null
  not_applicable_reason: string | null
}

export type ChecklistItemState = "pending" | "done" | "not_applicable"

/**
 * A waived item counts as RESOLVED — the gate asks "has every item been dealt
 * with", not "is every item satisfied". A waiver is a deliberate, attributed
 * decision; leaving it pending is the thing we refuse to shoot over.
 */
export function itemStateFor(entry: ChecklistEntry | undefined): ChecklistItemState {
  if (!entry) return "pending"
  if (entry.not_applicable_reason) return "not_applicable"
  return entry.checked_at ? "done" : "pending"
}

export function isResolved(state: ChecklistItemState): boolean {
  return state !== "pending"
}

// ─── Derived model ──────────────────────────────────────────────────────────

/**
 * Group presentation state:
 *   - "done"     → every item resolved; collapses to one green line
 *   - "current"  → the group being worked; expanded
 *   - "upcoming" → later group; VISIBLE BUT DIMMED, and openable on tap.
 *
 * "upcoming" is deliberately not "locked". Visibility is not permission: the
 * director must be able to see what is coming and to jump ahead when the studio
 * is worked out of order, which happens constantly. Nothing is force-closed.
 */
export type ChecklistGroupState = "done" | "current" | "upcoming"

export interface ChecklistItemModel {
  key: string
  label: string
  hint?: string
  tooltip?: string
  state: ChecklistItemState
  not_applicable_reason: string | null
}

export interface ChecklistGroupModel {
  key: ChecklistGroupKey
  label: string
  footnote?: string
  state: ChecklistGroupState
  items: ChecklistItemModel[]
  resolvedCount: number
  total: number
}

export interface ChecklistModel {
  groups: ChecklistGroupModel[]
  /** Items resolved (checked or waived) out of `total`. */
  resolvedCount: number
  total: number
  /** True only when EVERY item is resolved — the host gate's sole condition. */
  isComplete: boolean
  /**
   * The group the host's locked bar names. Showing "الكاميرات ناقصة" tells the
   * host who to shout at; showing all 17 rows on the host's screen would be
   * someone else's job leaking onto their pre-show read.
   */
  blockingGroupKey: ChecklistGroupKey | null
  blockingGroupLabel: string | null
  /** Most recent confirmation time across all items, ISO — for "آخر تحديث". */
  lastUpdatedAt: string | null
  /** Admin user id of the most recent confirmation. */
  lastUpdatedBy: string | null
}

function toIso(v: string | Date | null): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : v
}

/**
 * Turn persisted rows into the full presentation model. Single source of truth
 * for both screens: the director's checklist and the host's gate read the same
 * derivation, so they can never disagree about whether the studio is ready.
 */
export function deriveChecklistModel(
  entries: readonly ChecklistEntry[],
): ChecklistModel {
  const byKey = new Map<string, ChecklistEntry>()
  for (const e of entries) {
    // Ignore rows for keys no longer in the catalogue — a removed item must not
    // be able to satisfy or block the gate.
    if (isChecklistItemKey(e.item_key)) byKey.set(e.item_key, e)
  }

  let resolvedCount = 0
  let lastUpdatedAt: string | null = null
  let lastUpdatedBy: string | null = null

  const itemModels = CHECKLIST_ITEMS.map((def) => {
    const entry = byKey.get(def.key)
    const state = itemStateFor(entry)
    if (isResolved(state)) resolvedCount++
    const at = toIso(entry?.checked_at ?? null)
    if (at && (!lastUpdatedAt || at > lastUpdatedAt)) {
      lastUpdatedAt = at
      lastUpdatedBy = entry?.checked_by ?? null
    }
    return {
      key: def.key,
      label: def.label,
      hint: def.hint,
      tooltip: def.tooltip,
      state,
      not_applicable_reason: entry?.not_applicable_reason ?? null,
    } satisfies ChecklistItemModel
  })

  const modelByKey = new Map(itemModels.map((m) => [m.key, m]))

  // The current group is the FIRST group holding an unresolved item. Groups
  // before it are done; groups after it are upcoming. Derived rather than
  // stored, so it self-corrects when the director works out of order.
  let currentGroup: ChecklistGroupKey | null = null
  for (const def of CHECKLIST_ITEMS) {
    if (!isResolved(modelByKey.get(def.key)!.state)) {
      currentGroup = def.group
      break
    }
  }

  const currentIdx =
    currentGroup == null ? Infinity : CHECKLIST_GROUP_KEYS.indexOf(currentGroup)

  const groups = CHECKLIST_GROUPS.map((g, i) => {
    const items = itemModels.filter(
      (m) => CHECKLIST_ITEMS.find((d) => d.key === m.key)!.group === g.key,
    )
    const groupResolved = items.filter((m) => isResolved(m.state)).length
    const state: ChecklistGroupState =
      groupResolved === items.length ? "done" : i === currentIdx ? "current" : "upcoming"
    return {
      key: g.key,
      label: g.label,
      footnote: g.footnote,
      state,
      items,
      resolvedCount: groupResolved,
      total: items.length,
    } satisfies ChecklistGroupModel
  })

  const blocking = CHECKLIST_GROUPS.find((g) => g.key === currentGroup) ?? null

  return {
    groups,
    resolvedCount,
    total: CHECKLIST_TOTAL,
    isComplete: resolvedCount === CHECKLIST_TOTAL,
    blockingGroupKey: blocking?.key ?? null,
    blockingGroupLabel: blocking?.label ?? null,
    lastUpdatedAt,
    lastUpdatedBy,
  }
}

// ─── The host gate ──────────────────────────────────────────────────────────

/**
 * What the host's "ابدأ التسجيل" bar should show.
 *
 *   - "ready"        → checklist complete; the CTA behaves exactly as before.
 *   - "blocked"      → incomplete AND a director is connected to finish it.
 *   - "no_director"  → incomplete and NOBODY with the director role is online.
 *                      The host is offered "أكمل التشك-ليست بنفسي" (preferred)
 *                      or a documented emergency override.
 *   - "connecting"   → the stream is still opening (or retrying). We do not know
 *                      the checklist state yet and must NOT say the connection
 *                      is broken. Critically, NO override here: `connecting` is
 *                      the state of every single page load, so offering an
 *                      emergency override in it would teach the host to reach
 *                      for the override as a matter of routine.
 *   - "offline"      → the stream has genuinely given up. Escape hatches appear.
 *
 * The last two exist because a hard gate whose only key is held by someone who
 * is not in the room stops a shoot dead. The gate's job is to prevent an
 * unusable take, not to strand the crew.
 */
export type HostGateState =
  | "ready"
  | "blocked"
  | "no_director"
  | "connecting"
  | "offline"

export function deriveHostGateState(input: {
  model: ChecklistModel
  directorOnline: boolean
  connected: boolean
  /** Still opening or retrying the stream — transient, not a failure. */
  connecting?: boolean
}): HostGateState {
  // Transient first: a page that has not finished connecting is not a page with
  // a broken connection, and must not be handed an emergency override.
  if (!input.connected && input.connecting) return "connecting"
  if (!input.connected) return "offline"
  if (input.model.isComplete) return "ready"
  return input.directorOnline ? "blocked" : "no_director"
}

/**
 * Should the emergency override be offered at all?
 *
 * ONLY when the checklist genuinely cannot be completed through the normal path:
 * no director is reachable, or the stream has given up entirely. Never while a
 * director is connected (`blocked`) — Khaled asked for a real lock, and a third
 * exit available in the normal case would empty it of meaning. Never while
 * `connecting`, which is every page load.
 */
export function allowsOverride(state: HostGateState): boolean {
  return state === "no_director" || state === "offline"
}

/** Can the host press "ابدأ التسجيل" right now? */
export function isRecordingUnlocked(state: HostGateState): boolean {
  return state === "ready"
}

/**
 * Emergency-override reasons. Offered ONLY when no director is connected (or the
 * host is offline) — never as a general shortcut past the checklist.
 */
export const OVERRIDE_REASONS: readonly string[] = [
  "تصوير بلا مخرج",
  "المخرج مب موجود",
  "عطل تقني",
]
