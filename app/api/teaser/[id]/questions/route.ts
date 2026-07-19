import { NextRequest } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { teaserQuestions } from "@/lib/db/schema"
import {
  validateMutation,
  errorResponse,
  rateLimitResponse,
  validationErrorResponse,
  successResponse,
} from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { validateQuestionContent, validateDisplayName } from "@/lib/validation/forms"
import { stripHtml } from "@/lib/sanitize"
import { arabicProfanity, englishProfanity } from "@/lib/profanity-lists"
import { normalizeArabic } from "@/lib/search"

function checkProfanity(text: string): boolean {
  const normalizedText = normalizeArabic(text)
  const lowerText = text.toLowerCase()

  for (const word of arabicProfanity) {
    if (normalizedText.includes(normalizeArabic(word))) return true
  }

  for (const word of englishProfanity) {
    const regex = new RegExp(`\\b${word}\\b`, "i")
    if (regex.test(lowerText)) return true
  }

  return false
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF validation
  const csrfError = validateMutation(request)
  if (csrfError) return csrfError

  // Rate limiting: 3 questions per hour
  const rateLimit = checkIpRateLimit(request, "submit_teaser_question", 3, 3600000)
  if (!rateLimit.allowed) return rateLimitResponse()

  const { id: teaserId } = await params

  try {
    const body = await request.json()
    const { displayName, questionText } = body as {
      displayName?: string
      questionText?: string
    }

    if (!questionText) {
      return validationErrorResponse("السؤال مطلوب")
    }

    // Validate question text
    const questionValidation = validateQuestionContent(questionText)
    if (!questionValidation.valid) {
      return validationErrorResponse(questionValidation.error!)
    }

    // Validate display name if provided
    if (displayName) {
      const nameValidation = validateDisplayName(displayName)
      if (!nameValidation.valid) {
        return validationErrorResponse(nameValidation.error!)
      }
    }

    // Sanitize
    const cleanQuestion = stripHtml(questionText)
    const cleanName = displayName ? stripHtml(displayName) : null

    // Profanity check
    const textToCheck = cleanName ? `${cleanName} ${cleanQuestion}` : cleanQuestion
    if (checkProfanity(textToCheck)) {
      return errorResponse("يحتوي السؤال على ألفاظ غير لائقة", 422)
    }

    // Hash IP for abuse tracking
    const forwarded = request.headers.get("x-forwarded-for")
    const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown"
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").substring(0, 16)
    const userAgent = request.headers.get("user-agent") || null

    // Insert into database via Drizzle so the id $defaultFn fires and the
    // column set stays aligned with the schema (the old raw INSERT broke on
    // the 2026-02-20 migration drift).
    await db!.insert(teaserQuestions).values({
      teaser_id: teaserId,
      display_name: cleanName,
      question_text: cleanQuestion,
      status: "pending",
      ip_hash: ipHash,
      user_agent: userAgent,
    })

    return successResponse({ message: "سؤالك قيد المراجعة" }, 201)
  } catch (error) {
    console.error("Error processing question:", error)
    return errorResponse("حدث خطأ أثناء معالجة الطلب", 500)
  }
}
