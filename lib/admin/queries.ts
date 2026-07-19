import { db, USE_DB } from "@/lib/db"
import { eq, desc, count } from 'drizzle-orm'
import { guests, guestApplications, sponsorshipLeads, newsletterSubscribers, sponsorshipAnalysis, sponsorshipProposals, guestApplicationAnalysis, guestApplicationConcepts, guestApplicationResponses } from '@/lib/db/schema'
import type {
  Guest,
  GuestApplication,
  GuestApplicationStatus,
  SponsorshipLead,
  SponsorshipStatus,
  SponsorshipAnalysis,
  SponsorshipProposal,
  GuestApplicationAnalysis,
  GuestApplicationConcept,
  GuestApplicationResponse,
  NewsletterSubscriber,
} from "@/types/database"
import { mockGuests } from "@/lib/mocks/episodes"

// Mock data for submissions (when no DB)
const mockGuestApplications: GuestApplication[] = [
  {
    id: "1",
    name: "أحمد محمد",
    email: "ahmed@example.com",
    phone: "+965 9988 7766",
    country: "الكويت",
    can_travel_to_kuwait: null,
    story_idea:
      "أبي أحكي عن تجربتي في تأسيس شركة تقنية من الصفر في الكويت، التحديات اللي واجهتها والدروس اللي تعلمتها. كيف الفشل كان أكبر معلم لي وكيف تحولت من موظف عادي إلى رائد أعمال.",
    beyond_job_title:
      "أنا شخص يحب التجارب الجديدة. سافرت لأكثر من ٢٠ دولة وتعلمت من كل ثقافة شي مختلف. أكبر تحدي واجهته كان لما فقدت كل مدخراتي في مشروع فاشل وبديت من الصفر.",
    life_changing_moment:
      "في ٢٠١٩ خسرت كل شي — المشروع فشل والديون تراكمت. كنت في لحظة يأس حقيقي. بس في تلك اللحظة بالذات فهمت إن الفشل مو نهاية العالم. قررت أبدأ من جديد بعقلية مختلفة تماماً. هذا القرار غير حياتي كلها.",
    hope_people_understand:
      "إن النجاح مو خط مستقيم. ورا كل قصة نجاح في سقطات وليالي صعبة ما أحد يشوفها.",
    unasked_question:
      "ما هو أكبر خوف تعيشه الحين بالرغم من نجاحك الظاهري؟",
    why_khat:
      "أتابع خط من بداياته وأعجبني أسلوب الحوار العميق والمختلف. ما يحاول يلمع الضيف — يحاول يفهمه.",
    previous_podcast: true,
    previous_podcast_info: "بودكاست سوالف بزنس - الحلقة 42",
    prefer_dialogue_or_story:
      "أفضل الحوار والنقاش لأنه يطلع أفكار ما كنت أخطط أقولها. الأسئلة الحقيقية تفتح أبواب ما كنت أعرف إنها موجودة.",
    topics_to_avoid: "تفاصيل العلاقات العائلية الشخصية",
    filming_concern: "no",
    agrees_to_publish: true,
    social_links: "https://twitter.com/ahmed, https://linkedin.com/in/ahmed",
    status: "new",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    name: "سارة العلي",
    email: "sara@example.com",
    phone: "+966 55 123 4567",
    country: "السعودية",
    can_travel_to_kuwait: "yes",
    story_idea:
      "عن تجربتي في التعافي من الاحتراق الوظيفي. كنت أشتغل ١٦ ساعة باليوم وأحس إني ناجحة، بس جسمي وروحي كانوا يصرخون. أبي أحكي كيف تعلمت أوقف وأسمع نفسي.",
    beyond_job_title:
      "أنا أم لطفلين، رسامة هاوية، وشخص يحب يسمع قصص الناس أكثر ما يحكي. أكبر صراع عشته كان بين طموحي المهني وإحساسي بالذنب كأم.",
    life_changing_moment:
      "يوم ما دخلت المستشفى من الإرهاق وأنا في عز نجاحي المهني. كانت لحظة صحوة. فهمت إن الجسم ما يكذب وإن النجاح اللي يجي على حساب صحتك مو نجاح حقيقي. من بعدها غيرت كل شي في حياتي — طريقة شغلي، علاقاتي، حتى تعريفي للنجاح.",
    hope_people_understand:
      "إن الاعتراف بالضعف مو ضعف. وإن أقوى شي ممكن تسويه هو إنك توقف وتقول 'أنا تعبان'.",
    unasked_question:
      "لو رجعتي بالزمن، هل كنتي بتختارين نفس الطريق؟",
    why_khat:
      "بودكاست خط يتميز بعمق المحتوى وجودة الإنتاج. أحس إنه مكان آمن للحكي بصدق.",
    previous_podcast: false,
    previous_podcast_info: null,
    prefer_dialogue_or_story:
      "أفضل أحكي قصتي لأنها متسلسلة ولها بداية ونهاية. بس ما أمانع الأسئلة اللي تاخذني لأماكن ما كنت أخطط أروحها.",
    topics_to_avoid: null,
    filming_concern: "a_little",
    agrees_to_publish: true,
    social_links: "https://instagram.com/sara_ali",
    status: "under_review",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const mockSponsorshipLeads: SponsorshipLead[] = [
  {
    id: "1",
    company_name: "شركة التقنية المتقدمة",
    industry: "تقنية المعلومات",
    company_website: "https://advancedtech.com",
    contact_name: "محمد السعيد",
    job_title: "مدير التسويق",
    email: "mohamed@advancedtech.com",
    phone: "+965 9911 2233",
    collaboration_types: ["season_partnership", "social_media_content"],
    collaboration_other: null,
    main_goal: "brand_awareness",
    target_audience: "شباب الخليج المهتمين بالتقنية والابتكار (20-35)",
    brand_values: "الابتكار والموثوقية",
    campaign_goals: "بناء إدراك العلامة لدى جيل الشباب التقني",
    expectations: null,
    previous_partnerships: null,
    preferred_timeline: "الربع الثالث 2025",
    budget_range: "1000_3000",
    additional_info: "نود أن يكون الظهور مرتبطًا بحلقات التقنية وريادة الأعمال تحديدًا.",
    status: "new",
    owner: null,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    company_name: "مقهى السنبلة",
    industry: "أغذية ومشروبات",
    company_website: null,
    contact_name: "نورة العتيبي",
    job_title: "مؤسسة ومديرة",
    email: "noura@sunbula.co",
    phone: "+965 5544 3322",
    collaboration_types: ["episode_partnership", "collaborative_episode"],
    collaboration_other: null,
    main_goal: "community_engagement",
    target_audience: "محبي القهوة المختصة والثقافة المحلية في الكويت",
    brand_values: null,
    campaign_goals: null,
    expectations: null,
    previous_partnerships: null,
    preferred_timeline: null,
    budget_range: "500_1000",
    additional_info: null,
    status: "reviewing",
    owner: null,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const mockNewsletterSubscribers: NewsletterSubscriber[] = [
  {
    id: "1",
    email: "subscriber1@example.com",
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    email: "subscriber2@example.com",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    email: "subscriber3@example.com",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

export async function getSubmissionCounts(): Promise<{
  guestApplications: number
  sponsorshipLeads: number
  newsletterSubscribers: number
}> {
  if (!USE_DB) {
    return {
      guestApplications: mockGuestApplications.length,
      sponsorshipLeads: mockSponsorshipLeads.length,
      newsletterSubscribers: mockNewsletterSubscribers.length,
    }
  }

  const [guestApps, sponsors, newsletter] = await Promise.all([
    db!.select({ count: count() }).from(guestApplications),
    db!.select({ count: count() }).from(sponsorshipLeads),
    db!.select({ count: count() }).from(newsletterSubscribers),
  ])

  return {
    guestApplications: guestApps[0].count,
    sponsorshipLeads: sponsors[0].count,
    newsletterSubscribers: newsletter[0].count,
  }
}

export async function getGuestApplications(): Promise<GuestApplication[]> {
  if (!USE_DB) {
    return mockGuestApplications.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  try {
    const rows = await db!
      .select()
      .from(guestApplications)
      .orderBy(desc(guestApplications.created_at))
    return rows as unknown as GuestApplication[]
  } catch (error) {
    console.error("Error fetching guest applications:", error)
    return mockGuestApplications
  }
}

export async function getGuestApplicationById(id: string): Promise<GuestApplication | null> {
  if (!USE_DB) {
    return mockGuestApplications.find((a) => a.id === id) ?? null
  }
  try {
    const [row] = await db!
      .select()
      .from(guestApplications)
      .where(eq(guestApplications.id, id))
      .limit(1)
    return (row as unknown as GuestApplication) ?? null
  } catch (error) {
    console.error("Error fetching guest application:", error)
    return null
  }
}

export async function getSponsorshipLeads(): Promise<SponsorshipLead[]> {
  if (!USE_DB) {
    return mockSponsorshipLeads.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  try {
    const rows = await db!
      .select()
      .from(sponsorshipLeads)
      .orderBy(desc(sponsorshipLeads.created_at))
    return rows as unknown as SponsorshipLead[]
  } catch (error) {
    console.error("Error fetching sponsorship leads:", error)
    return mockSponsorshipLeads
  }
}

export async function getSponsorshipLeadById(id: string): Promise<SponsorshipLead | null> {
  if (!USE_DB) {
    return mockSponsorshipLeads.find((l) => l.id === id) ?? null
  }
  try {
    const [row] = await db!
      .select()
      .from(sponsorshipLeads)
      .where(eq(sponsorshipLeads.id, id))
      .limit(1)
    return (row as unknown as SponsorshipLead) ?? null
  } catch (error) {
    console.error("Error fetching sponsorship lead:", error)
    return null
  }
}

export async function getNewsletterSubscribers(): Promise<
  NewsletterSubscriber[]
> {
  if (!USE_DB) {
    return mockNewsletterSubscribers.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  try {
    const rows = await db!
      .select()
      .from(newsletterSubscribers)
      .orderBy(desc(newsletterSubscribers.created_at))
    return rows as unknown as NewsletterSubscriber[]
  } catch (error) {
    console.error("Error fetching newsletter subscribers:", error)
    return mockNewsletterSubscribers
  }
}

/**
 * Explicit column projection matching the public `Guest` type. Deliberately
 * OMITS the admin-only `phone`/`email` columns (migration 0012) and the
 * generated `normalized_name`, so guest reads on this path never carry PII
 * that the `Guest` type hides — `getAllGuests` feeds public surfaces
 * (app/sitemap.ts). The `as unknown as Guest` casts below remain only to
 * bridge the created_at Date→string shape difference, not to smuggle columns.
 */
const GUEST_COLUMNS = {
  id: guests.id,
  name: guests.name,
  slug: guests.slug,
  bio: guests.bio,
  photo_url: guests.photo_url,
  external_links: guests.external_links,
  testimonial: guests.testimonial,
  created_at: guests.created_at,
} as const

export async function getAllGuests(): Promise<Guest[]> {
  if (!USE_DB) {
    return mockGuests
  }

  try {
    const rows = await db!
      .select(GUEST_COLUMNS)
      .from(guests)
      .orderBy(guests.name)
    return rows as unknown as Guest[]
  } catch (error) {
    console.error("Error fetching guests:", error)
    return mockGuests
  }
}

export async function getGuestById(id: string): Promise<Guest | null> {
  if (!USE_DB) {
    return mockGuests.find((g) => g.id === id) || null
  }

  try {
    const rows = await db!
      .select(GUEST_COLUMNS)
      .from(guests)
      .where(eq(guests.id, id))
      .limit(1)
    return (rows[0] as unknown as Guest) || null
  } catch (error) {
    console.error("Error fetching guest:", error)
    return null
  }
}

/**
 * Cleanup Phase A — manual admin guest creation now routes through
 * `ensureGuest()` so it shares the same dedup + identity-profile path
 * as discovery promotion / studio auto-link / application acceptance.
 *
 * Behaviour change:
 *   - If a matching guest is found at high/medium confidence, that
 *     existing guest is returned (no duplicate row) and the response
 *     reports `existing: true`.
 *   - If a low-confidence conflict is detected, ensureGuest's
 *     `acceptance: "create_on_low"` lets the admin's explicit form
 *     submission win — they typed the name on purpose.
 *   - A `guest_identity_profiles` row is also ensured.
 *
 * The legacy direct-insert path is preserved ONLY when DB is offline
 * (USE_DB=false), which is dev-only.
 */
export async function createGuest(
  // G-042 — slug is no longer caller-supplied: the `ensureGuest` chokepoint
  // assigns a uniform `g-NNN` slug from the sequence. `slug` stays accepted
  // (optional) only as a matching hint / offline fallback.
  guest: Omit<Guest, "id" | "created_at" | "slug"> & { slug?: string }
): Promise<{ success: boolean; error?: string; data?: Guest; existing?: boolean }> {
  if (!USE_DB) {
    const newGuest: Guest = {
      ...guest,
      slug: guest.slug ?? `g-local-${crypto.randomUUID().slice(0, 8)}`,
      id: `guest-${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    }
    return { success: true, data: newGuest }
  }

  try {
    const { ensureGuest, createGuestIdentityProfile } = await import(
      "@/lib/guests/canonical"
    )
    const result = await ensureGuest(
      {
        name: guest.name,
        slug: guest.slug,
        bio: guest.bio ?? null,
        photo_url: guest.photo_url ?? null,
        external_links: (guest.external_links as Record<string, string>) ?? undefined,
      },
      // Admin typed the name on purpose; if dedup is uncertain, prefer
      // creating rather than blocking the form submission.
      { acceptance: "create_on_low" },
    )

    // If the testimonial field was supplied (legacy column on `guests`),
    // patch it on the row that ensureGuest produced — it isn't part of
    // the canonical IdentityHints surface.
    if (guest.testimonial !== undefined && guest.testimonial !== null) {
      await db!
        .update(guests)
        .set({ testimonial: guest.testimonial })
        .where(eq(guests.id, result.guest_id))
    }

    // Make sure an identity profile exists. Idempotent.
    await createGuestIdentityProfile(result.guest_id, {})

    const [row] = await db!
      .select(GUEST_COLUMNS)
      .from(guests)
      .where(eq(guests.id, result.guest_id))
      .limit(1)
    return {
      success: true,
      data: row as unknown as Guest,
      existing: !result.created,
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateGuest(
  id: string,
  updates: Partial<Guest>
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    // Build a clean updates object, excluding id and created_at
    const setData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (key === "id" || key === "created_at") continue
      setData[key] = value
    }

    if (Object.keys(setData).length === 0) return { success: true }

    await db!
      .update(guests)
      .set(setData)
      .where(eq(guests.id, id))
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteGuest(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    await db!.delete(guests).where(eq(guests.id, id))
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteGuestApplication(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    await db!.delete(guestApplications).where(eq(guestApplications.id, id))
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateGuestApplicationStatus(
  id: string,
  status: GuestApplicationStatus
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    await db!
      .update(guestApplications)
      .set({ status })
      .where(eq(guestApplications.id, id))
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteSponsorshipLead(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    await db!.delete(sponsorshipLeads).where(eq(sponsorshipLeads.id, id))
    // The partner activity/note/task timeline now lives on the shared
    // polymorphic CRM core, which can't FK-cascade off the lead — clear it
    // explicitly. (Meetings/emails/contracts/campaigns still cascade.)
    const { deleteCrmForSubject } = await import("@/lib/crm")
    await deleteCrmForSubject("partner", id).catch(() => {})
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateSponsorshipStatus(
  id: string,
  status: SponsorshipStatus
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    await db!
      .update(sponsorshipLeads)
      .set({ status })
      .where(eq(sponsorshipLeads.id, id))
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}


export async function deleteNewsletterSubscriber(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) {
    return { success: true }
  }

  try {
    await db!.delete(newsletterSubscribers).where(eq(newsletterSubscribers.id, id))
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// --- Sponsorship AI ---

export async function getSponsorshipAnalysis(leadId: string): Promise<SponsorshipAnalysis | null> {
  if (!USE_DB) return null
  try {
    const [row] = await db!
      .select()
      .from(sponsorshipAnalysis)
      .where(eq(sponsorshipAnalysis.lead_id, leadId))
      .limit(1)
    return (row as unknown as SponsorshipAnalysis) ?? null
  } catch (error) {
    console.error("Error fetching sponsorship analysis:", error)
    return null
  }
}

export async function upsertSponsorshipAnalysis(
  leadId: string,
  data: Partial<Omit<SponsorshipAnalysis, "id" | "lead_id" | "created_at">>
): Promise<string> {
  if (!USE_DB) return ""
  // `researched_at` is an ISO string in the domain type, but the timestamp
  // column needs a Date — coerce at the DB boundary so drizzle can serialize it.
  const dbData = {
    ...data,
    ...(data.researched_at ? { researched_at: new Date(data.researched_at) } : {}),
  } as Partial<typeof sponsorshipAnalysis.$inferInsert>
  const existing = await getSponsorshipAnalysis(leadId)
  if (existing) {
    await db!.update(sponsorshipAnalysis).set(dbData).where(eq(sponsorshipAnalysis.lead_id, leadId))
    return existing.id
  }
  const [row] = await db!.insert(sponsorshipAnalysis).values({ lead_id: leadId, ...dbData }).returning({ id: sponsorshipAnalysis.id })
  return row.id
}

export async function getSponsorshipProposal(leadId: string): Promise<SponsorshipProposal | null> {
  if (!USE_DB) return null
  try {
    const [row] = await db!
      .select()
      .from(sponsorshipProposals)
      .where(eq(sponsorshipProposals.lead_id, leadId))
      .orderBy(desc(sponsorshipProposals.created_at))
      .limit(1)
    return (row as unknown as SponsorshipProposal) ?? null
  } catch (error) {
    console.error("Error fetching sponsorship proposal:", error)
    return null
  }
}

export async function createSponsorshipProposal(
  data: { lead_id: string; analysis_id?: string | null; tone?: string; status?: string }
): Promise<string> {
  if (!USE_DB) return ""
  const [row] = await db!.insert(sponsorshipProposals).values(data).returning({ id: sponsorshipProposals.id })
  return row.id
}

export async function updateSponsorshipProposal(
  id: string,
  data: Partial<Omit<SponsorshipProposal, "id" | "lead_id" | "created_at">>
): Promise<void> {
  if (!USE_DB) return
  await db!.update(sponsorshipProposals).set(data).where(eq(sponsorshipProposals.id, id))
}

// --- Guest Application AI ---

export async function getGuestAnalysis(applicationId: string): Promise<GuestApplicationAnalysis | null> {
  if (!USE_DB) return null
  try {
    const [row] = await db!
      .select()
      .from(guestApplicationAnalysis)
      .where(eq(guestApplicationAnalysis.application_id, applicationId))
      .limit(1)
    return (row as unknown as GuestApplicationAnalysis) ?? null
  } catch (error) {
    console.error("Error fetching guest analysis:", error)
    return null
  }
}

export async function upsertGuestAnalysis(
  applicationId: string,
  data: Partial<Omit<GuestApplicationAnalysis, "id" | "application_id" | "created_at">>
): Promise<string> {
  if (!USE_DB) return ""
  // `researched_at` is an ISO string in the domain type, but the timestamp
  // column needs a Date — coerce at the DB boundary so drizzle can serialize it.
  const dbData = {
    ...data,
    ...(data.researched_at ? { researched_at: new Date(data.researched_at) } : {}),
  } as Partial<typeof guestApplicationAnalysis.$inferInsert>
  const existing = await getGuestAnalysis(applicationId)
  if (existing) {
    await db!.update(guestApplicationAnalysis).set(dbData).where(eq(guestApplicationAnalysis.application_id, applicationId))
    return existing.id
  }
  const [row] = await db!.insert(guestApplicationAnalysis).values({ application_id: applicationId, ...dbData }).returning({ id: guestApplicationAnalysis.id })
  return row.id
}

export async function getGuestConcept(applicationId: string): Promise<GuestApplicationConcept | null> {
  if (!USE_DB) return null
  try {
    const [row] = await db!
      .select()
      .from(guestApplicationConcepts)
      .where(eq(guestApplicationConcepts.application_id, applicationId))
      .orderBy(desc(guestApplicationConcepts.created_at))
      .limit(1)
    return (row as unknown as GuestApplicationConcept) ?? null
  } catch (error) {
    console.error("Error fetching guest concept:", error)
    return null
  }
}

export async function createGuestConcept(
  data: { application_id: string; analysis_id?: string | null; status?: string }
): Promise<string> {
  if (!USE_DB) return ""
  const [row] = await db!.insert(guestApplicationConcepts).values(data).returning({ id: guestApplicationConcepts.id })
  return row.id
}

export async function updateGuestConcept(
  id: string,
  data: Partial<Omit<GuestApplicationConcept, "id" | "application_id" | "created_at">>
): Promise<void> {
  if (!USE_DB) return
  await db!.update(guestApplicationConcepts).set(data).where(eq(guestApplicationConcepts.id, id))
}

export async function getGuestResponses(applicationId: string): Promise<GuestApplicationResponse | null> {
  if (!USE_DB) return null
  try {
    const [row] = await db!
      .select()
      .from(guestApplicationResponses)
      .where(eq(guestApplicationResponses.application_id, applicationId))
      .limit(1)
    return (row as unknown as GuestApplicationResponse) ?? null
  } catch (error) {
    console.error("Error fetching guest responses:", error)
    return null
  }
}

export async function upsertGuestResponses(
  applicationId: string,
  data: Partial<Omit<GuestApplicationResponse, "id" | "application_id" | "created_at">>
): Promise<string> {
  if (!USE_DB) return ""
  const existing = await getGuestResponses(applicationId)
  if (existing) {
    await db!.update(guestApplicationResponses).set(data).where(eq(guestApplicationResponses.application_id, applicationId))
    return existing.id
  }
  const [row] = await db!.insert(guestApplicationResponses).values({ application_id: applicationId, ...data }).returning({ id: guestApplicationResponses.id })
  return row.id
}

