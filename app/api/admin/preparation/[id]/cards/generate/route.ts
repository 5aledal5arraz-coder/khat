import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import {
  generateInterviewCards,
  enrichSingleCard,
  enrichAllCards,
  populateCardMaterials,
} from "@/lib/ai/interview-cards"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * POST — Generate interview cards from question_system.
 *
 * Body:
 *   { action: "generate" }        — create cards from question_system
 *   { action: "generate", force: true } — regenerate (soft-deletes existing)
 *   { action: "enrich" }          — enrich all cards with Kuwaiti phrasing
 *   { action: "enrich_one", card_id: "..." } — enrich a single card
 *   { action: "materials" }       — populate supporting materials from research
 *   { action: "full" }            — all three steps sequentially
 *   { action: "full", force: true } — regenerate + enrich + materials
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr

  const { id } = await params

  try {
    const body = await request.json()
    const action = body.action || "generate"
    const force = !!body.force

    switch (action) {
      case "generate": {
        const result = await generateInterviewCards(id, { force })
        return NextResponse.json(result)
      }

      case "enrich": {
        const result = await enrichAllCards(id)
        return NextResponse.json(result)
      }

      case "enrich_one": {
        if (!body.card_id || typeof body.card_id !== "string") {
          return errorResponse("card_id مطلوب", 422)
        }
        const result = await enrichSingleCard(id, body.card_id)
        return NextResponse.json(result)
      }

      case "materials": {
        const result = await populateCardMaterials(id)
        return NextResponse.json(result)
      }

      case "full": {
        // Step 1: Generate cards
        const genResult = await generateInterviewCards(id, { force })
        if (genResult.skipped_reason && !force) {
          return NextResponse.json({
            generate: genResult,
            enrich: null,
            materials: null,
            message: genResult.skipped_reason,
          })
        }

        // Step 2: Enrich all cards
        const enrichResult = await enrichAllCards(id)

        // Step 3: Populate materials
        const matResult = await populateCardMaterials(id)

        return NextResponse.json({
          generate: genResult,
          enrich: enrichResult,
          materials: matResult,
        })
      }

      default:
        return errorResponse(`action غير صالح: ${action}`, 422)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "فشل في توليد البطاقات"
    return errorResponse(msg, 500)
  }
}
