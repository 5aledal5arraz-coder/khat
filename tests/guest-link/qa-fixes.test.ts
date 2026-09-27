/**
 * «نسخة الضيف» — regressions for noura's QA findings on f1ad291/bc65db2:
 *   1. «تعديل إجاباتي» no longer erases legacy answers the prep still reads.
 *   2. Arabic-Indic / Persian digits, spaces and dashes in a WhatsApp number.
 *   3. The house photo the guest sees is the PUBLISHED one, and a replaced or
 *      removed file is deleted only once the snapshot no longer shows it.
 *   5. Opens counted per visit; .ics lines folded at 75 octets.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── A fake db that runs the service's real transaction code ──────────────
const fake = vi.hoisted(() => ({
  stored: null as null | Record<string, unknown>,
  sets: [] as Record<string, unknown>[],
  deleted: [] as string[],
  updateMatches: true,
}))

vi.mock("@/lib/db", () => {
  const tx = {
    select: () => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.where = () => chain
      chain.for = () => chain
      chain.limit = async () => (fake.stored ? [fake.stored] : [])
      return chain
    },
    update: () => {
      const chain: Record<string, unknown> = {}
      chain.set = (v: Record<string, unknown>) => {
        fake.sets.push(v)
        return chain
      }
      chain.where = () => chain
      chain.returning = async () => (fake.updateMatches ? [{ id: "link-1" }] : [])
      return chain
    },
  }
  return {
    db: { ...tx, transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) },
    pool: {},
    USE_DB: true,
  }
})

vi.mock("@/lib/guest-link/house-photo", () => ({
  deleteHousePhoto: vi.fn(async (name: string | null) => {
    if (name) fake.deleted.push(name)
  }),
  readHousePhoto: vi.fn(async () => null),
}))

import {
  isNewGuestVisit,
  GUEST_OPEN_SESSION_MS,
  setHousePhoto,
  submitGuestQuestionnaire,
  writePublishedSnapshot,
} from "@/lib/guest-link/service"
import {
  guestQuestionnaireDraftSchema,
  guestQuestionnaireSubmitSchema,
  isValidWhatsappNumber,
  mergeQuestionnaireEdit,
  normalizeWhatsappNumber,
} from "@/lib/validation/guest-link"
import { guestPreferencesFromQuestionnaire } from "@/lib/preparation/v2/guest-preferences"
import {
  parseGuestRefMap,
  publishedHousePhoto,
  toGuestPrepView,
  unreferencedHousePhotos,
} from "@/lib/guest-link/view"
import { foldIcsLine, buildRecordingIcs } from "@/lib/guest-link/ics"
import type { GuestLinkQuestionnaire, GuestPrepView } from "@/types/database"

const OLD = "aaaaaaaaaaaaaaaa.jpg"
const NEW = "bbbbbbbbbbbbbbbb.jpg"
const NEWER = "cccccccccccccccc.png"
const VIEW_WITH_PHOTO = { v: 1, schedule_at: null, location: { label: null, address: "x", map_url: null, has_photo: true }, axes: [] }
const VIEW_NO_PHOTO = { ...VIEW_WITH_PHOTO, location: { ...VIEW_WITH_PHOTO.location, has_photo: false } }

beforeEach(() => {
  fake.stored = null
  fake.sets = []
  fake.deleted = []
  fake.updateMatches = true
})

// ── 1 ────────────────────────────────────────────────────────────────────
describe("«تعديل إجاباتي» keeps the legacy answers the prep generator reads", () => {
  const LEGACY_STORED = {
    honorific: "د.",
    kunya: "بو فهد",
    phone_whatsapp: "+96599990000",
    preferred_drink: "قهوة",
    topics_excited_about: "القيادة في الأزمات",
    sensitivities_to_avoid: "الطلاق",
    full_name: "فهد",
  }
  const EDIT = guestQuestionnaireSubmitSchema.parse({
    honorific: "خبير إداري",
    kunya: "بو فهد",
    phone_whatsapp: "+965 9999 1111",
    preferred_drink: "شاي",
    arrival_confirmation: true,
    // A stale tab may still POST these — the schema drops them.
    topics_excited_about: "محاولة كتابة فوق المخزن",
  })

  it("pure merge: edit wins for its keys; legacy keys come only from what was stored", () => {
    const merged = mergeQuestionnaireEdit(LEGACY_STORED, EDIT as unknown as Record<string, unknown>)
    expect(merged).toMatchObject({ honorific: "خبير إداري", preferred_drink: "شاي", phone_whatsapp: "+96599991111" })
    expect(merged.topics_excited_about).toBe("القيادة في الأزمات")
    expect(merged.sensitivities_to_avoid).toBe("الطلاق")
    expect(merged.full_name).toBe("فهد")
    // A first submission (nothing stored) carries no legacy keys at all.
    expect(mergeQuestionnaireEdit(null, { a: 1 })).toEqual({ a: 1 })
  })

  it("the service writes the merged answers — and the prep still sees «avoid» after the edit", async () => {
    fake.stored = { questionnaire: LEGACY_STORED }
    const ok = await submitGuestQuestionnaire("link-1", EDIT as GuestLinkQuestionnaire)
    expect(ok).toBe(true)
    const written = fake.sets[0].questionnaire as Record<string, unknown>
    expect(written.honorific).toBe("خبير إداري")
    const prefs = guestPreferencesFromQuestionnaire(written)
    expect(prefs?.avoid).toBe("الطلاق")
    expect(prefs?.excited_about).toBe("القيادة في الأزمات")
  })

  it("revoked between read and write ⇒ false, nothing written", async () => {
    fake.stored = null
    expect(await submitGuestQuestionnaire("link-1", EDIT as GuestLinkQuestionnaire)).toBe(false)
    expect(fake.sets).toHaveLength(0)
  })
})

// ── 2 ────────────────────────────────────────────────────────────────────
describe("WhatsApp numbers in any digit set", () => {
  const base = { honorific: "خبير", kunya: "بو محمد", preferred_drink: "قهوة", arrival_confirmation: true }

  it.each([
    ["+٩٦٥ ٩٩٩٩ ٠٠٠٠", "+96599990000"],
    ["۹۶۵-۹۹۹۹-۰۰۰۰", "96599990000"],
    ["+965 (9999) 00-00", "+96599990000"],
    ["‏+965 9999–0000", "+96599990000"],
    ["＋٩٦٥٩٩٩٩٠٠٠٠", "+96599990000"],
  ])("%s → %s, accepted and stored normalised", (typed, stored) => {
    expect(normalizeWhatsappNumber(typed)).toBe(stored)
    expect(isValidWhatsappNumber(typed)).toBe(true)
    const r = guestQuestionnaireSubmitSchema.safeParse({ ...base, phone_whatsapp: typed })
    expect(r.success && r.data.phone_whatsapp).toBe(stored)
  })

  it("still rejects what is not a number", () => {
    for (const bad of ["abc", "12", "+965 99x9 0000", "++96599990000", ""]) {
      expect(isValidWhatsappNumber(bad)).toBe(false)
      expect(guestQuestionnaireSubmitSchema.safeParse({ ...base, phone_whatsapp: bad }).success).toBe(false)
    }
  })

  it("draft autosave normalises too but never rejects a half-typed number", () => {
    const r = guestQuestionnaireDraftSchema.parse({ step: 0, draft: { phone_whatsapp: "٩٦٥ ٩" } })
    expect(r.draft.phone_whatsapp).toBe("9659")
  })
})

// ── 3 ────────────────────────────────────────────────────────────────────
describe("house photo: the guest sees the PUBLISHED file", () => {
  it("publish records the file in the server-only ref map, never in the view", () => {
    const { view, refs } = toGuestPrepView({
      prep: null,
      schedule_at: null,
      show_schedule: false,
      location: { location_label: null, address: "x", map_url: null, house_photo: OLD },
    })
    expect(refs.house_photo).toBe(OLD)
    expect(JSON.stringify(view)).not.toContain(OLD)
    expect(parseGuestRefMap(JSON.parse(JSON.stringify(refs))).house_photo).toBe(OLD)
  })

  it("serves the snapshot's file, not the live column (replaced / removed / unpublished)", () => {
    const pub = { published_view: VIEW_WITH_PHOTO, published_ref_map: { axes: {}, samples: {}, house_photo: OLD } }
    expect(publishedHousePhoto({ ...pub, house_photo: NEW })).toBe(OLD) // replaced, not republished
    expect(publishedHousePhoto({ ...pub, house_photo: null })).toBe(OLD) // removed, not republished
    expect(
      publishedHousePhoto({ published_view: VIEW_NO_PHOTO, published_ref_map: { house_photo: null }, house_photo: NEW }),
    ).toBeNull() // uploaded after publish: invisible until republished
    expect(publishedHousePhoto({ published_view: null, published_ref_map: null, house_photo: NEW })).toBeNull()
  })

  it("a snapshot from before the key existed falls back to the live file it was showing", () => {
    expect(
      publishedHousePhoto({ published_view: VIEW_WITH_PHOTO, published_ref_map: { axes: {}, samples: {} }, house_photo: OLD }),
    ).toBe(OLD)
  })

  it("unreferencedHousePhotos keeps anything still named", () => {
    expect(unreferencedHousePhotos([OLD], [NEW, OLD])).toEqual([])
    expect(unreferencedHousePhotos([OLD, null, OLD], [NEW])).toEqual([OLD])
  })

  it("replace while the snapshot shows the old file ⇒ old file KEPT", async () => {
    fake.stored = {
      house_photo: OLD,
      published_view: VIEW_WITH_PHOTO,
      published_ref_map: { axes: {}, samples: {}, house_photo: OLD },
    }
    expect(await setHousePhoto("link-1", NEW)).toBe(true)
    expect(fake.sets[0].house_photo).toBe(NEW)
    expect(fake.deleted).toEqual([])
  })

  it("replace an unpublished upload ⇒ the replaced file is deleted", async () => {
    fake.stored = {
      house_photo: NEW,
      published_view: VIEW_WITH_PHOTO,
      published_ref_map: { axes: {}, samples: {}, house_photo: OLD },
    }
    expect(await setHousePhoto("link-1", NEWER)).toBe(true)
    expect(fake.deleted).toEqual([NEW])
  })

  it("remove with no snapshot ⇒ file deleted", async () => {
    fake.stored = { house_photo: OLD, published_view: null, published_ref_map: null }
    expect(await setHousePhoto("link-1", null)).toBe(true)
    expect(fake.sets[0].house_photo).toBeNull()
    expect(fake.deleted).toEqual([OLD])
  })

  it("legacy snapshot: the live file is frozen into the ref map before it changes", async () => {
    fake.stored = { house_photo: OLD, published_view: VIEW_WITH_PHOTO, published_ref_map: { axes: {}, samples: {} } }
    await setHousePhoto("link-1", null)
    expect((fake.sets[0].published_ref_map as Record<string, unknown>).house_photo).toBe(OLD)
    expect(fake.deleted).toEqual([])
  })

  it("a failed row write deletes nothing", async () => {
    fake.stored = { house_photo: OLD, published_view: null, published_ref_map: null }
    fake.updateMatches = false
    expect(await setHousePhoto("link-1", null)).toBe(false)
    expect(fake.deleted).toEqual([])
  })

  it("republish frees the file only the OLD snapshot was keeping alive", async () => {
    fake.stored = {
      house_photo: NEW,
      published_view: VIEW_WITH_PHOTO,
      published_ref_map: { axes: {}, samples: {}, house_photo: OLD },
    }
    const snap = {
      view: VIEW_WITH_PHOTO as GuestPrepView,
      refs: { axes: {}, samples: {}, house_photo: NEW },
      by: "t",
      prepId: null,
      prepUpdatedAt: null,
      scheduleAt: null,
    }
    expect(await writePublishedSnapshot("link-1", snap)).toBe(true)
    expect(fake.deleted).toEqual([OLD])

    // Republishing the same file deletes nothing.
    fake.deleted = []
    fake.stored = { house_photo: NEW, published_view: VIEW_WITH_PHOTO, published_ref_map: snap.refs }
    await writePublishedSnapshot("link-1", snap)
    expect(fake.deleted).toEqual([])
  })
})

// ── 5b / 5e ─────────────────────────────────────────────────────────────
describe("opens are visits, not renders", () => {
  it("counts the first open and one after the session window, not a refresh", () => {
    const now = new Date("2026-09-27T12:00:00Z")
    expect(isNewGuestVisit(null, now)).toBe(true)
    expect(isNewGuestVisit(new Date(now.getTime() - 5_000), now)).toBe(false)
    expect(isNewGuestVisit(new Date(now.getTime() - GUEST_OPEN_SESSION_MS + 1), now)).toBe(false)
    expect(isNewGuestVisit(new Date(now.getTime() - GUEST_OPEN_SESSION_MS), now)).toBe(true)
  })
})

describe(".ics RFC 5545 folding", () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length

  it("every physical line ≤ 75 octets; unfolding restores the original; no split UTF-8", () => {
    const line = `LOCATION:${"شارع الخليج العربي، قطعة ٣، منزل رقم ١٢ — ".repeat(4)}`
    const folded = foldIcsLine(line)
    const physical = folded.split("\r\n")
    expect(physical.length).toBeGreaterThan(1)
    for (const p of physical) expect(bytes(p)).toBeLessThanOrEqual(75)
    for (const p of physical.slice(1)) expect(p.startsWith(" ")).toBe(true)
    expect(folded.replace(/\r\n /g, "")).toBe(line)
    expect(folded).not.toContain("�")
  })

  it("short lines untouched; the whole calendar obeys the limit", () => {
    expect(foldIcsLine("VERSION:2.0")).toBe("VERSION:2.0")
    const ics = buildRecordingIcs({
      uid: "link-1",
      start: new Date("2026-10-01T16:00:00Z"),
      address: "اليرموك، قطعة 1، شارع 2، جادة 3، منزل 45 — بجانب المسجد والجمعية التعاونية",
      mapUrl: "https://maps.apple.com/?q=" + "x".repeat(120),
      now: new Date("2026-09-26T00:00:00Z"),
    })
    for (const p of ics.split("\r\n")) expect(bytes(p)).toBeLessThanOrEqual(75)
  })
})
