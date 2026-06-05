import { APP_URL } from './resend'

/**
 * Strip any AI-generated unsubscribe blocks from body content so that only the
 * wrapper's own unsubscribe link survives. The AI prompt asks for
 * `{{unsubscribe_url}}` but the `emailLayout` wrapper already adds the real
 * unsubscribe link — having both causes duplication.
 */
function stripBodyUnsubscribe(html: string): string {
  // Remove anchor tags containing the placeholder
  let cleaned = html.replace(/<a[^>]*href=["']?\{\{unsubscribe_url\}\}["']?[^>]*>.*?<\/a>/gi, '')
  // Remove leftover raw placeholder text
  cleaned = cleaned.replace(/\{\{unsubscribe_url\}\}/g, '')
  // Remove now-empty paragraphs/table-cells that only contained the link
  cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/g, '')
  cleaned = cleaned.replace(/<td[^>]*>\s*<\/td>/g, '')
  return cleaned
}

// Social icon helper — renders a circular icon cell for email footer
function socialIconCell(url: string, label: string, glyph: string): string {
  return `<td style="padding:0 4px;">
  <a href="${url}" title="${label}" style="text-decoration:none;display:inline-block;width:28px;height:28px;border-radius:50%;border:1px solid #333;text-align:center;line-height:28px;font-size:11px;color:#737373;">
    ${glyph}
  </a>
</td>`
}

// Base layout wrapper — Arabic RTL, dark theme, KHAT branding
function emailLayout(content: string, unsubscribeUrl?: string): string {
  // Clean AI-generated unsubscribe placeholders from the body
  const cleanContent = stripBodyUnsubscribe(content)

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>بودكاست خط</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#141414;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #222;">
              <a href="${APP_URL}" style="text-decoration:none;color:#e5e5e5;font-size:20px;font-weight:700;letter-spacing:1px;">
                بودكاست خط
              </a>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;color:#d4d4d4;font-size:15px;line-height:1.8;">
              ${cleanContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #222;">
              <!-- Social Icons -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                <tr>
                  ${socialIconCell('https://x.com/khatpodcast', 'X', '&#120143;')}
                  ${socialIconCell('https://instagram.com/khatpodcast', 'Instagram', '&#9679;')}
                  ${socialIconCell('https://youtube.com/@khatpodcast', 'YouTube', '&#9654;')}
                  ${socialIconCell('https://tiktok.com/@khatpodcast', 'TikTok', '&#9836;')}
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#737373;font-size:12px;text-align:center;">
                بودكاست خط — khatpodcast.com
              </p>
              ${unsubscribeUrl ? `<p style="margin:0;text-align:center;"><a href="${unsubscribeUrl}" style="color:#737373;font-size:11px;text-decoration:underline;">إلغاء الاشتراك</a></p>` : ''}
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
      <td style="background-color:#e5e5e5;border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:12px 32px;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`
}

// --- Email Templates ---

export function newsletterWelcomeHtml(unsubscribeUrl: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:22px;">أهلاً بك في نشرة خط!</h2>
    <p style="margin:0 0 16px;">شكراً لاشتراكك — يسعدنا إنك هنا.</p>
    <p style="margin:0 0 16px;">من الآن، راح توصلك رسائل مختارة بعناية تشمل:</p>
    <ul style="margin:0 0 16px;padding-right:20px;padding-left:0;">
      <li style="margin-bottom:8px;">أحدث حلقات بودكاست خط</li>
      <li style="margin-bottom:8px;">اقتباسات وتأملات ملهمة</li>
      <li style="margin-bottom:8px;">محتوى حصري ما ينشر في مكان ثاني</li>
    </ul>
    <p style="margin:0 0 24px;">نوعدك — بدون إزعاج، بس محتوى يستاهل وقتك.</p>
    ${ctaButton('استكشف الحلقات', `${APP_URL}/episodes`)}
  `
  return emailLayout(content, unsubscribeUrl)
}

export function newsletterHtml(body: string, unsubscribeUrl: string): string {
  return emailLayout(body, unsubscribeUrl)
}

export function directEmailHtml(
  recipientName: string,
  subject: string,
  body: string,
  senderName: string
): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:18px;">${subject}</h2>
    <p style="margin:0 0 16px;">مرحباً ${recipientName}،</p>
    <div style="margin:0 0 24px;white-space:pre-wrap;">${body}</div>
    <p style="margin:0;color:#737373;font-size:13px;">— ${senderName}، فريق بودكاست خط</p>
  `
  return emailLayout(content)
}

// --- Submission Notification Templates ---

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#737373;font-size:14px;white-space:nowrap;vertical-align:top;padding-left:12px;">${label}</td>
    <td style="padding:6px 0;color:#e5e5e5;font-size:14px;">${value}</td>
  </tr>`
}

export function guestApplicationAdminHtml(params: {
  name: string
  email: string
  phone: string
  country: string
}): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:20px;">طلب ضيف جديد</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${detailRow('الاسم', params.name)}
      ${detailRow('البريد', params.email)}
      ${detailRow('الهاتف', params.phone)}
      ${detailRow('الدولة', params.country)}
    </table>
    ${ctaButton('مراجعة الطلب', `${APP_URL}/admin/submissions?tab=guests`)}
  `
  return emailLayout(content)
}

export function guestApplicationConfirmHtml(name: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:20px;">وصلنا قصتك، ${name}</h2>
    <p style="margin:0 0 16px;">شكراً إنك شاركتنا — نقدّر كل كلمة كتبتها.</p>
    <p style="margin:0 0 16px;">فريقنا بيراجع طلبك بعناية ويتواصل معك قريب إن شاء الله.</p>
    <p style="margin:0;color:#737373;font-size:13px;">— فريق بودكاست خط</p>
  `
  return emailLayout(content)
}

export function sponsorApplicationAdminHtml(params: {
  company: string
  contact: string
  email: string
  budget: string
}): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:20px;">طلب شراكة جديد</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${detailRow('الشركة', params.company)}
      ${detailRow('المسؤول', params.contact)}
      ${detailRow('البريد', params.email)}
      ${detailRow('الميزانية', params.budget)}
    </table>
    ${ctaButton('مراجعة الطلب', `${APP_URL}/admin/submissions?tab=sponsors`)}
  `
  return emailLayout(content)
}

export function prepSubmittedAdminHtml(params: {
  candidateName: string
  category: string | null
  completionPercent: number
  candidateId: string
}): string {
  const categoryLabel = params.category ? params.category : '—'
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:20px;">نموذج تحضير جديد مكتمل</h2>
    <p style="margin:0 0 16px;">قام مرشّح بتسليم نموذج التحضير الخاص به.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${detailRow('الاسم', params.candidateName)}
      ${detailRow('التصنيف', categoryLabel)}
      ${detailRow('نسبة الإكمال', `${Math.round(params.completionPercent)}%`)}
    </table>
    ${ctaButton('فتح ملف المرشّح', `${APP_URL}/admin/guest-candidates/${params.candidateId}`)}
    <p style="margin:16px 0 0;color:#737373;font-size:12px;">سيتم حفظ الإجابات داخل ملف المرشّح في أرشيف النماذج.</p>
  `
  return emailLayout(content)
}

export function sponsorApplicationConfirmHtml(contactName: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:20px;">شكراً لاهتمامك بالشراكة، ${contactName}</h2>
    <p style="margin:0 0 16px;">وصلنا طلبك وفريقنا بيراجعه.</p>
    <p style="margin:0 0 16px;">بنرد عليك بخطة تعاون تناسب أهدافك في أقرب وقت.</p>
    <p style="margin:0;color:#737373;font-size:13px;">— فريق بودكاست خط</p>
  `
  return emailLayout(content)
}
