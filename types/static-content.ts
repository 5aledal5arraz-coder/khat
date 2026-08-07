export interface TeamMember {
  id: string
  name: string
  /** The job, in one line — «المؤسس والمقدّم». */
  role: string
  /** What he actually does, spelled out. Sits under the role. */
  description: string
  image: string
  /**
   * HIS OWN LINE — one sentence in his voice, set as a pull quote with the
   * KHAT rule under it.
   *
   * This is the field that makes the page خط's and not a generic team grid.
   * The brand's whole premise is «كالعبارات التي تضع تحتها خطًّا» — a phrase
   * worth underlining — so the page underlines one sentence from each of the
   * three people who make it. A bio says what someone does; this says why.
   *
   * Optional: a member with no line renders without the quote rather than an
   * empty rule.
   */
  message?: string
  /**
   * Optional YouTube URL — a short clip of the member. Rendered in place of the
   * portrait when present, through the same `YouTubeEmbed` the episode pages
   * use, so it inherits the facade and the click-to-load behaviour instead of
   * shipping a third-party iframe on a page nobody asked to watch.
   */
  videoUrl?: string
  /**
   * ⚠️ NO LONGER RENDERED ANYWHERE. Kept only so existing stored rows keep
   * parsing; nothing reads it and the admin form no longer offers it.
   *
   * It used to be published as a `mailto:` on /about. Khalid put his own
   * `@hotmail` address in it on 2026-08-06, saw it on the live page and said
   * «لا شيل الايميل وخله تواصل مع فريق خط» — a personal inbox printed on a
   * public page is a spam magnet, and it makes one man the default recipient
   * for everything.
   *
   * What replaced it answers the question he asked next — «شلون نعرف بالإيميل
   * انها رساله ل خالد وليش فيصل او شاهين؟» — every member's button now writes
   * to the ONE team address with the member's name in the SUBJECT, so the
   * inbox sorts itself without publishing three addresses. See app/about/page.tsx.
   */
  email?: string
  /**
   * His own accounts, separate from خط's. `platform` is a key from the shared
   * icon map (`components/platforms/platform-icon.tsx`), so a member's X icon is
   * the same X icon the footer uses and no second set of glyphs appears.
   */
  socials?: TeamMemberSocial[]
  order: number
}

export interface TeamMemberSocial {
  /** A key `PlatformIcon` knows: x · instagram · tiktok · youtube · threads … */
  platform: string
  url: string
}

export interface ValueItem {
  id: string
  icon: string
  title: string
  description: string
  color: string
  order: number
}

export interface AboutPageContent {
  hostName: string
  hostTitle: string
  hostDescription: string
  hostPhoto: string
  hostImageUrl?: string
  welcomeVideoId: string
  welcomeVideoUrl?: string
  welcomeVideoPosterUrl?: string
  missionQuote: string
  ctaTitle: string
  ctaDescription: string
  socialLinks: { name: string; url: string; icon: string }[]
  values: ValueItem[]
  teamMembers: TeamMember[]
}

export interface StaticContentConfig {
  about: AboutPageContent
}
