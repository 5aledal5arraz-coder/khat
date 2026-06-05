import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/api-utils"
import {
  createPrepForm,
  getPrepFormByApplicationId,
  lockPrepForm,
  unlockPrepForm,
  revokePrepForm,
  regeneratePrepToken,
} from "@/lib/guest-prep"
import { db } from "@/lib/db"
import { guestApplications } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * GET /api/admin/submissions/guests/[id]/prep-form
 * Fetch prep form for a guest application.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("EDITOR")
  if (auth.error) return auth.error
  const { id } = await params

  const form = await getPrepFormByApplicationId(id)
  return NextResponse.json({ form })
}

/**
 * POST /api/admin/submissions/guests/[id]/prep-form
 * Create a new prep form for an approved guest application.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("ADMIN")
  if (auth.error) return auth.error
  const { id } = await params

  if (!db) {
    return NextResponse.json({ error: "قاعدة البيانات غير متوفرة" }, { status: 500 })
  }

  // Verify application exists
  const appRows = await db.select().from(guestApplications)
    .where(eq(guestApplications.id, id))
    .limit(1)
  const application = appRows[0]
  if (!application) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
  }

  // Check if form already exists
  const existing = await getPrepFormByApplicationId(id)
  if (existing) {
    return NextResponse.json({ error: "تم إنشاء الاستبيان مسبقاً" }, { status: 409 })
  }

  const { form, rawToken } = await createPrepForm({
    applicationId: id,
    guestName: application.name,
    guestEmail: application.email,
    createdBy: auth.user.id,
  })

  return NextResponse.json({ form, token: rawToken }, { status: 201 })
}

/**
 * PATCH /api/admin/submissions/guests/[id]/prep-form
 * Admin actions: lock, unlock, revoke, regenerate.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("ADMIN")
  if (auth.error) return auth.error
  const { id } = await params

  let body: { action: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  const { action } = body
  if (!action) {
    return NextResponse.json({ error: "يجب تحديد الإجراء" }, { status: 400 })
  }

  switch (action) {
    case "lock": {
      const form = await lockPrepForm(id)
      if (!form) return NextResponse.json({ error: "الاستبيان غير موجود" }, { status: 404 })
      return NextResponse.json({ form })
    }
    case "unlock": {
      const form = await unlockPrepForm(id)
      if (!form) return NextResponse.json({ error: "الاستبيان غير موجود" }, { status: 404 })
      return NextResponse.json({ form })
    }
    case "revoke": {
      const form = await revokePrepForm(id)
      if (!form) return NextResponse.json({ error: "الاستبيان غير موجود" }, { status: 404 })
      return NextResponse.json({ form })
    }
    case "regenerate": {
      const result = await regeneratePrepToken(id)
      if (!result) return NextResponse.json({ error: "الاستبيان غير موجود" }, { status: 404 })
      return NextResponse.json({ form: result.form, token: result.rawToken })
    }
    default:
      return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  }
}
