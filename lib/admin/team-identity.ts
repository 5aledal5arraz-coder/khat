/**
 * Who a خط team member IS — his name and his *صفحة* (the job he does in the
 * studio) — as opposed to what he is ALLOWED to do.
 *
 * That distinction is the whole point of this module. Before it, both answers
 * were squeezed out of two fields that were never meant to carry them:
 *
 *   - the NAME was `email.split("@")[0]`, recomputed inline at five call sites
 *     (recording actions ×2, the recording page, the Khat Brain recording tab,
 *     the room join route). It leaked the local part of a staff email into the
 *     marker CSV the external editor receives.
 *   - the JOB was read off `admin_users.role`, the permission level. That is
 *     what produced the absurd constraint "the director's account must be
 *     exactly ADMIN, so the OWNER can never be the host". A permission level
 *     and a job description are different facts about a person.
 *
 * ⚠️ ARCHITECTURAL BOUNDARY — `job_title` NEVER grants permission.
 * `admin_users.role` (OWNER/ADMIN/EDITOR/VIEWER) stays the only authority for
 * BOTH action gates: `requireActionRole` (lib/api-utils.ts) and
 * `requireRoomRole` (lib/collaboration/permissions.ts). `job_title` decides
 * which screen a member gets and what label others see, nothing more. If a صفحة
 * could unlock an action, editing a descriptive dropdown on /admin/team would
 * hand the "ابدأ التسجيل" button to anyone — which is exactly what happened
 * while `requireRoomRole` still read `room_participants.role`. See
 * lib/collaboration/room-roles.ts for the room-role side of the same boundary.
 *
 * The catalog lives in code, not in the database: same pattern as
 * QUICK_MARKER_META (lib/recording-v2/marker-types.ts). Pure data, no React and
 * no db import, so server routes, server actions and client components can all
 * import it.
 */

/**
 * Every صفحة on the خط team. One per person (deliberately — multi-role members
 * are deferred, so this is a single value, not a set).
 */
export const JOB_TITLES = [
  "host",
  "director",
  "photographer",
  "sound",
  "producer",
  "editor",
  "viewer",
] as const

export type JobTitle = (typeof JOB_TITLES)[number]

export interface JobTitleMeta {
  title: JobTitle
  /** Arabic label — what the team actually calls this صفحة. */
  label: string
  /** One-line hint shown next to the picker on /admin/team. */
  hint: string
}

export const JOB_TITLE_META: Record<JobTitle, JobTitleMeta> = {
  host: {
    title: "host",
    label: "مقدم",
    hint: "يقود الحلقة أمام الضيف ويشغّل كوكبيت التسجيل",
  },
  director: {
    title: "director",
    label: "مخرج",
    hint: "يدير الجلسة ويعبّي قائمة ما قبل التصوير",
  },
  photographer: {
    title: "photographer",
    label: "مصوّر",
    hint: "الكاميرا والتأطير ولقطات الأولوية",
  },
  sound: {
    title: "sound",
    label: "مهندس صوت",
    hint: "الصوت والمستويات داخل الاستوديو",
  },
  producer: {
    title: "producer",
    label: "منتج",
    hint: "يتابع الإنتاج والجدول خارج الكوكبيت",
  },
  editor: {
    title: "editor",
    label: "محرّر",
    hint: "المونتاج وما بعد التسجيل",
  },
  viewer: {
    title: "viewer",
    label: "مشاهد",
    hint: "متابعة فقط، بدون مهمة في الغرفة",
  },
}

/** Narrowing guard for values arriving from the DB, an API body or a form. */
export function isJobTitle(value: unknown): value is JobTitle {
  return typeof value === "string" && (JOB_TITLES as readonly string[]).includes(value)
}

/**
 * Arabic label for a stored `job_title`, or null when there is none / it is
 * unrecognised. Null means "this member has no صفحة yet" — callers show the
 * permission role or nothing at all, never a guessed job.
 */
export function jobTitleLabel(value: string | null | undefined): string | null {
  return isJobTitle(value) ? JOB_TITLE_META[value].label : null
}

/**
 * The name to show for a team member.
 *
 * Falls back to the email's local part — byte-for-byte what the five inline
 * `email.split("@")[0]` call sites produced — so nothing changes visually for
 * an account whose name Khaled hasn't filled in yet. Every identity display
 * must go through here so there is exactly one fallback rule.
 */
export function resolveMemberName(member: {
  display_name?: string | null
  email?: string | null
}): string {
  const name = member.display_name?.trim()
  if (name) return name
  const local = member.email?.split("@")[0]?.trim()
  return local || "operator"
}

/** Shown instead of a name in files that leave the team. */
export const EXPORT_ANONYMOUS_NAME = "عضو الفريق"

/**
 * The name to put in a file that LEAVES the team — the marker CSV the external
 * editor receives, and anything else distributed outside خط.
 *
 * Deliberately does NOT fall back to the email. `resolveMemberName()` falls back
 * to `email.split("@")[0]`, which is correct inside the admin panel (the viewer
 * is a colleague who needs to know who acted) and wrong in a distributed file:
 * `display_name` is nullable with no backfill, so until every name is filled in
 * that fallback ships the local part of a staff email to an outside contractor.
 *
 * Ladder: the real name → the Arabic صفحة ("المخرج" is useful to an editor) →
 * an anonymous placeholder. Never an email, never an id.
 */
export function exportSafeMemberName(member: {
  display_name?: string | null
  job_title?: string | null
}): string {
  const name = member.display_name?.trim()
  if (name) return name
  return jobTitleLabel(member.job_title) ?? EXPORT_ANONYMOUS_NAME
}
