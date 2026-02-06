import { arabicProfanity, englishProfanity, spamPatterns } from './profanity-lists'

export type ModerationStatus = 'pending' | 'approved' | 'auto_flagged' | 'rejected' | 'hidden'

export interface ModerationResult {
  status: ModerationStatus
  reasons: string[]
}

/**
 * Normalize Arabic text for comparison:
 * - Strip diacritics (tashkeel)
 * - Normalize alef variants
 * - Normalize taa marbuta / haa
 */
function normalizeArabic(text: string): string {
  return text
    // Remove Arabic diacritics
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED]/g, '')
    // Normalize alef variants to bare alef
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    // Normalize taa marbuta to haa
    .replace(/\u0629/g, '\u0647')
    .toLowerCase()
}

/**
 * Check if text contains profanity
 */
function containsProfanity(text: string): string[] {
  const reasons: string[] = []
  const normalizedText = normalizeArabic(text)
  const lowerText = text.toLowerCase()

  for (const word of arabicProfanity) {
    const normalizedWord = normalizeArabic(word)
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
 * Run content through moderation pipeline
 * @param content - The text content to check
 * @param userApprovedCount - Number of previously approved posts by this user
 */
export function moderateContent(content: string, userApprovedCount: number): ModerationResult {
  const allReasons: string[] = []

  // Check profanity
  const profanityReasons = containsProfanity(content)
  allReasons.push(...profanityReasons)

  // Check spam
  const spamReasons = checkSpam(content)
  allReasons.push(...spamReasons)

  // If profanity or spam detected -> auto_flagged
  if (allReasons.length > 0) {
    return { status: 'auto_flagged', reasons: allReasons }
  }

  // New user (fewer than 3 approved posts) -> pending review
  if (userApprovedCount < 3) {
    return { status: 'pending', reasons: ['مستخدم جديد - ينتظر المراجعة'] }
  }

  // Trusted user -> auto-approve
  return { status: 'approved', reasons: [] }
}

/**
 * Moderate article content (checks both title and body)
 */
export function moderateArticle(title: string, content: string, userApprovedCount: number): ModerationResult {
  const titleResult = moderateContent(title, userApprovedCount)
  if (titleResult.status === 'auto_flagged') return titleResult

  const contentResult = moderateContent(content, userApprovedCount)
  if (contentResult.status === 'auto_flagged') return contentResult

  // If either is pending, result is pending
  if (titleResult.status === 'pending' || contentResult.status === 'pending') {
    return { status: 'pending', reasons: titleResult.reasons.concat(contentResult.reasons) }
  }

  return { status: 'approved', reasons: [] }
}
