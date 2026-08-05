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
  order: number
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
