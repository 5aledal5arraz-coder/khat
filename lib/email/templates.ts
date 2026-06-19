import { APP_URL } from './resend'
import { escapeHtml } from './escape'

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
// Khat brand email palette (light, Apple-editorial — deep indigo + orange).
// Mirrors the public site identity (components/brand/site-theme.ts). Hex,
// inline — email clients don't get CSS variables.
// ───────────────────────────────────────────────────────────────────────────
const BRAND = {
  indigo: '#3a2d70',
  indigoSoft: '#45367f',
  indigoDeep: '#2f2560',
  orange: '#ee6a2c',
  ink: '#1b1630',
  body: '#403a55',
  muted: '#6c6783',
  faint: '#9a93b5',
  border: '#ece9f5',
  pageBg: '#f1eef8',
  soft: '#f7f5fc',
}

// Social icon — light circular chip for the footer.
function socialIconCell(url: string, label: string, glyph: string): string {
  return `<td style="padding:0 5px;">
  <a href="${url}" title="${label}" style="text-decoration:none;display:inline-block;width:30px;height:30px;border-radius:50%;border:1px solid #ddd8ec;text-align:center;line-height:30px;font-size:12px;color:${BRAND.muted};">${glyph}</a>
</td>`
}

// The Khat mark, recreated in email-safe HTML: indigo squircle with the خط
// wordmark + an orange spark, plus the Arabic/Latin lockup.
function khatMark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:48px;height:48px;background:linear-gradient(150deg,${BRAND.indigoSoft},${BRAND.indigoDeep});border-radius:14px;text-align:center;vertical-align:middle;">
      <span style="color:#ffffff;font-size:21px;font-weight:700;line-height:48px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">خط</span>
    </td>
    <td style="padding-right:12px;vertical-align:middle;">
      <div style="font-size:17px;font-weight:800;color:${BRAND.ink};">بودكاست خط <span style="color:${BRAND.orange};font-size:12px;">&#9670;</span></div>
      <div style="font-size:10px;letter-spacing:3px;color:${BRAND.faint};text-transform:uppercase;margin-top:3px;">Podcast Khat</div>
    </td>
  </tr></table>`
}

/**
 * Premium light newsletter wrapper — brand-aligned, RTL, responsive.
 * Used for the welcome email and campaign sends. Transactional/submission
 * mail keeps the legacy `emailLayout` below.
 */
function newsletterLayout(
  content: string,
  unsubscribeUrl?: string,
  opts?: { preheader?: string },
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
  <style>
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
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" class="nl-card" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 18px 48px -28px rgba(58,45,112,0.35);">
          <!-- Header -->
          <tr>
            <td class="nl-px" style="padding:26px 34px 22px;">
              ${khatMark()}
            </td>
          </tr>
          <!-- Brand accent rule -->
          <tr>
            <td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,${BRAND.indigo} 0%,#5a47a8 50%,${BRAND.orange} 100%);background-color:${BRAND.indigo};">&nbsp;</td>
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
                  ${socialIconCell('https://x.com/khatpodcast', 'X', '&#120143;')}
                  ${socialIconCell('https://instagram.com/khatpodcast', 'Instagram', '&#9679;')}
                  ${socialIconCell('https://youtube.com/@khatpodcast', 'YouTube', '&#9654;')}
                  ${socialIconCell('https://tiktok.com/@khatpodcast', 'TikTok', '&#9836;')}
                </tr>
              </table>
              <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12.5px;text-align:center;font-weight:700;">بودكاست خط</p>
              <p style="margin:0 0 ${unsubscribeUrl ? '10' : '0'}px;text-align:center;">
                <a href="${APP_URL}" style="color:${BRAND.muted};font-size:11.5px;text-decoration:none;">khatpodcast.com</a>
              </p>
              ${unsubscribeUrl ? `<p style="margin:0;text-align:center;"><a href="${unsubscribeUrl}" style="color:${BRAND.faint};font-size:11px;text-decoration:underline;">إلغاء الاشتراك من النشرة</a></p>` : ''}
            </td>
          </tr>
        </table>
        <p style="max-width:600px;margin:18px auto 0;color:#a9a3c0;font-size:11px;text-align:center;line-height:1.6;">
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
      <td align="center" bgcolor="${BRAND.indigo}" style="border-radius:10px;background:linear-gradient(135deg,${BRAND.indigoSoft},${BRAND.indigoDeep});">
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
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td style="padding:24px 32px 20px;border-bottom:1px solid ${BRAND.border};">
              ${khatMark()}
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${BRAND.body};font-size:15px;line-height:1.8;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${BRAND.soft};border-top:1px solid ${BRAND.border};">
              <p style="margin:0;color:${BRAND.muted};font-size:12px;text-align:center;">بودكاست خط — khatpodcast.com</p>
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

export function newsletterWelcomeHtml(unsubscribeUrl: string): string {
  const content = `
    <p style="margin:0 0 10px;color:${BRAND.orange};font-size:12px;font-weight:700;letter-spacing:1.5px;">نشرة خط</p>
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
  })
}

export function newsletterHtml(body: string, unsubscribeUrl: string): string {
  return newsletterLayout(body, unsubscribeUrl)
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

export function guestApplicationConfirmHtml(name: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:20px;">وصلنا قصتك، ${escapeHtml(name)}</h2>
    <p style="margin:0 0 16px;">شكراً إنك شاركتنا — نقدّر كل كلمة كتبتها.</p>
    <p style="margin:0 0 16px;">فريقنا بيراجع طلبك بعناية ويتواصل معك قريب إن شاء الله.</p>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">— فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}

export function sponsorApplicationAdminHtml(params: {
  company: string
  contact: string
  email: string
  budget: string
}): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:20px;">طلب شراكة جديد</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${detailRow('الشركة', params.company)}
      ${detailRow('المسؤول', params.contact)}
      ${detailRow('البريد', params.email)}
      ${detailRow('الميزانية', params.budget)}
    </table>
    ${ctaButton('مراجعة الطلب', `${APP_URL}/admin/submissions?tab=sponsors`)}
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

export function sponsorApplicationConfirmHtml(contactName: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:${BRAND.ink};font-size:20px;">شكراً لاهتمامك بالشراكة، ${escapeHtml(contactName)}</h2>
    <p style="margin:0 0 16px;">وصلنا طلبك وفريقنا بيراجعه.</p>
    <p style="margin:0 0 16px;">بنرد عليك بخطة تعاون تناسب أهدافك في أقرب وقت.</p>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">— فريق بودكاست خط</p>
  `
  return legacyEmailLayout(content)
}
