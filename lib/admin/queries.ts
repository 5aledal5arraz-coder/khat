import { db, USE_DB } from "@/lib/db"
import { eq, desc, sql, count, and, ilike, or, isNull } from 'drizzle-orm'
import { guests, guestApplications, profiles, sponsorshipLeads, newsletterSubscribers, hibrArticles, hibrThoughts, hibrLikes, hibrFollows, hibrBookmarks } from '@/lib/db/schema'
import { getAdminAuth } from "@/lib/firebase/admin"
import type {
  Guest,
  GuestApplication,
  GuestApplicationStatus,
  SponsorshipLead,
  SponsorshipStatus,
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
    contact_name: "محمد السعيد",
    job_title: "مدير التسويق",
    email: "mohamed@advancedtech.com",
    phone: "+965 9911 2233",
    collaboration_types: ["season_partnership", "social_media_content"],
    collaboration_other: null,
    main_goal: "brand_awareness",
    target_audience: "شباب الخليج المهتمين بالتقنية والابتكار (20-35)",
    preferred_timeline: "الربع الثالث 2025",
    budget_range: "1000_3000",
    additional_info: "نود أن يكون الظهور مرتبطًا بحلقات التقنية وريادة الأعمال تحديدًا.",
    status: "new",
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    company_name: "مقهى السنبلة",
    industry: "أغذية ومشروبات",
    contact_name: "نورة العتيبي",
    job_title: "مؤسسة ومديرة",
    email: "noura@sunbula.co",
    phone: "+965 5544 3322",
    collaboration_types: ["episode_partnership", "collaborative_episode"],
    collaboration_other: null,
    main_goal: "community_engagement",
    target_audience: "محبي القهوة المختصة والثقافة المحلية في الكويت",
    preferred_timeline: null,
    budget_range: "500_1000",
    additional_info: null,
    status: "reviewing",
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

export async function getAllGuests(): Promise<Guest[]> {
  if (!USE_DB) {
    return mockGuests
  }

  try {
    const rows = await db!
      .select()
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
      .select()
      .from(guests)
      .where(eq(guests.id, id))
      .limit(1)
    return (rows[0] as unknown as Guest) || null
  } catch (error) {
    console.error("Error fetching guest:", error)
    return null
  }
}

export async function createGuest(
  guest: Omit<Guest, "id" | "created_at">
): Promise<{ success: boolean; error?: string; data?: Guest }> {
  if (!USE_DB) {
    const newGuest: Guest = {
      ...guest,
      id: `guest-${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    }
    return { success: true, data: newGuest }
  }

  try {
    const rows = await db!
      .insert(guests)
      .values({
        name: guest.name,
        slug: guest.slug,
        bio: guest.bio,
        photo_url: guest.photo_url,
        external_links: guest.external_links || null,
        testimonial: guest.testimonial,
      })
      .returning()
    return { success: true, data: rows[0] as unknown as Guest }
  } catch (error: any) {
    return { success: false, error: error.message }
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
    const setData: Record<string, any> = {}
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
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
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ===== Members Management =====

interface GetMembersParams {
  search?: string
  role?: string
  is_banned?: boolean | null
  limit?: number
  offset?: number
}

export async function getMembers({
  search,
  role,
  is_banned,
  limit = 50,
  offset = 0,
}: GetMembersParams = {}): Promise<{
  members: any[]
  total: number
}> {
  if (!USE_DB) return { members: [], total: 0 }

  const conditions: ReturnType<typeof eq>[] = [isNull(profiles.deleted_at)]

  if (search) {
    conditions.push(
      or(
        ilike(profiles.display_name, `%${search}%`),
        ilike(profiles.username, `%${search}%`),
        ilike(profiles.email, `%${search}%`),
      )!
    )
  }

  if (role) {
    conditions.push(eq(profiles.role, role))
  }

  if (is_banned === true) {
    conditions.push(eq(profiles.is_banned, true))
  } else if (is_banned === false) {
    conditions.push(
      or(
        eq(profiles.is_banned, false),
        isNull(profiles.is_banned),
      )!
    )
  }

  const whereClause = and(...conditions)

  const countResult = await db!
    .select({ count: count() })
    .from(profiles)
    .where(whereClause)
  const total = countResult[0].count

  const members = await db!
    .select({
      id: profiles.id,
      display_name: profiles.display_name,
      username: profiles.username,
      avatar_url: profiles.avatar_url,
      bio: profiles.bio,
      email: profiles.email,
      is_admin: profiles.is_admin,
      is_banned: profiles.is_banned,
      ban_reason: profiles.ban_reason,
      articles_count: sql<number>`COALESCE(${profiles.articles_count}, 0)`,
      followers_count: sql<number>`COALESCE(${profiles.followers_count}, 0)`,
      role: profiles.role,
      notify_comments: profiles.notify_comments,
      notify_replies: profiles.notify_replies,
      notify_likes: profiles.notify_likes,
      notify_follows: profiles.notify_follows,
      notification_unsubscribe_token: profiles.notification_unsubscribe_token,
      must_change_password: profiles.must_change_password,
      deleted_at: profiles.deleted_at,
      created_at: profiles.created_at,
      updated_at: profiles.updated_at,
    })
    .from(profiles)
    .where(whereClause)
    .orderBy(desc(profiles.created_at))
    .limit(limit)
    .offset(offset)

  return { members, total }
}

export async function updateUserRole(
  userId: string,
  role: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) return { success: false, error: "No database" }

  const validRoles = ["admin", "editor", "moderator", "user"]
  if (!validRoles.includes(role)) {
    return { success: false, error: "Invalid role" }
  }

  try {
    await db!
      .update(profiles)
      .set({ role, is_admin: role === "admin" })
      .where(eq(profiles.id, userId))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateUserBanStatus(
  userId: string,
  is_banned: boolean,
  ban_reason?: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) return { success: false, error: "No database" }

  try {
    await db!
      .update(profiles)
      .set({
        is_banned,
        ban_reason: is_banned ? ban_reason || null : null,
      })
      .where(eq(profiles.id, userId))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteUserAndContent(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!USE_DB) return { success: false, error: "No database" }

  try {
    // Soft-delete profile
    await db!
      .update(profiles)
      .set({ deleted_at: sql`now()` })
      .where(eq(profiles.id, userId))
    // Soft-delete articles (set moderation_status to removed)
    await db!
      .update(hibrArticles)
      .set({ moderation_status: "removed" })
      .where(eq(hibrArticles.user_id, userId))
    // Soft-delete thoughts
    await db!
      .update(hibrThoughts)
      .set({ moderation_status: "removed" })
      .where(eq(hibrThoughts.user_id, userId))
    // Hard-delete interactions
    await db!.delete(hibrLikes).where(eq(hibrLikes.user_id, userId))
    await db!.delete(hibrFollows).where(eq(hibrFollows.follower_id, userId))
    await db!.delete(hibrBookmarks).where(eq(hibrBookmarks.user_id, userId))

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createMember(data: {
  display_name: string
  email: string
  password: string
  username?: string
  role?: string
}): Promise<{ success: boolean; error?: string; member?: any }> {
  if (!USE_DB) return { success: false, error: "No database" }

  const role = data.role || "user"
  const isAdmin = role === "admin"

  // Create Firebase Auth user first
  let firebaseUid: string
  try {
    const userRecord = await getAdminAuth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.display_name,
    })
    firebaseUid = userRecord.uid
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      return { success: false, error: "البريد الإلكتروني مستخدم بالفعل في نظام المصادقة" }
    }
    return { success: false, error: `فشل إنشاء حساب المصادقة: ${error.message}` }
  }

  try {
    const rows = await db!
      .insert(profiles)
      .values({
        id: firebaseUid,
        display_name: data.display_name,
        email: data.email,
        username: data.username || null,
        role,
        is_admin: isAdmin,
        must_change_password: true,
        created_at: sql`NOW()`,
        updated_at: sql`NOW()`,
      })
      .returning()
    return { success: true, member: rows[0] }
  } catch (error: any) {
    // Rollback: delete the Firebase user if DB insert fails
    try { await getAdminAuth().deleteUser(firebaseUid) } catch {}
    if (error.code === "23505") {
      return { success: false, error: "البريد الإلكتروني أو اسم المستخدم مستخدم بالفعل" }
    }
    return { success: false, error: error.message }
  }
}

export async function getMemberById(userId: string) {
  if (!USE_DB) return null

  const rows = await db!
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, userId), isNull(profiles.deleted_at)))
  return rows[0] || null
}
