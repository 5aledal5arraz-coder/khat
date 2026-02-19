import { APP_URL } from './resend'

// Base layout wrapper — Arabic RTL, dark theme, KHAT branding
function emailLayout(content: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>خط بودكاست</title>
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
                خط بودكاست
              </a>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;color:#d4d4d4;font-size:15px;line-height:1.8;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #222;text-align:center;">
              <p style="margin:0 0 8px;color:#737373;font-size:12px;">
                خط بودكاست — khatpodcast.com
              </p>
              ${unsubscribeUrl ? `<p style="margin:0;"><a href="${unsubscribeUrl}" style="color:#737373;font-size:11px;text-decoration:underline;">إلغاء الاشتراك</a></p>` : ''}
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

export function welcomeEmailHtml(displayName: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:22px;">أهلاً ${displayName} 👋</h2>
    <p style="margin:0 0 16px;">مرحباً بك في مجتمع خط بودكاست! يسعدنا انضمامك.</p>
    <p style="margin:0 0 8px;">يمكنك الآن:</p>
    <ul style="margin:0 0 16px;padding-right:20px;padding-left:0;">
      <li style="margin-bottom:8px;">مشاركة أفكارك وتأملاتك في حبر</li>
      <li style="margin-bottom:8px;">التعليق على المقالات والتفاعل مع المجتمع</li>
      <li style="margin-bottom:8px;">متابعة الكتّاب المفضلين لديك</li>
    </ul>
    ${ctaButton('ابدأ الاستكشاف', `${APP_URL}/space`)}
  `
  return emailLayout(content)
}

export function commentNotificationHtml(
  ownerName: string,
  commenterName: string,
  articleTitle: string,
  commentPreview: string,
  articleUrl: string,
  unsubscribeUrl: string
): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:18px;">تعليق جديد على مقالك</h2>
    <p style="margin:0 0 16px;">مرحباً ${ownerName}، علّق <strong style="color:#e5e5e5;">${commenterName}</strong> على مقالك "<strong style="color:#e5e5e5;">${articleTitle}</strong>":</p>
    <div style="padding:16px;background-color:#1a1a1a;border-radius:8px;border-right:3px solid #525252;margin:0 0 16px;">
      <p style="margin:0;color:#a3a3a3;font-size:14px;">${commentPreview}</p>
    </div>
    ${ctaButton('عرض التعليق', articleUrl)}
  `
  return emailLayout(content, unsubscribeUrl)
}

export function replyNotificationHtml(
  ownerName: string,
  replierName: string,
  thoughtPreview: string,
  thoughtUrl: string,
  unsubscribeUrl: string
): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:18px;">رد جديد على خاطرتك</h2>
    <p style="margin:0 0 16px;">مرحباً ${ownerName}، ردّ <strong style="color:#e5e5e5;">${replierName}</strong> على خاطرتك:</p>
    <div style="padding:16px;background-color:#1a1a1a;border-radius:8px;border-right:3px solid #525252;margin:0 0 16px;">
      <p style="margin:0;color:#a3a3a3;font-size:14px;">${thoughtPreview}</p>
    </div>
    ${ctaButton('عرض الرد', thoughtUrl)}
  `
  return emailLayout(content, unsubscribeUrl)
}

export function likeNotificationHtml(
  ownerName: string,
  likerName: string,
  targetType: string,
  targetUrl: string,
  unsubscribeUrl: string
): string {
  const typeLabels: Record<string, string> = {
    article: 'مقالك',
    thought: 'خاطرتك',
    comment: 'تعليقك',
    reply: 'ردك',
  }
  const label = typeLabels[targetType] || 'محتواك'
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:18px;">إعجاب جديد</h2>
    <p style="margin:0 0 16px;">مرحباً ${ownerName}، أعجب <strong style="color:#e5e5e5;">${likerName}</strong> بـ${label}.</p>
    ${ctaButton('عرض المحتوى', targetUrl)}
  `
  return emailLayout(content, unsubscribeUrl)
}

export function followNotificationHtml(
  userName: string,
  followerName: string,
  followerUrl: string,
  unsubscribeUrl: string
): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:18px;">متابع جديد</h2>
    <p style="margin:0 0 16px;">مرحباً ${userName}، بدأ <strong style="color:#e5e5e5;">${followerName}</strong> بمتابعتك!</p>
    ${ctaButton('عرض الملف الشخصي', followerUrl)}
  `
  return emailLayout(content, unsubscribeUrl)
}

export function newsletterHtml(body: string, unsubscribeUrl: string): string {
  return emailLayout(body, unsubscribeUrl)
}
