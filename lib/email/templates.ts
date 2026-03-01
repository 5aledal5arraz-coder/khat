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

export function newsletterWelcomeHtml(unsubscribeUrl: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:22px;">أهلاً بك في نشرة خط!</h2>
    <p style="margin:0 0 16px;">شكراً لاشتراكك — يسعدنا إنك هنا.</p>
    <p style="margin:0 0 16px;">من الآن، راح توصلك رسائل مختارة بعناية تشمل:</p>
    <ul style="margin:0 0 16px;padding-right:20px;padding-left:0;">
      <li style="margin-bottom:8px;">أحدث حلقات خط بودكاست</li>
      <li style="margin-bottom:8px;">اقتباسات وتأملات ملهمة</li>
      <li style="margin-bottom:8px;">محتوى حصري ما ينشر في مكان ثاني</li>
    </ul>
    <p style="margin:0 0 24px;">نوعدك — بدون إزعاج، بس محتوى يستاهل وقتك.</p>
    ${ctaButton('استكشف الحلقات', `${APP_URL}/episodes`)}
  `
  return emailLayout(content, unsubscribeUrl)
}

export function monthlyNewsletterHtml(params: {
  monthName: string
  year: number
  featured: {
    title: string
    slug: string
    thumbnail_url: string | null
    guest: { name: string; photo_url: string | null } | null
  }
  quotes: { text: string; theme: string | null }[]
  otherEpisodes: {
    title: string
    slug: string
    thumbnail_url: string | null
    guest: { name: string } | null
  }[]
}): string {
  const { monthName, year, featured, quotes, otherEpisodes } = params
  const episodeUrl = `${APP_URL}/episodes/${featured.slug}`

  // Featured thumbnail
  const thumbnailHtml = featured.thumbnail_url
    ? `<a href="${episodeUrl}" style="text-decoration:none;">
        <img src="${featured.thumbnail_url}" alt="${featured.title}" width="536" style="width:100%;max-width:536px;border-radius:8px;display:block;" />
      </a>`
    : ''

  // Guest row with photo
  const guestHtml = featured.guest
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
        <tr>
          <td style="vertical-align:middle;padding-left:10px;">
            ${featured.guest.photo_url
              ? `<img src="${featured.guest.photo_url}" alt="${featured.guest.name}" width="40" height="40" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;" />`
              : `<div style="width:40px;height:40px;border-radius:50%;background-color:#333;display:flex;align-items:center;justify-content:center;color:#999;font-size:16px;">${featured.guest.name.charAt(0)}</div>`
            }
          </td>
          <td style="vertical-align:middle;color:#a3a3a3;font-size:14px;">
            ${featured.guest.name}
          </td>
        </tr>
      </table>`
    : ''

  // Quote callout boxes
  const quotesHtml = quotes.length > 0
    ? quotes.map((q) => `
      <div style="padding:16px;background-color:#1a1a1a;border-radius:8px;border-right:3px solid #525252;margin:0 0 12px;">
        <p style="margin:0;color:#d4d4d4;font-size:14px;line-height:1.7;">${q.text}</p>
        ${q.theme ? `<p style="margin:8px 0 0;color:#737373;font-size:12px;">${q.theme}</p>` : ''}
      </div>`).join('')
    : ''

  // Other episodes rows
  const otherHtml = otherEpisodes.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
        <tr>
          <td style="padding-bottom:16px;">
            <h3 style="margin:0;color:#e5e5e5;font-size:16px;font-weight:600;">حلقات أخرى هذا الشهر</h3>
          </td>
        </tr>
        ${otherEpisodes.map((ep) => {
          const epUrl = `${APP_URL}/episodes/${ep.slug}`
          return `<tr>
            <td style="padding-bottom:16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  ${ep.thumbnail_url
                    ? `<td width="80" style="vertical-align:top;padding-left:12px;">
                        <a href="${epUrl}" style="text-decoration:none;">
                          <img src="${ep.thumbnail_url}" alt="${ep.title}" width="80" style="width:80px;border-radius:6px;display:block;" />
                        </a>
                      </td>`
                    : ''}
                  <td style="vertical-align:top;">
                    <a href="${epUrl}" style="text-decoration:none;color:#e5e5e5;font-size:14px;font-weight:600;">${ep.title}</a>
                    ${ep.guest ? `<p style="margin:4px 0 0;color:#a3a3a3;font-size:13px;">${ep.guest.name}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
        }).join('')}
      </table>`
    : ''

  return `
    <h2 style="margin:0 0 4px;color:#e5e5e5;font-size:22px;font-weight:700;">نشرة خط — ${monthName} ${year}</h2>
    <p style="margin:0 0 24px;color:#a3a3a3;font-size:14px;">أبرز ما قدمناه هذا الشهر</p>
    ${thumbnailHtml}
    <h3 style="margin:16px 0 4px;color:#e5e5e5;font-size:18px;font-weight:600;">
      <a href="${episodeUrl}" style="text-decoration:none;color:#e5e5e5;">${featured.title}</a>
    </h3>
    ${guestHtml}
    ${quotesHtml}
    ${ctaButton('شاهد الحلقة', episodeUrl)}
    ${otherHtml}
    ${ctaButton('تصفح جميع الحلقات', `${APP_URL}/episodes`)}
  `
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
    <p style="margin:0;color:#737373;font-size:13px;">— ${senderName}، فريق خط بودكاست</p>
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
    <p style="margin:0;color:#737373;font-size:13px;">— فريق خط بودكاست</p>
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

export function sponsorApplicationConfirmHtml(contactName: string): string {
  const content = `
    <h2 style="margin:0 0 16px;color:#e5e5e5;font-size:20px;">شكراً لاهتمامك بالشراكة، ${contactName}</h2>
    <p style="margin:0 0 16px;">وصلنا طلبك وفريقنا بيراجعه.</p>
    <p style="margin:0 0 16px;">بنرد عليك بخطة تعاون تناسب أهدافك في أقرب وقت.</p>
    <p style="margin:0;color:#737373;font-size:13px;">— فريق خط بودكاست</p>
  `
  return emailLayout(content)
}
