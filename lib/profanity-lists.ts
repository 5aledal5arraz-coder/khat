// Profanity word lists for Arabic and English content moderation
// These lists are intentionally kept minimal and non-explicit.
// In production, use a more comprehensive external service or database-backed list.

// Arabic profanity patterns (common offensive terms - hashed/normalized forms)
export const arabicProfanity: string[] = [
  'كلب',
  'حمار',
  'غبي',
  'أحمق',
  'تافه',
  'حقير',
  'وقح',
  'سافل',
  'نجس',
  'خنزير',
  'لعنة',
  'اخرس',
  'منحل',
  'فاسق',
  'عاهر',
  'قذر',
  'وسخ',
  'زبال',
]

// English profanity patterns
export const englishProfanity: string[] = [
  'fuck',
  'shit',
  'ass',
  'bitch',
  'damn',
  'hell',
  'crap',
  'dick',
  'bastard',
  'slut',
  'whore',
  'piss',
  'cock',
  'cunt',
]

// Spam indicators
export const spamPatterns: RegExp[] = [
  /https?:\/\/\S+/gi, // URLs (counted, not blocked)
  /(.)\1{5,}/g, // Repeated characters (5+)
  /(\b\w+\b)(\s+\1){3,}/gi, // Repeated words (3+)
]
