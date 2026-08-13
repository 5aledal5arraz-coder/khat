import { APP_URL } from './resend'
import { escapeHtml } from './escape'
import {
  EMAIL_LOCKUP_HEIGHT,
  khatLogoGeometry,
} from '@/components/brand/khat-logo-geometry'
import { KHAT_INDIGO, KHAT_IVORY, KHAT_ORANGE } from '@/components/brand/khat-logo-art'
import {
  STANDALONE_BLUSH,
  STANDALONE_INK,
  STANDALONE_MIST,
  STANDALONE_MUTED,
  STANDALONE_STONE,
} from '@/lib/brand/standalone-css'

/**
 * Strip any AI-generated unsubscribe blocks from body content so that only the
 * wrapper's own unsubscribe link survives. The AI prompt asks for
 * `{{unsubscribe_url}}` but the layout wrapper already adds the real
 * unsubscribe link — having both causes duplication.
 */
function stripBodyUnsubscribe(html: string): string {
  let cleaned = html.replace(/<a[^>]*href=["']?\{\{unsubscribe_url\}\}["']?[^>]*>.*?<\/a>/gi, '')
  cleaned = cleaned.replace(/\{\{unsubscribe_url\}\}/g, '')
  cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/g, '')
  cleaned = cleaned.replace(/<td[^>]*>\s*<\/td>/g, '')
  return cleaned
}

// ───────────────────────────────────────────────────────────────────────────
// Khat brand email palette. Hex, inline — email clients don't get CSS
// variables, so this is the one copy of the palette that cannot read the
// tokens.
//
// `indigo` and `orange` are IMPORTED from the identity artwork, not re-typed.
// They used to be #3a2d70 / #ee6a2c — the two colours the deleted CSS lookalike
// invented, which are in no palette — plus two gradient stops (#45367f /
// #2f2560) that existed only to fake a logo tile. Those four hexes are gone
// from the codebase now; a hand-kept copy is exactly how they survived a
// cleanup that removed them everywhere else, so this file no longer keeps one.
// The neutrals below are email chrome (text, rules, page fill), not brand
// colours, and stay local.
//
// Exported because `lib/ai/content.ts` writes the newsletter BODY and used to
// carry its own typed-out copy of these hexes inside the prompt — so the AI was
// being told to compose in the invented colours, and its output lands inside
// this very wrapper. One palette, one place.
// ───────────────────────────────────────────────────────────────────────────
export const EMAIL_PALETTE = {
  indigo: KHAT_INDIGO,
  orange: KHAT_ORANGE,
  /* 2026-08-05 — EVERY VALUE BELOW IS NOW A NAMED IDENTITY COLOUR. The nine
     that stood here (#1b1630 #403a55 #6c6783 #9a93b5 #ddd7dd #ece7e7 #e5dfe2
     #d1ccd5) were described as "email chrome, not brand colours, stay local".
     That distinction does not survive Khaled's rule: the newsletter is the
     brand arriving in someone's inbox, and a near-black that is not the ink
     plus four greys that are in no palette is the site's colours only at a
     glance. «ملف عرض الشعار» carries a full set of secondaries — Warm Stone
     for rules, Soft Blush for raised fill, Lavender Mist for chips, Dusty
     Violet for meta — so nothing had to be invented to replace them. */
  ink: STANDALONE_INK,
  body: KHAT_INDIGO,
  muted: STANDALONE_MUTED,
  /* `faint` is Dusty Violet too, NOT a lighter tint of it. The palette has no
     step between Dusty Violet (4.14:1) and Warm Stone (1.4:1), and Warm Stone
     as text would be unreadable — so the two tiers merge rather than a fifth
     violet getting invented to fill the gap. */
  faint: STANDALONE_MUTED,
  border: STANDALONE_STONE,
  pageBg: KHAT_IVORY,
  soft: STANDALONE_BLUSH,
  chipBg: STANDALONE_MIST,
  chipInk: KHAT_INDIGO,
  calloutBg: STANDALONE_BLUSH,
  calloutBorder: STANDALONE_MIST,
} as const

const BRAND = EMAIL_PALETTE

/**
 * The type stack for every message.
 *
 * `Manifa V2` first — the site's own face, declared as `@font-face` below. It
 * genuinely loads in Apple Mail on iOS and macOS; **Gmail strips `@font-face`**
 * and Outlook's Word renderer ignores it, so the rest of this list is not
 * decoration, it is what those readers actually get.
 *
 * What this replaced: `'Segoe UI', Tahoma, Arial, sans-serif`. `Segoe UI` ships
 * with **Windows**, so on the iPhone where Khaled reads his own newsletter the
 * first family never resolved and the Arabic was set by whatever the client
 * chose — which is why the mail looked nothing like the site. The fallback now
 * leads with the system Arabic face; the readers a webfont cannot reach are
 * mostly on Apple and Android, not Windows.
 */
export const EMAIL_FONT_STACK =
  `'Manifa V2', -apple-system, BlinkMacSystemFont, 'SF Arabic', 'Segoe UI', Tahoma, Arial, sans-serif`

/**
 * The `@font-face` rules, shared by BOTH layouts — the newsletter and the
 * transactional one. Declared once so the confirmations and «طلب جديد»
 * notifications cannot quietly keep the fallback while the newsletter alone
 * carries the brand face.
 */
export const EMAIL_FONT_FACES = `
    @font-face {
      font-family: 'Manifa V2';
      font-style: normal;
      font-weight: 400;
      src: url('${APP_URL}/fonts/manifa-v2-400.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Manifa V2';
      font-style: normal;
      font-weight: 700;
      src: url('${APP_URL}/fonts/manifa-v2-700.woff2') format('woff2');
    }`

/**
 * Social icon — light circular chip for the footer.
 *
 * THE MARK IS A HOSTED PNG, NOT A GLYPH. This used to take a Unicode character:
 * `&#9679;` (● BLACK CIRCLE) stood for Instagram, `&#9654;` (▶) for YouTube and
 * `&#9836;` (♬ BEAMED NOTES) for TikTok. None is the platform's mark, and a
 * glyph is drawn by whatever font the mail client picks — so the row arrived as
 * a circle, a play triangle and a music note, differently in every inbox. The
 * artwork comes from `scripts/build-email-social-icons.ts`, for the same reason
 * `khatLockup()` is a raster: Gmail strips inline `<svg>` and refuses
 * `<img src="*.svg">`, and Outlook's Word renderer draws neither.
 *
 * `alt` is the platform name, so a blocked-images inbox degrades to a readable
 * row of words rather than four broken-image icons.
 */
function socialIconCell(url: string, label: string, icon: string): string {
  return `<td style="padding:0 5px;">
  <a href="${url}" title="${label}" style="text-decoration:none;display:inline-block;width:30px;height:30px;border-radius:50%;border:1px solid ${BRAND.border};text-align:center;line-height:30px;">
    <img src="${APP_URL}/brand/social/${icon}.png" width="15" height="15" alt="${label}" style="display:inline-block;border:0;outline:none;vertical-align:middle;width:15px;height:15px;color:${BRAND.muted};font-size:9px;font-family:${EMAIL_FONT_STACK};" />
  </a>
</td>`
}

/**
 * The accounts the footer links to.
 *
 * ⚠️ THESE MUST MATCH `podcast_platform_links` — the table the site footer reads
 * and Khaled maintains. The hardcoded set that stood here had drifted: it linked
 * `instagram.com/khatpodcast` and `x.com/khatpodcast` while the real handles are
 * `Khat.Podcast` and `Khat_Podcast`. Nothing caught it, because Instagram and X
 * answer **200 behind a login wall** for a handle that does not exist — a link
 * check sees a healthy page. Only a shared source catches this.
 *
 * This is the FALLBACK; `getEmailSocialLinks()` (lib/email/social.ts) reads the
 * live rows and the send paths pass them in.
 */
export const EMAIL_SOCIAL_LINKS: { key: string; label: string; url: string }[] = [
  { key: "youtube", label: "YouTube", url: "https://www.youtube.com/@KhatPodcast" },
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/Khat.Podcast" },
  { key: "x", label: "X", url: "https://x.com/Khat_Podcast" },
  { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@khatpodcast" },
]

/**
 * The Khat logo in email — the real horizontal lockup, as a hosted PNG.
 *
 * WHAT THIS REPLACED. This function used to *rebuild* the logo out of table
 * HTML: a gradient-filled rounded square, the string "خط" set in Segoe UI, and
 * an orange &#9670; diamond, in four invented colours. It was the same lookalike
 * that was deleted from `components/`, `lib/pdf/`, and the media kit — but it
 * survived here, and this file is on the campaign send path
 * (`lib/newsletter/sender.ts` → `newsletterHtml` → `newsletterLayout`), so the
 * fake went to every subscriber. The real khaa is a custom speech-bubble drawing
 * that no typeface contains, so "خط" in a UI font is not a small deviation.
 *
 * WHY A RASTER AND NOT THE VECTOR. Everywhere else in this codebase the logo is
 * inlined SVG. Email cannot take it: Gmail strips inline `<svg>` from message
 * bodies and will not load `<img src="*.svg">`, and Outlook's Word-based
 * renderer supports neither. A hosted PNG at an absolute URL is the only form
 * that renders in Gmail, Apple Mail, and Outlook alike. It is generated from
 * `public/brand/khat-lockup-horizontal.svg` by `scripts/build-brand-icons.ts`
 * at 2x for retina — the artwork, downscaled, never redrawn.
 *
 * WHEN IMAGES ARE BLOCKED. Outlook and some corporate clients suppress remote
 * images until the reader opts in. The `alt` text is styled so that state
 * degrades to the brand name in brand indigo rather than a broken-image icon.
 * No HTML wordmark sits beside the image: the lockup already carries
 * "بودكاست خط / PODCAST KHAT" as artwork, and duplicating it in a UI font is
 * how the last replica started.
 *
 * THE ONE TYPESET NAME IN THIS FILE is `class="nl-footer-brand"`, the running
 * foot at the bottom of both layouts — the sign-off line beside the URL, the
 * same case as the media kit's print footer. It carries that class for one
 * reason: the typeset-name guard exempts it BY NAME, so renaming the class or
 * moving the name anywhere else in this file fails
 * tests/brand/outward-surfaces.test.ts instead of passing quietly.
 *
 * NO CSS GRADIENTS ANYWHERE IN THIS FILE. Outlook's Word renderer drops
 * `linear-gradient` outright, so every gradient here was a brand element that
 * only some readers ever saw — and each one carried a stop colour that is in no
 * palette. Flat brand colours, in nested table cells, render everywhere.
 */
function khatLockup(): string {
  // Sized through the shared geometry helper, so email is held to the same
  // MIN_HEIGHT guard as every other surface instead of hard-coding a number.
  const { width, height } = khatLogoGeometry('lockup-horizontal', EMAIL_LOCKUP_HEIGHT)
  return `<img src="${APP_URL}/brand/email-lockup.png" width="${Math.round(width)}" height="${Math.round(height)}" alt="بودكاست خط" style="display:block;border:0;outline:none;text-decoration:none;width:${Math.round(width)}px;height:${Math.round(height)}px;color:${BRAND.indigo};font-size:17px;font-weight:800;font-family:${EMAIL_FONT_STACK};" />`
}

/**
 * Premium light newsletter wrapper — brand-aligned, RTL, responsive.
 * Used for the welcome email and campaign sends. Transactional/submission
 * mail keeps the legacy `emailLayout` below.
 */
function newsletterLayout(
  content: string,
  unsubscribeUrl?: string,
  opts?: { preheader?: string; social?: typeof EMAIL_SOCIAL_LINKS },
): string {
  const cleanContent = stripBodyUnsubscribe(content)
  const preheader = opts?.preheader || 'نشرة بودكاست خط — حوارات تستحق أن تبقى.'

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>بودكاست خط</title>
  <style>${EMAIL_FONT_FACES}
    body { margin:0; padding:0; }
    a { color:${BRAND.indigo}; }
    .nl-content h1, .nl-content h2, .nl-content h3 { color:${BRAND.ink}; line-height:1.35; margin:0 0 14px; font-weight:800; }
    .nl-content h2 { font-size:21px; }
    .nl-content h3 { font-size:18px; }
    .nl-content p { margin:0 0 16px; color:${BRAND.body}; font-size:16px; line-height:1.85; }
    .nl-content a { color:${BRAND.indigo}; font-weight:600; }
    .nl-content img { max-width:100%; height:auto; border-radius:12px; }
    .nl-content ul, .nl-content ol { margin:0 0 16px; padding-right:20px; padding-left:0; }
    .nl-content li { margin-bottom:8px; color:${BRAND.body}; }
    @media (max-width:620px) {
      .nl-card { width:100% !important; border-radius:0 !important; }
      .nl-px { padding-left:22px !important; padding-right:22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};font-family:${EMAIL_FONT_STACK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" class="nl-card" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 18px 48px -28px rgba(58,45,112,0.35);">
          <!-- Header -->
          <tr>
            <td class="nl-px" style="padding:26px 34px 22px;">
              ${khatLockup()}
            </td>
          </tr>
          <!-- Brand accent rule: two flat bands in a nested table. See the
               note above khatLockup() for why this is not a CSS gradient. NB
               this is a real HTML comment that ships inside every message, so
               keep it short and keep retired colour values out of it. -->
          <tr>
            <td style="height:4px;line-height:4px;font-size:0;padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="70%" bgcolor="${BRAND.indigo}" style="height:4px;line-height:4px;font-size:0;background-color:${BRAND.indigo};">&nbsp;</td>
                  <td width="30%" bgcolor="${BRAND.orange}" style="height:4px;line-height:4px;font-size:0;background-color:${BRAND.orange};">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td class="nl-content nl-px" style="padding:38px 34px;color:${BRAND.body};font-size:16px;line-height:1.85;">
              ${cleanContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="nl-px" style="padding:26px 34px;background-color:${BRAND.soft};border-top:1px solid ${BRAND.border};">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;">
                <tr>
                  ${(opts?.social ?? EMAIL_SOCIAL_LINKS).map((s) => socialIconCell(s.url, s.label, s.key)).join('\n                  ')}
                </tr>
              </table>
              <p class="nl-footer-brand" style="margin:0 0 6px;color:${BRAND.muted};font-size:12.5px;text-align:center;font-weight:700;">بودكاست خط</p>
              <p style="margin:0 0 ${unsubscribeUrl ? '10' : '0'}px;text-align:center;">
                <a href="${APP_URL}" style="color:${BRAND.muted};font-size:11.5px;text-decoration:none;">khatpodcast.com</a>
              </p>
              ${unsubscribeUrl ? `<p style="margin:0;text-align:center;"><a href="${unsubscribeUrl}" style="color:${BRAND.faint};font-size:11px;text-decoration:underline;">إلغاء الاشتراك من النشرة</a></p>` : ''}
            </td>
          </tr>
        </table>
        <p style="max-width:600px;margin:18px auto 0;color:${BRAND.faint};font-size:11px;text-align:center;line-height:1.6;">
          وصلتك هذه الرسالة لأنك مشترك في نشرة بودكاست خط.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Bulletproof indigo CTA button for newsletter emails. */
function ctaButtonLight(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 6px;">
    <tr>
      <td align="center" bgcolor="${BRAND.indigo}" style="border-radius:10px;background-color:${BRAND.indigo};">
        <a href="${url}" style="display:inline-block;padding:14px 38px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">${text} &#8592;</a>
      </td>
    </tr>
  </table>`
}

/** A welcome "what you'll get" row: orange spark + bold title + muted line. */
function valueRow(title: string, desc: string): string {
  return `<tr>
    <td style="padding:9px 0;vertical-align:top;width:20px;"><span style="color:${BRAND.orange};font-size:13px;">&#9670;</span></td>
    <td style="padding:9px 0;">
      <span style="color:${BRAND.ink};font-size:15px;font-weight:700;">${escapeHtml(title)}</span><br/>
      <span style="color:${BRAND.muted};font-size:13.5px;line-height:1.6;">${escapeHtml(desc)}</span>
    </td>
  </tr>`
}

// ───────────────────────────────────────────────────────────────────────────
// Legacy layout (transactional / submission notifications). Kept as-is in
// structure; user-supplied fields are HTML-escaped at the call sites below.
// ───────────────────────────────────────────────────────────────────────────
function legacyEmailLayout(content: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>بودكاست خط</title>
  <style>${EMAIL_FONT_FACES}</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};font-family:${EMAIL_FONT_STACK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td style="padding:24px 32px 20px;border-bottom:1px solid ${BRAND.border};">
              ${khatLockup()}
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${BRAND.body};font-size:15px;line-height:1.8;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${BRAND.soft};border-top:1px solid ${BRAND.border};">
              <p class="nl-footer-brand" style="margin:0;color:${BRAND.muted};font-size:12px;text-align:center;">بودكاست خط — khatpodcast.com</p>
              ${unsubscribeUrl ? `<p style="margin:8px 0 0;text-align:center;"><a href="${unsubscribeUrl}" style="color:${BRAND.faint};font-size:11px;text-decoration:underline;">إلغاء الاشتراك</a></p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr>
      <td align="center" bgcolor="${BRAND.indigo}" style="border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${text}</a>
      </td>
    </tr>
  </table>`
}

// --- Newsletter Templates (premium light layout) ---

export function newsletterWelcomeHtml(
  unsubscribeUrl: string,
  social?: typeof EMAIL_SOCIAL_LINKS,
): string {
  const content = `
    <p style="margin:0 0 10px;color:${BRAND.orange};font-size:12px;font-weight:700;">نشرة خط</p>
    <h1 style="margin:0 0 16px;color:${BRAND.ink};font-size:26px;font-weight:800;line-height:1.3;">أهلاً بك في نشرة خط</h1>
    <p style="margin:0 0 18px;color:${BRAND.body};font-size:16px;line-height:1.85;">شكراً لاشتراكك — يسعدنا وجودك معنا. من الآن، راح توصلك رسائل مختارة بعناية:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 22px;">
      ${valueRow('أحدث الحلقات', 'جديد بودكاست خط، أول بأول.')}
      ${valueRow('اقتباسات وتأملات', 'أفكار ملهمة تستحق التوقّف عندها.')}
      ${valueRow('محتوى حصري', 'لا يُنشر في أي مكان آخر.')}
    </table>
    <p style="margin:0;color:${BRAND.body};font-size:16px;line-height:1.85;">وعدنا لك: بدون إزعاج — فقط محتوى يستحق وقتك.</p>
    ${ctaButtonLight('استكشف الحلقات', `${APP_URL}/episodes`)}
  `
  return newsletterLayout(content, unsubscribeUrl, {
    preheader: 'أهلاً بك في نشرة خط — حوارات تستحق أن تبقى.',
    social,
  })
}

export function newsletterHtml(
  body: string,
  unsubscribeUrl: string,
  social?: typeof EMAIL_SOCIAL_LINKS,
): string {
  return newsletterLayout(body, unsubscribeUrl, { social })
}

// --- Transactional Templates ---

export function directEmailHtml(
  recipientName: string,
  subject: string,
  body: string,
  senderName: string
): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:18px;">${escapeHtml(subject)}</h2>
    <p style="margin:0 0 16px;">مرحباً ${escapeHtml(recipientName)}،</p>
    <div style="margin:0 0 24px;white-space:pre-wrap;">${escapeHtml(body)}</div>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">— ${escapeHtml(senderName)}، فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

// --- Submission Notification Templates ---

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:${BRAND.muted};font-size:14px;white-space:nowrap;vertical-align:top;padding-left:12px;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:${BRAND.ink};font-size:14px;">${escapeHtml(value)}</td>
  </tr>`
}

export function guestApplicationAdminHtml(params: {
  name: string
  email: string
  phone: string
  country: string
}): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:20px;">طلب ضيف جديد</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${detailRow('الاسم', params.name)}
      ${detailRow('البريد', params.email)}
      ${detailRow('الهاتف', params.phone)}
      ${detailRow('الدولة', params.country)}
    </table>
    ${ctaButton('مراجعة الطلب', `${APP_URL}/admin/submissions?tab=guests`)}
  `
  return legacyEmailLayout(content)
}

export function guestApplicationConfirmHtml(name: string, reference?: string): string {
  const step = (n: string, title: string, body: string) => `
    <tr>
      <td valign="top" style="width:30px;padding:0 0 14px;">
        <div style="width:24px;height:24px;border-radius:999px;background:${BRAND.chipBg};color:${BRAND.chipInk};font-weight:700;font-size:12px;text-align:center;line-height:24px;">${n}</div>
      </td>
      <td valign="top" style="padding:0 0 14px 10px;">
        <div style="font-weight:700;color:${BRAND.ink};font-size:14px;">${title}</div>
        <div style="color:${BRAND.muted};font-size:13px;line-height:1.6;">${body}</div>
      </td>
    </tr>`
  const refBlock = reference
    ? `<div style="margin:0 0 20px;padding:14px 16px;border-radius:12px;background:${BRAND.calloutBg};border:1px solid ${BRAND.calloutBorder};text-align:center;">
         <div style="color:${BRAND.muted};font-size:11px;">رقمك المرجعي</div>
         <div style="color:${BRAND.chipInk};font-weight:800;font-size:18px;letter-spacing:1px;direction:ltr;">${escapeHtml(reference)}</div>
       </div>`
    : ''
  const trackBlock = reference
    ? ctaButton('تابِع حالة طلبك', `${APP_URL}/guest/status?ref=${encodeURIComponent(reference)}`)
    : ''
  const content = `
    <h2 style="margin:0 0 12px;color:${BRAND.ink};font-size:20px;">وصلتنا قصتك، ${escapeHtml(name)}</h2>
    <p style="margin:0 0 18px;color:${BRAND.muted};font-size:14px;line-height:1.7;">
      شكرًا أنك شاركتنا — نقرأ كل كلمة بعناية. هذا ليس نموذجًا عاديًا، وطلبك ليس رقمًا في قائمة.
      الصمت لا يعني الرفض؛ نحتفظ بالقصص القوية ونعود إليها حين يحين وقتها المناسب.
    </p>
    ${refBlock}
    <div style="font-weight:700;color:${BRAND.ink};font-size:14px;margin:0 0 12px;">ما الذي يحدث الآن؟</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;">
      ${step('١', 'نقرأ قصتك', 'يطّلع فريقنا التحريري على طلبك بعناية ويقيّمه كقصة تستحق حلقة.')}
      ${step('٢', 'قد نتواصل', 'إن كانت قصتك تناسب خط، نعود إليك عبر البريد لترتيب استبيان قصير وموعد تسجيل.')}
      ${step('٣', 'نبقى على تواصل', 'يمكنك متابعة حالة طلبك في أي وقت برقمك المرجعي وبريدك.')}
    </table>
    ${trackBlock}
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">الحوار يبدأ من هنا — فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

export function communityContributionConfirmHtml(
  name: string,
  typeLabel: string,
  reference?: string,
): string {
  const greeting = name ? `، ${escapeHtml(name)}` : ""
  const refBlock = reference
    ? `<div style="margin:0 0 20px;padding:14px 16px;border-radius:12px;background:${BRAND.calloutBg};border:1px solid ${BRAND.calloutBorder};text-align:center;">
         <div style="color:${BRAND.muted};font-size:11px;">رقمك المرجعي</div>
         <div style="color:${BRAND.chipInk};font-weight:800;font-size:18px;letter-spacing:1px;direction:ltr;">${escapeHtml(reference)}</div>
       </div>`
    : ""
  const content = `
    <h2 style="margin:0 0 12px;color:${BRAND.ink};font-size:20px;">وصلتنا مساهمتك${greeting}</h2>
    <p style="margin:0 0 18px;color:${BRAND.body};font-size:14px;line-height:1.7;">
      شكرًا أنك شاركتنا «${escapeHtml(typeLabel)}». خط يُصنع معكم — نقرأ كل مساهمة بعناية،
      وقد نبني عليها حلقة قادمة أو نعود إليك لمزيد من التفاصيل. وإن استخدمناها، يسعدنا أن نذكر فضلك.
    </p>
    ${refBlock}
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">شكرًا لكونك جزءًا من خط — فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

/**
 * Outcome follow-up — sent once when a contribution is accepted or routed into
 * production. Closes the loop so contributors see their idea actually land.
 */
export function communityOutcomeHtml(
  name: string,
  typeLabel: string,
  outcome: "accepted" | "routed",
  reference?: string,
): string {
  const greeting = name ? `، ${escapeHtml(name)}` : ""
  const headline =
    outcome === "routed"
      ? `فكرتك دخلت ورشة خط${greeting} <span style="color:${BRAND.orange};">&#9670;</span>`
      : `مساهمتك لفتت انتباهنا${greeting}`
  const lead =
    outcome === "routed"
      ? `«${escapeHtml(typeLabel)}» الذي شاركتنا انتقل الآن إلى مرحلة الإنتاج في خط، وصار جزءًا مما نبني عليه حلقاتنا القادمة. هذا بفضلك.`
      : `راجعنا «${escapeHtml(typeLabel)}» الذي اقترحته، وأعجبَنا فعلًا. صار الآن قيد الدراسة الجدّية ضمن خططنا القادمة، وقد نعود إليك ونحن نطوّره.`
  const refBlock = reference
    ? `<div style="margin:0 0 20px;padding:14px 16px;border-radius:12px;background:${BRAND.calloutBg};border:1px solid ${BRAND.calloutBorder};text-align:center;">
         <div style="color:${BRAND.muted};font-size:11px;">رقمك المرجعي</div>
         <div style="color:${BRAND.chipInk};font-weight:800;font-size:18px;letter-spacing:1px;direction:ltr;">${escapeHtml(reference)}</div>
       </div>`
    : ""
  const content = `
    <h2 style="margin:0 0 12px;color:${BRAND.ink};font-size:20px;">${headline}</h2>
    <p style="margin:0 0 18px;color:${BRAND.body};font-size:14px;line-height:1.7;">${lead}</p>
    ${refBlock}
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">خط يُصنع معكم — شكرًا لكونك جزءًا منه. فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

export function guestPrepConfirmHtml(name: string): string {
  const content = `
    <h2 style="margin:0 0 12px;color:${BRAND.ink};font-size:20px;">استلمنا إجاباتك، ${escapeHtml(name)}</h2>
    <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14px;line-height:1.7;">
      شكرًا على تعبئة استبيان التحضير. سيتواصل معك فريق خط قريبًا لتأكيد موعد التسجيل ومشاركة تفاصيل الاستوديو.
    </p>
    <p style="margin:0 0 16px;color:${BRAND.muted};font-size:13px;line-height:1.7;">
      تذكير بسيط: نحبّ أن تصل قبل التسجيل بثلاثين دقيقة، وأن تكون الملابس بألوان موحّدة وهادئة. لا حاجة لتحضير إجابات — الحوار طبيعي وعفوي.
    </p>
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">بانتظارك — فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

export function sponsorApplicationAdminHtml(params: {
  company: string
  contact: string
  email: string
  budget: string
  reference?: string
}): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:20px;">طلب شراكة جديد — ${escapeHtml(params.company)}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;">
      ${params.reference ? detailRow('المرجع', params.reference) : ''}
      ${detailRow('الشركة', params.company)}
      ${detailRow('المسؤول', params.contact)}
      ${detailRow('البريد', params.email)}
      ${detailRow('الميزانية', params.budget)}
    </table>
    <div style="margin:0 0 20px;padding:12px 14px;border-radius:10px;background:${BRAND.calloutBg};border:1px solid ${BRAND.calloutBorder};color:${BRAND.indigo};font-size:13px;">
      🤖 يجري الآن تقييم الذكاء الاصطناعي تلقائيًا (بحث عن الشركة + تقييم ملاءمة + توصية). افتح الطلب لرؤية النتيجة والإجراء الموصى به.
    </div>
    ${ctaButton('مراجعة الطلب', `${APP_URL}/admin/submissions?tab=sponsors`)}
  `
  return legacyEmailLayout(content)
}

export interface PartnerReminderItem {
  company: string
  title: string
  dueLabel: string
  overdue: boolean
  priority: string
  leadId: string
}

export function partnerTaskReminderHtml(params: { items: PartnerReminderItem[] }): string {
  const overdueCount = params.items.filter((i) => i.overdue).length
  const cards = params.items
    .map((it) => {
      const accent = it.overdue ? BRAND.orange : BRAND.indigo
      const dueColor = it.overdue ? BRAND.orange : BRAND.muted
      const flag = it.priority === "high" ? ' <span style="color:' + BRAND.orange + ';">● عالية</span>' : ""
      return `
      <div style="border:1px solid ${BRAND.border};border-inline-start:4px solid ${accent};border-radius:10px;padding:12px 14px;margin:0 0 10px;">
        <div style="color:${BRAND.ink};font-size:15px;font-weight:700;">${escapeHtml(it.title)}${flag}</div>
        <div style="color:${BRAND.muted};font-size:13px;margin:3px 0 8px;">${escapeHtml(it.company)} · <span style="color:${dueColor};font-weight:600;">${escapeHtml(it.dueLabel)}</span></div>
        <a href="${APP_URL}/admin/partnerships/${encodeURIComponent(it.leadId)}" style="color:${BRAND.indigo};font-size:13px;font-weight:600;text-decoration:none;">فتح ملف الشراكة ←</a>
      </div>`
    })
    .join("")
  const content = `
    <h2 style="margin:0 0 8px;color:${BRAND.ink};font-size:20px;">مهام شراكة بحاجة لمتابعة</h2>
    <p style="margin:0 0 18px;color:${BRAND.body};font-size:14px;">
      لديك ${params.items.length} مهمة بانتظارك${overdueCount ? `، منها ${overdueCount} متأخرة` : ""}. تابعها قبل أن تبرد الفرصة.
    </p>
    ${cards}
    ${ctaButton('فتح خط الشراكات', `${APP_URL}/admin/partnerships/pipeline`)}
  `
  return legacyEmailLayout(content)
}

export function prepSubmittedAdminHtml(params: {
  candidateName: string
  category: string | null
  completionPercent: number
  candidateId: string
}): string {
  const categoryLabel = params.category ? params.category : '—'
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:20px;">نموذج تحضير جديد مكتمل</h2>
    <p style="margin:0 0 16px;">قام مرشّح بتسليم نموذج التحضير الخاص به.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${detailRow('الاسم', params.candidateName)}
      ${detailRow('التصنيف', categoryLabel)}
      ${detailRow('نسبة الإكمال', `${Math.round(params.completionPercent)}%`)}
    </table>
    ${ctaButton('فتح ملف المرشّح', `${APP_URL}/admin/guest-candidates/${params.candidateId}`)}
    <p style="margin:16px 0 0;color:${BRAND.muted};font-size:12px;">سيتم حفظ الإجابات داخل ملف المرشّح في أرشيف النماذج.</p>
  `
  return legacyEmailLayout(content)
}

/**
 * The offer link, sent to the company's registered contact.
 *
 * ⚠️ THIS TEMPLATE CANNOT BE GIVEN THE PASSWORD, BY SIGNATURE. It takes
 * `passwordProtected: boolean` — never the password, never its hash. One message
 * carrying both the lock and its key is not a lock: anyone who reaches that
 * inbox (a forward, a shared mailbox, a breach) gets the gate and the way
 * through it in the same scroll. The password travels on another channel, and
 * the mail only says so. A guard test asserts the absence, but the parameter
 * list is what makes the mistake unwritable in the first place.
 *
 * Short on purpose: the offer is the page, not the email.
 */
export function partnershipOfferHtml(params: {
  companyName: string
  contactName: string
  offerUrl: string
  passwordProtected: boolean
}): string {
  const passwordNote = params.passwordProtected
    ? `<div style="margin:20px 0 0;padding:14px 16px;border-radius:12px;background:${BRAND.calloutBg};border:1px solid ${BRAND.calloutBorder};">
         <div style="color:${BRAND.ink};font-size:13px;font-weight:700;">الصفحة محميّة بكلمة مرور</div>
         <div style="color:${BRAND.muted};font-size:13px;line-height:1.7;">تصلكم كلمة المرور في رسالة منفصلة عبر قناة أخرى — لا ترد في هذا البريد.</div>
       </div>`
    : ''
  const content = `
    <h2 style="margin:0 0 12px;color:${BRAND.ink};font-size:20px;">عرض شراكة — خط × ${escapeHtml(params.companyName)}</h2>
    <p style="margin:0 0 8px;color:${BRAND.body};font-size:15px;line-height:1.8;">
      أهلاً ${escapeHtml(params.contactName)}، أعددنا لكم عرض شراكة خاصاً بـ${escapeHtml(params.companyName)}.
    </p>
    <p style="margin:0 0 4px;color:${BRAND.muted};font-size:14px;line-height:1.8;">
      العرض في صفحة خاصة بكم — تفتحونها متى شئتم، وتردّون علينا منها مباشرة.
    </p>
    ${ctaButton('افتح العرض', params.offerUrl)}
    ${passwordNote}
    <p style="margin:20px 0 0;color:${BRAND.muted};font-size:13px;">— فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

export function sponsorApplicationConfirmHtml(contactName: string, reference?: string): string {
  const step = (n: string, title: string, body: string) => `
    <tr>
      <td valign="top" style="width:30px;padding:0 0 14px;">
        <div style="width:24px;height:24px;border-radius:999px;background:${BRAND.chipBg};color:${BRAND.chipInk};font-weight:700;font-size:12px;text-align:center;line-height:24px;">${n}</div>
      </td>
      <td valign="top" style="padding:0 0 14px 10px;">
        <div style="font-weight:700;color:${BRAND.ink};font-size:14px;">${title}</div>
        <div style="color:${BRAND.muted};font-size:13px;line-height:1.6;">${body}</div>
      </td>
    </tr>`
  const refBlock = reference
    ? `<div style="margin:0 0 20px;padding:14px 16px;border-radius:12px;background:${BRAND.calloutBg};border:1px solid ${BRAND.calloutBorder};text-align:center;">
         <div style="color:${BRAND.muted};font-size:11px;">رقمك المرجعي</div>
         <div style="color:${BRAND.chipInk};font-weight:800;font-size:18px;letter-spacing:1px;direction:ltr;">${escapeHtml(reference)}</div>
       </div>`
    : ''
  const content = `
    <h2 style="margin:0 0 12px;color:${BRAND.ink};font-size:20px;">تمّ استلام طلب الشراكة، ${escapeHtml(contactName)}</h2>
    <p style="margin:0 0 18px;color:${BRAND.muted};font-size:14px;line-height:1.7;">
      شكرًا لاهتمامك بالشراكة مع خط — لسنا منصة إعلانات، بل نبحث عن شركاء محتوى يشاركوننا الرؤية.
      دخل طلبك قيد المراجعة، وسنعود إليك بمقترح مصمّم حول أهدافك.
    </p>
    ${refBlock}
    <div style="font-weight:700;color:${BRAND.ink};font-size:14px;margin:0 0 12px;">ما الخطوات التالية؟</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;">
      ${step('١', 'ندرس علامتك', 'يطّلع فريقنا على علامتك وجمهورك وأهدافك بعناية.')}
      ${step('٢', 'نصمّم مقترحًا', 'نُعدّ خطة شراكة وعدد حلقات ونطاقًا يناسب أهدافك.')}
      ${step('٣', 'نعود إليك', 'نتواصل معك خلال أيام عمل قليلة لمناقشة التفاصيل.')}
    </table>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">— فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}
