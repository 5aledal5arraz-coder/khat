import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { updateGuest, deleteGuest } from "@/lib/admin/queries"
import { requireAdminAPI } from "@/lib/api-utils"

function validateExternalLinks(links: unknown): Record<string, string> | null {
  if (!links || typeof links !== "object") return null
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(links as Record<string, unknown>)) {
    if (typeof key !== "string" || typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed) continue
    if (key === "email") {
      if (/^mailto:.+@.+/.test(trimmed)) result[key] = trimmed
    } else {
      if (/^https?:\/\/.+/.test(trimmed)) result[key] = trimmed
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params
    const body = await request.json()

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "اسم الضيف مطلوب (حتى 200 حرف)" }, { status: 400 })
    }

    const bio = typeof body.bio === "string" && body.bio.trim() ? body.bio.trim() : null
    const photo_url = typeof body.photo_url === "string" && body.photo_url.trim() ? body.photo_url.trim() : null
    const testimonial = typeof body.testimonial === "string" && body.testimonial.trim() ? body.testimonial.trim().slice(0, 450) : null
    const external_links = validateExternalLinks(body.external_links)

    const result = await updateGuest(id, { name, bio, photo_url, testimonial, external_links })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/guests")
    revalidatePath("/admin/guests")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating guest:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الضيف" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const { id } = await params

    const result = await deleteGuest(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/guests")
    revalidatePath("/admin/guests")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting guest:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء حذف الضيف" },
      { status: 500 }
    )
  }
}
