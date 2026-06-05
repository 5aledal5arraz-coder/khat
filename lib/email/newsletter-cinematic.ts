/**
 * Cinematic newsletter template — luxury dark aesthetic inspired by the
 * Google AI Studio design. Produces table-based HTML with inline styles,
 * compatible with Gmail, Apple Mail, and Outlook.
 *
 * This template is SELF-CONTAINED (full HTML document with its own header,
 * footer, and unsubscribe link). It must NOT be wrapped by `emailLayout()`
 * or `newsletterHtml()`. Use `sendCampaign({ ..., rawHtml: true })` so the
 * sender skips the default wrapper.
 *
 * The placeholder `{{unsubscribe_url}}` is replaced per-subscriber by the
 * sender at delivery time.
 *
 * Usage:
 *   import { buildCinematicNewsletter } from "@/lib/email/newsletter-cinematic"
 *   const html = buildCinematicNewsletter({ ... })
 *   await sendCampaign({ subject, body: html, rawHtml: true })
 */

import { APP_URL } from "./resend"

export interface CinematicNewsletterData {
  /** Issue number, e.g. "42" */
  issueNumber: string
  /** Formatted date, e.g. "12 أبريل 2026" */
  issueDate: string
  /** Episode title — supports line breaks via <br> */
  episodeTitle: string
  /** Episode description (1-2 sentences) */
  episodeDescription: string
  /** Episode hero image URL (recommended 1200×1500 or 4:5) */
  episodeImage: string
  /** Guest name */
  guestName: string
  /** Guest bio paragraph */
  guestBio?: string
  /** Featured quote (without surrounding quotes — they are added) */
  quote: string
  /** Quote attribution (e.g. "د. ليلى المنصور") */
  quoteAttribution: string
  /** Primary CTA URL (listen/watch link) */
  ctaLink: string
  /** Optional secondary CTA URL */
  archiveLink?: string
}

// ─── Design tokens ──────────────────────────────────────────────────────────

const BG = "#0a0a0a"
const IVORY = "#f5f5f4"
const MUTED = "#78716c"
const PURPLE = "#6d28d9"
const PURPLE_BG = "rgba(109,40,217,0.1)"
const BORDER = "#1a1a1a"
const FONT_SERIF = "'Georgia', 'Times New Roman', serif"
const FONT_SANS = "'Segoe UI', Tahoma, Arial, sans-serif"

/**
 * Placeholder replaced per-subscriber by `sendCampaign({ rawHtml: true })`.
 * Must match the token the sender looks for.
 */
const UNSUB_PLACEHOLDER = "{{unsubscribe_url}}"

// ─── Social icon helper ─────────────────────────────────────────────────────

/** Renders a single circular social-media icon cell. */
function socialIcon(
  url: string,
  label: string,
  /** Single-char or short text displayed inside the circle. */
  glyph: string,
): string {
  return `<td style="padding:0 6px;">
  <a href="${url}" title="${label}" style="text-decoration:none;display:inline-block;width:32px;height:32px;border-radius:50%;border:1px solid #2a2a2a;text-align:center;line-height:32px;font-family:${FONT_SANS};font-size:11px;font-weight:600;color:${MUTED};">
    ${glyph}
  </a>
</td>`
}

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildCinematicNewsletter(data: CinematicNewsletterData): string {
  const websiteUrl = APP_URL

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" dir="ltr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Khat Podcast — Issue ${data.issueNumber}</title>
  <!--[if mso]>
  <style>
    table { border-collapse: collapse; }
    .fallback-font { font-family: Georgia, serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${FONT_SANS};color:${IVORY};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
  <tr>
    <td align="center" style="padding:0;">

      <!-- Email container (max 600px) -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${BG};">

        <!-- ═══ HEADER ═══ -->
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid ${BORDER};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:left;">
                  <a href="${websiteUrl}" style="text-decoration:none;color:${IVORY};">
                    <span style="font-family:${FONT_SERIF};font-size:24px;letter-spacing:4px;text-transform:uppercase;color:${IVORY};">Khat</span>
                    <br />
                    <span style="font-family:${FONT_SANS};font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${MUTED};">Podcast Archive</span>
                  </a>
                </td>
                <td style="text-align:right;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};line-height:1.6;">
                  Issue No. ${data.issueNumber}<br />
                  ${data.issueDate}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ HERO IMAGE + OVERLAY ═══ -->
        <tr>
          <td style="padding:32px 32px 0;">
            <!--[if mso]>
            <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:536px;height:670px;">
              <v:fill type="frame" src="${data.episodeImage}" />
              <v:textbox inset="24px,0,24px,24px" style="mso-fit-shape-to-text:true">
            <![endif]-->
            <div style="background-image:url('${data.episodeImage}');background-size:cover;background-position:center;background-color:#1a1a1a;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <!-- Spacer to push content down -->
                <tr>
                  <td style="height:320px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <!-- Gradient overlay content -->
                <tr>
                  <td style="padding:32px;background:linear-gradient(to top, ${BG} 0%, rgba(10,10,10,0.85) 40%, rgba(10,10,10,0) 100%);">
                    <!-- Badge -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                      <tr>
                        <td style="padding:4px 12px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${PURPLE};border:1px solid ${PURPLE};background-color:${PURPLE_BG};">
                          Latest Episode
                        </td>
                      </tr>
                    </table>
                    <!-- Title -->
                    <h1 style="margin:0 0 12px;font-family:${FONT_SERIF};font-size:32px;line-height:1.2;font-weight:400;color:${IVORY};">
                      ${data.episodeTitle}
                    </h1>
                    <!-- Description -->
                    <p style="margin:0 0 20px;font-size:13px;line-height:1.7;color:${MUTED};max-width:400px;">
                      ${data.episodeDescription}
                    </p>
                    <!-- Listen button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;padding-right:12px;">
                          <a href="${data.ctaLink}" style="text-decoration:none;display:inline-block;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);text-align:center;line-height:40px;">
                            <span style="font-size:14px;color:${IVORY};">&#9654;</span>
                          </a>
                        </td>
                        <td style="vertical-align:middle;">
                          <a href="${data.ctaLink}" style="text-decoration:none;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${IVORY};">Listen Now</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
            <!--[if mso]>
              </v:textbox>
            </v:rect>
            <![endif]-->
          </td>
        </tr>

        <!-- ═══ QUOTE SECTION ═══ -->
        <tr>
          <td style="padding:56px 32px;text-align:center;">
            <!-- Decorative quote mark -->
            <div style="font-family:${FONT_SERIF};font-size:80px;line-height:1;color:rgba(255,255,255,0.04);margin-bottom:-20px;">&ldquo;</div>
            <p style="margin:0 0 20px;font-family:${FONT_SERIF};font-size:24px;line-height:1.6;font-style:italic;color:${IVORY};">
              &ldquo;${data.quote}&rdquo;
            </p>
            <p style="margin:0;font-size:9px;letter-spacing:4px;text-transform:uppercase;color:${MUTED};">
              &mdash; ${data.quoteAttribution}
            </p>
          </td>
        </tr>

        <!-- ═══ DIVIDER ═══ -->
        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background-color:${BORDER};"></div>
          </td>
        </tr>

        <!-- ═══ FEATURED GUEST ═══ -->
        <tr>
          <td style="padding:48px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:top;padding-bottom:24px;">
                  <span style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${PURPLE};font-weight:600;">Featured Guest</span>
                  <h2 style="margin:8px 0 0;font-family:${FONT_SERIF};font-size:28px;font-style:italic;font-weight:400;color:${IVORY};">
                    ${data.guestName}
                  </h2>
                </td>
              </tr>
              ${data.guestBio ? `
              <tr>
                <td>
                  <p style="margin:0 0 20px;font-size:13px;line-height:1.8;color:${MUTED};">
                    ${data.guestBio}
                  </p>
                </td>
              </tr>
              ` : ""}
              <tr>
                <td>
                  <a href="${data.ctaLink}" style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${IVORY};text-decoration:none;">
                    View Full Episode &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ DIVIDER ═══ -->
        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background-color:${BORDER};"></div>
          </td>
        </tr>

        <!-- ═══ CTA SECTION ═══ -->
        <tr>
          <td style="padding:56px 32px;text-align:center;">
            <h2 style="margin:0 0 8px;font-family:${FONT_SERIF};font-size:32px;font-weight:400;color:${IVORY};">
              Continue the Journey
            </h2>
            <p style="margin:0 0 28px;font-size:13px;color:${MUTED};">
              Join our community of thinkers and storytellers.
            </p>
            <!-- Primary CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
              <tr>
                <td style="background-color:${PURPLE};padding:14px 36px;">
                  <a href="${data.ctaLink}" style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#ffffff;text-decoration:none;font-weight:600;">
                    Watch on YouTube
                  </a>
                </td>
              </tr>
            </table>
            ${data.archiveLink ? `
            <!-- Secondary CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td style="border:1px solid ${BORDER};padding:14px 36px;">
                  <a href="${data.archiveLink}" style="font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${IVORY};text-decoration:none;">
                    Explore the Archive
                  </a>
                </td>
              </tr>
            </table>
            ` : ""}
          </td>
        </tr>

        <!-- ═══ FOOTER ═══ -->
        <tr>
          <td style="padding:40px 32px;border-top:1px solid ${BORDER};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:left;vertical-align:top;">
                  <a href="${websiteUrl}" style="text-decoration:none;color:${IVORY};">
                    <span style="font-family:${FONT_SERIF};font-size:20px;letter-spacing:3px;text-transform:uppercase;color:${IVORY};">Khat</span>
                    <br />
                    <span style="font-size:8px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">Podcast</span>
                  </a>
                  <p style="margin:12px 0 0;font-size:11px;line-height:1.7;color:${MUTED};max-width:280px;">
                    A cinematic exploration of philosophy, culture, and the human experience.
                  </p>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <span style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};display:block;margin-bottom:12px;">Connect</span>
                  <!-- Social icons row -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                    <tr>
                      ${socialIcon("https://x.com/khatpodcast", "X", "&#120143;")}
                      ${socialIcon("https://instagram.com/khatpodcast", "Instagram", "&#9679;")}
                      ${socialIcon("https://youtube.com/@khatpodcast", "YouTube", "&#9654;")}
                      ${socialIcon("https://tiktok.com/@khatpodcast", "TikTok", "&#9836;")}
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ BOTTOM BAR ═══ -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid ${BORDER};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:left;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">
                  &copy; 2026 Khat Podcast
                </td>
                <td style="text-align:right;font-size:9px;letter-spacing:2px;text-transform:uppercase;">
                  <a href="${websiteUrl}/privacy" style="color:${MUTED};text-decoration:none;">Privacy</a>
                  <span style="color:#2a2a2a;padding:0 8px;">|</span>
                  <a href="${UNSUB_PLACEHOLDER}" style="color:${MUTED};text-decoration:none;">Unsubscribe</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- /Email container -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`
}
