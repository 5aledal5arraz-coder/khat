import { Resend } from 'resend'

let resendInstance: Resend | null = null

export function getResend(): Resend {
  if (!resendInstance) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    resendInstance = new Resend(key)
  }
  return resendInstance
}

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@khatpodcast.com'
export const FROM_DISPLAY = `بودكاست خط <${FROM_EMAIL}>`
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://khatpodcast.com'
/** Monitored reply-to so subscriber replies reach a human, not the noreply box. */
export const REPLY_TO = process.env.RESEND_REPLY_TO || 'hello@khatpodcast.com'
/** Svix signing secret for verifying Resend webhook payloads (whsec_…). */
export const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || ''
