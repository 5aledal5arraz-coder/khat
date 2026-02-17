import { createClient } from "@/lib/supabase/server"
import type {
  Guest,
  GuestApplication,
  GuestApplicationStatus,
  SponsorshipLead,
  SponsorshipStatus,
  NewsletterSubscriber,
} from "@/types/database"
import { mockGuests } from "@/lib/mocks/episodes"

const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("placeholder") ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

// Mock data for submissions (when no Supabase)
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
  if (USE_MOCK_DATA) {
    return {
      guestApplications: mockGuestApplications.length,
      sponsorshipLeads: mockSponsorshipLeads.length,
      newsletterSubscribers: mockNewsletterSubscribers.length,
    }
  }

  const supabase = await createClient()

  const [guestApps, sponsors, newsletter] = await Promise.all([
    supabase.from("guest_applications").select("id", { count: "exact" }),
    supabase.from("sponsorship_leads").select("id", { count: "exact" }),
    supabase.from("newsletter_subscribers").select("id", { count: "exact" }),
  ])

  return {
    guestApplications: guestApps.count || 0,
    sponsorshipLeads: sponsors.count || 0,
    newsletterSubscribers: newsletter.count || 0,
  }
}

export async function getGuestApplications(): Promise<GuestApplication[]> {
  if (USE_MOCK_DATA) {
    return mockGuestApplications.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("guest_applications")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching guest applications:", error)
    return mockGuestApplications
  }

  return data || []
}

export async function getSponsorshipLeads(): Promise<SponsorshipLead[]> {
  if (USE_MOCK_DATA) {
    return mockSponsorshipLeads.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("sponsorship_leads")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching sponsorship leads:", error)
    return mockSponsorshipLeads
  }

  return data || []
}

export async function getNewsletterSubscribers(): Promise<
  NewsletterSubscriber[]
> {
  if (USE_MOCK_DATA) {
    return mockNewsletterSubscribers.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching newsletter subscribers:", error)
    return mockNewsletterSubscribers
  }

  return data || []
}

export async function getAllGuests(): Promise<Guest[]> {
  if (USE_MOCK_DATA) {
    return mockGuests
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("guests")
    .select("*")
    .order("name")

  if (error) {
    console.error("Error fetching guests:", error)
    return mockGuests
  }

  return data || []
}

export async function getGuestById(id: string): Promise<Guest | null> {
  if (USE_MOCK_DATA) {
    return mockGuests.find((g) => g.id === id) || null
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("guests")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching guest:", error)
    return null
  }

  return data
}

export async function createGuest(
  guest: Omit<Guest, "id" | "created_at">
): Promise<{ success: boolean; error?: string; data?: Guest }> {
  if (USE_MOCK_DATA) {
    const newGuest: Guest = {
      ...guest,
      id: `guest-${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    }
    return { success: true, data: newGuest }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("guests")
    .insert(guest)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

export async function updateGuest(
  id: string,
  updates: Partial<Guest>
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase.from("guests").update(updates).eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function deleteGuest(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase.from("guests").delete().eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function deleteGuestApplication(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("guest_applications")
    .delete()
    .eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function updateGuestApplicationStatus(
  id: string,
  status: GuestApplicationStatus
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("guest_applications")
    .update({ status })
    .eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function deleteSponsorshipLead(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("sponsorship_leads")
    .delete()
    .eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function updateSponsorshipStatus(
  id: string,
  status: SponsorshipStatus
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("sponsorship_leads")
    .update({ status })
    .eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function deleteNewsletterSubscriber(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (USE_MOCK_DATA) {
    return { success: true }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("id", id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
