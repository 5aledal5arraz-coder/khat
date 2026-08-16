import { permanentRedirect } from "next/navigation"

/**
 * The pilot's address, kept only to send people to the real one.
 *
 * `/stories/[slug]` was where the transcript idea was proved out. Khaled's call
 * was to MERGE it into the episode page, and once the words live there this URL
 * must not survive as a second copy: two pages for one conversation split the
 * inbound links, split whatever gets shared, and give Google a duplicate to
 * choose between. A 308 hands all of that to `/episodes/[slug]`.
 *
 * It stays rather than being deleted because the pilot URL was opened, measured
 * and screenshotted during the session it was built in — and a link that was
 * ever real should not start returning 404.
 */
export default async function StoryRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  permanentRedirect(`/episodes/${slug}`)
}
