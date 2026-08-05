"use server"

import { revalidatePath } from "next/cache"

import { requireActionRole } from "@/lib/api-utils"
import { getAboutContent, saveAboutContent } from "@/lib/content/static-content"
import type { TeamMember } from "@/types/static-content"

/**
 * The team on `/about` — the first screen that has ever edited it.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `saveAboutContent` was written, exported, and never called by anything. The
 * whole about page — host, values, and the team — could only be changed by a
 * script, so when Khalid asked for photos on 2026-08-06 there was no way for
 * him to add one. Another function with no caller, the same shape as the
 * partner band and `getHomepagePartners`.
 *
 * ── THE READ-MODIFY-WRITE IS THE RISK ──────────────────────────────────────
 * `static_content.about` is ONE json row holding the host block, the values and
 * the team. Every action here loads the whole row, replaces only
 * `teamMembers`, and writes it back — so a bug that returned a partial object
 * would silently erase the host's name and the three value cards along with it.
 * That is why each action spreads `current` rather than constructing a fresh
 * object, and why nothing here takes the whole `AboutPageContent` from the
 * client.
 */

async function writeTeam(members: TeamMember[]) {
  const current = await getAboutContent()
  await saveAboutContent({ ...current, teamMembers: members })
  // `/about` is the page; `/admin/team` is the editor's own list.
  revalidatePath("/about")
  revalidatePath("/admin/about-team")
}

/** Sorted by `order`, which is what both the page and the editor render by. */
export async function listTeamAction(): Promise<TeamMember[]> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const content = await getAboutContent()
  return [...(content.teamMembers ?? [])].sort((a, b) => a.order - b.order)
}

export async function saveMemberAction(member: TeamMember) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)

  if (!member.name.trim()) return { ok: false as const, error: "الاسم مطلوب" }
  if (!member.id.trim()) return { ok: false as const, error: "معرّف العضو مفقود" }

  const current = await getAboutContent()
  const members = [...(current.teamMembers ?? [])]
  const i = members.findIndex((m) => m.id === member.id)

  // Drop empty strings rather than storing them: the page tests these fields
  // for truthiness to decide whether to render a quote, a mail link or a video,
  // and `""` is falsy but still travels through every export and diff.
  const clean: TeamMember = {
    ...member,
    name: member.name.trim(),
    role: member.role.trim(),
    description: member.description.trim(),
    message: member.message?.trim() || undefined,
    videoUrl: member.videoUrl?.trim() || undefined,
    email: member.email?.trim() || undefined,
    socials: (member.socials ?? [])
      .map((s) => ({ platform: s.platform.trim(), url: s.url.trim() }))
      .filter((s) => s.platform && s.url),
  }

  if (i >= 0) members[i] = clean
  else members.push({ ...clean, order: clean.order || members.length + 1 })

  await writeTeam(members)
  return { ok: true as const }
}

export async function deleteMemberAction(id: string) {
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) throw new Error(gate.error)
  const current = await getAboutContent()
  const members = (current.teamMembers ?? []).filter((m) => m.id !== id)
  await writeTeam(members)
  return { ok: true as const }
}

/**
 * Reorder by rewriting every `order` from the given id list.
 *
 * Rewriting ALL of them, not just the moved one: `order` is what both the page
 * and this editor sort by, and two members sharing a number sort
 * unpredictably — the row would appear to jump on reload for no visible reason.
 */
export async function reorderTeamAction(orderedIds: string[]) {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) throw new Error(gate.error)
  const current = await getAboutContent()
  const byId = new Map((current.teamMembers ?? []).map((m) => [m.id, m]))
  const members = orderedIds
    .map((id, i) => {
      const m = byId.get(id)
      return m ? { ...m, order: i + 1 } : null
    })
    .filter((m): m is TeamMember => m !== null)
  // Anything the client did not send keeps its place at the end rather than
  // being dropped — a stale tab must not delete a member it never knew about.
  for (const m of byId.values()) {
    if (!orderedIds.includes(m.id)) members.push({ ...m, order: members.length + 1 })
  }
  await writeTeam(members)
  return { ok: true as const }
}
