import type { Metadata } from "next"

import { KhatLogo } from "@/components/brand/khat-logo"
import { PlatformIcon } from "@/components/platforms/platform-icon"
import { listActivePlatforms } from "@/lib/queries/official-platforms"
import type { OfficialPlatformLink } from "@/lib/queries/official-platforms"

/**
 * The page a visitor sees while the site is closed.
 *
 * ── IT USED TO BE A HEADING AND ONE SENTENCE ───────────────────────────────
 * Twenty-two lines: «الموقع قيد الصيانة» over «سنعود قريباً». No mark, no
 * colour, nothing of the identity, and no way out — the visitor's only option
 * was the back button.
 *
 * ── THE IDEA, WHICH MATTERS MORE THAN THE STYLING ──────────────────────────
 * THE SITE IS CLOSED. THE PODCAST IS NOT. Every episode is still on YouTube,
 * Apple, Spotify and Amazon the whole time this page is up, and someone who
 * lands here came to listen. Sending them away with an apology wastes the one
 * visit we are certain of; the platform links turn a dead end into a redirect.
 *
 * That is also why the copy neither apologises twice nor promises a time we
 * cannot keep. It says what is true, then points at what still works.
 *
 * ── ROBUSTNESS ─────────────────────────────────────────────────────────────
 * The links come from the database, and the database is the most likely reason
 * maintenance is on in the first place. So the queries are wrapped: if they
 * fail the page renders without the links rather than turning the maintenance
 * page itself into an error. A maintenance page that can 500 is not one.
 *
 * `proxy.ts` rewrites here with a 503, which is the right status — temporary,
 * so search engines hold the existing index instead of dropping the pages.
 */

export const metadata: Metadata = {
  title: "الموقع قيد الصيانة",
  description: "نعمل على تحسين الموقع. الحلقات متاحة على منصات الاستماع.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function MaintenancePage() {
  const [audio, video, social] = await Promise.all([
    listActivePlatforms({ category: "audio" })
      .then((all) => all.filter((p) => p.platform_key !== "rss"))
      .catch(() => [] as OfficialPlatformLink[]),
    listActivePlatforms({ category: "video" })
      .then((all) => all)
      .catch(() => [] as OfficialPlatformLink[]),
    // Social and the WhatsApp channel. Someone who cannot reach the site can
    // still follow the show — and «community» is where the WhatsApp channel
    // lives, which is the closest thing we have to telling them when we are
    // back.
    Promise.all([
      listActivePlatforms({ category: "social" }).catch(() => [] as OfficialPlatformLink[]),
      listActivePlatforms({ category: "community" }).catch(() => [] as OfficialPlatformLink[]),
    ]).then(([a, b]) => [...a, ...b]),
  ])

  // YouTube leads: it is where the episodes actually live, and where someone
  // who just failed to reach the site is most likely to recognise the show.
  const listenOn = [...video, ...audio]

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
      {/* NO WATERMARK. The KHAT secondary mark sat behind this at 4% and
          Khaled removed it — the second time, after taking the same mark out
          of the homepage hero a day earlier. Both times my reasoning was that
          the block looked empty; both times the answer was that empty is not a
          problem the identity should be stretched to solve. Do not put a
          background mark on a page because it feels bare. */}

      <KhatLogo variant="lockup-vertical" height={92} />

      {/* The brand's own gesture — the same rule the homepage draws under its
          headline. It is most of what makes this read as خط's page rather than
          as a server error page that happens to be in Arabic. */}
      <span aria-hidden="true" className="mt-10 block h-[3px] w-16 rounded-full bg-accent" />

      <h1 className="mt-8 text-balance text-title font-bold text-foreground sm:text-display">
        نُجري بعض التحسينات
      </h1>

      <p className="mx-auto mt-5 max-w-measure text-pretty text-lead text-muted-foreground">
        الموقع مغلق مؤقتًا بينما نعمل عليه. لن يطول الأمر.
      </p>

      {listenOn.length > 0 ? (
        <section className="mt-14 w-full max-w-xl" aria-labelledby="still-listening">
          {/* The point of the page: nothing is broken for the visitor except
              this one website. */}
          <h2 id="still-listening" className="text-body font-semibold text-foreground">
            أما الحلقات، فهي في مكانها
          </h2>
          <p className="mt-2 text-caption text-muted-foreground">
            استمع لبودكاست خط على منصتك المفضلة الآن
          </p>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {listenOn.map((p) => (
              <li key={p.id}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-5 py-3 text-caption font-semibold text-foreground transition-colors hover:border-primary hover:bg-secondary"
                >
                  <PlatformIcon
                    iconName={p.icon_name}
                    className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary"
                  />
                  {p.platform_name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {social.length > 0 ? (
        <section className="mt-12" aria-labelledby="follow-us">
          <h2 id="follow-us" className="sr-only">
            تابع خط على وسائل التواصل
          </h2>
          {/* Icons only. These are secondary to the listening links above — a
              visitor who came for an episode should reach one in a single tap,
              and the follow options should not compete with that. */}
          <ul className="flex flex-wrap items-center justify-center gap-2">
            {social.map((p) => (
              <li key={p.id}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={p.platform_name}
                  title={p.platform_name}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <PlatformIcon iconName={p.icon_name} className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
