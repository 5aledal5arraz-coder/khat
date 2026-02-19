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
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://khatpodcast.com'
