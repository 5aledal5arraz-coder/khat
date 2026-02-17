import { arabicProfanity, englishProfanity, spamPatterns } from './profanity-lists'
import { moderateWithAI } from './openai'
import type { AIModerationVerdict } from './openai'
import { getModerationConfig } from './moderation-config'
import { normalizeArabic } from './search'
import { stripHtml } from './sanitize'

export type ModerationStatus = 'pending' | 'approved' | 'auto_flagged' | 'rejected' | 'hidden'

export interface ModerationResult {
  status: ModerationStatus
  reasons: string[]
  /** AI verdict: clean, suspicious, or harmful. null if AI was not called. */
  aiVerdict?: AIModerationVerdict | null
}

// Pre-normalize profanity lists at module load to avoid repeated normalization
const normalizedArabicProfanity = arabicProfanity.map(normalizeArabic)

/**
 * Check if text contains profanity
 */
function containsProfanity(text: string): string[] {
  const reasons: string[] = []
  const normalizedText = normalizeArabic(text)
  const lowerText = text.toLowerCase()

  for (const normalizedWord of normalizedArabicProfanity) {
    if (normalizedText.includes(normalizedWord)) {
      reasons.push('يحتوي على ألفاظ غير لائقة')
      break
    }
  }

  for (const word of englishProfanity) {
    // Word boundary check to avoid false positives
    const regex = new RegExp(`\\b${word}\\b`, 'i')
    if (regex.test(lowerText)) {
      reasons.push('يحتوي على ألفاظ إنجليزية غير لائقة')
      break
    }
  }

  return reasons
}

/**
 * Check for spam indicators
 */
function checkSpam(text: string): string[] {
  const reasons: string[] = []

  // Count URLs
  const urlMatches = text.match(spamPatterns[0])
  if (urlMatches && urlMatches.length > 3) {
    reasons.push('يحتوي على عدد كبير من الروابط')
  }

  // Check repeated characters
  if (spamPatterns[1].test(text)) {
    reasons.push('يحتوي على أحرف مكررة بشكل مبالغ')
  }

  // Check repeated words
  if (spamPatterns[2].test(text)) {
    reasons.push('يحتوي على كلمات مكررة بشكل مبالغ')
  }

  return reasons
}

/**
 * Run local-only moderation checks (profanity + spam).
 * Synchronous — no AI call.
 */
function localModerate(content: string, userApprovedCount: number): ModerationResult {
  const allReasons: string[] = []

  const profanityReasons = containsProfanity(content)
  allReasons.push(...profanityReasons)

  const spamReasons = checkSpam(content)
  allReasons.push(...spamReasons)

  if (allReasons.length > 0) {
    return { status: 'auto_flagged', reasons: allReasons, aiVerdict: null }
  }

  if (userApprovedCount < 3) {
    return { status: 'pending', reasons: ['مستخدم جديد - ينتظر المراجعة'], aiVerdict: null }
  }

  return { status: 'approved', reasons: [], aiVerdict: null }
}

/**
 * Run content through the full moderation pipeline:
 * 1. Local checks (profanity, spam) — instant
 * 2. AI moderation (OpenAI) — async
 * 3. Trust-based decision for new users
 *
 * Results:
 * - Local flagged → auto_flagged (harmful local content)
 * - AI harmful → auto_flagged (blocked — user sees error)
 * - AI suspicious → pending (sent to review queue)
 * - AI clean + new user → pending (trust-based)
 * - AI clean + trusted user → approved (auto-publish)
 */
export async function moderateContent(content: string, userApprovedCount: number): Promise<ModerationResult> {
  // Step 1: Local checks
  const localResult = localModerate(content, userApprovedCount)
  if (localResult.status === 'auto_flagged') {
    return localResult
  }

  // Step 2: AI moderation (skip if disabled in settings)
  const config = await getModerationConfig()
  if (!config.aiEnabled) {
    return localResult
  }

  const aiResult = await moderateWithAI(content)

  if (aiResult.verdict === 'harmful') {
    return {
      status: 'auto_flagged',
      reasons: aiResult.reason ? [aiResult.reason] : ['محتوى مخالف'],
      aiVerdict: 'harmful',
    }
  }

  if (aiResult.verdict === 'suspicious') {
    return {
      status: 'pending',
      reasons: aiResult.reason ? [aiResult.reason] : ['محتوى مشتبه به - قيد المراجعة'],
      aiVerdict: 'suspicious',
    }
  }

  // Step 3: AI says clean — apply trust-based rules
  if (userApprovedCount < 3) {
    return {
      status: 'pending',
      reasons: ['مستخدم جديد - ينتظر المراجعة'],
      aiVerdict: 'clean',
    }
  }

  return { status: 'approved', reasons: [], aiVerdict: 'clean' }
}

/**
 * Moderate article content (checks both title and body)
 */
export async function moderateArticle(title: string, content: string, userApprovedCount: number): Promise<ModerationResult> {
  // Check title locally first
  const titleLocal = localModerate(title, userApprovedCount)
  if (titleLocal.status === 'auto_flagged') return titleLocal

  // Check body locally
  const contentLocal = localModerate(content, userApprovedCount)
  if (contentLocal.status === 'auto_flagged') return contentLocal

  // AI moderation on combined text (title + excerpt of content) — skip if disabled
  const config = await getModerationConfig()
  if (!config.aiEnabled) {
    // No AI — return best local result
    if (titleLocal.status === 'pending' || contentLocal.status === 'pending') {
      return { status: 'pending', reasons: titleLocal.reasons.concat(contentLocal.reasons), aiVerdict: null }
    }
    return { status: 'approved', reasons: [], aiVerdict: null }
  }

  const plainContent = stripHtml(content)
  const combinedText = `${title}\n\n${plainContent.slice(0, 2000)}`
  const aiResult = await moderateWithAI(combinedText)

  if (aiResult.verdict === 'harmful') {
    return {
      status: 'auto_flagged',
      reasons: aiResult.reason ? [aiResult.reason] : ['محتوى مخالف'],
      aiVerdict: 'harmful',
    }
  }

  if (aiResult.verdict === 'suspicious') {
    return {
      status: 'pending',
      reasons: aiResult.reason ? [aiResult.reason] : ['محتوى مشتبه به - قيد المراجعة'],
      aiVerdict: 'suspicious',
    }
  }

  if (userApprovedCount < 3) {
    return {
      status: 'pending',
      reasons: ['مستخدم جديد - ينتظر المراجعة'],
      aiVerdict: 'clean',
    }
  }

  return { status: 'approved', reasons: [], aiVerdict: 'clean' }
}
