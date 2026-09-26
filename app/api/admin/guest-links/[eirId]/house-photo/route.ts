import { NextResponse, type NextRequest } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { validateImageUpload } from "@/lib/validation/upload"
import { getActiveLinkForEir, updateGuestLinkFields } from "@/lib/guest-link/service"
import { readHousePhoto, saveHousePhoto } from "@/lib/guest-link/house-photo"

/**
 * «نسخة الضيف» — the filming-house photo, admin side.
 *
 * POST uploads (EDITOR) into data/guest-homes/ — deliberately NOT public/:
 * see lib/guest-link/house-photo.ts. GET serves it back for the admin preview.
 * The guest reads it only through /api/prepare/[token]/house-photo.
 */

const PRIVATE = { "Cache-Control": "private, no-store" }

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eirId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { eirId } = await params
  const link = await getActiveLinkForEir(eirId)
  const photo = await readHousePhoto(link?.house_photo)
  if (!photo) return new NextResponse(null, { status: 404, headers: PRIVATE })
  return new NextResponse(new Uint8Array(photo.bytes), {
    status: 200,
    headers: { ...PRIVATE, "Content-Type": photo.contentType },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eirId: string }> }) {
  const authError = await requireAdminAPI("EDITOR")
  if (authError) return authError
  const { eirId } = await params
  const link = await getActiveLinkForEir(eirId)
  if (!link) return NextResponse.json({ error: "ما فيه رابط فعّال" }, { status: 404 })

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "لم يتم رفع أي ملف" }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const validation = validateImageUpload(file, buffer)
    if (!validation.valid || !validation.ext) {
      return NextResponse.json({ error: validation.error ?? "ملف غير صالح" }, { status: 400 })
    }
    const name = await saveHousePhoto(buffer, validation.ext)
    await updateGuestLinkFields(link.id, { house_photo: name, location_updated_at: new Date() })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[guest-link] house photo upload failed:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء رفع الصورة" }, { status: 500 })
  }
}
