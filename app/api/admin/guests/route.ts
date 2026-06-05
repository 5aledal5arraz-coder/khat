import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createGuest, getAllGuests } from "@/lib/admin/queries"
import { requireAdminAPI } from "@/lib/api-utils"
import { invalidate } from "@/lib/cache"

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06FF-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

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

export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const guests = await getAllGuests()
  return NextResponse.json(guests)
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const body = await request.json()

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "اسم الضيف مطلوب (حتى 200 حرف)" }, { status: 400 })
    }

    const slug = generateSlug(name)
    if (!slug) {
      return NextResponse.json({ error: "لا يمكن إنشاء رابط صالح من هذا الاسم" }, { status: 400 })
    }

    const bio = typeof body.bio === "string" && body.bio.trim() ? body.bio.trim().slice(0, 1000) : null
    const photo_url = typeof body.photo_url === "string" && body.photo_url.trim() ? body.photo_url.trim() : null
    const testimonial = typeof body.testimonial === "string" && body.testimonial.trim() ? body.testimonial.trim().slice(0, 450) : null
    const external_links = validateExternalLinks(body.external_links)

    const result = await createGuest({ name, slug, bio, photo_url, testimonial, external_links })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    invalidate("guests")
    invalidate("episodes")
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/guests")
    revalidatePath("/admin/guests")

    // Cleanup Phase A — surface dedup decision so the admin UI can
    // tell the user "this guest already existed."
    return NextResponse.json({
      ...(result.data ?? {}),
      _existing: result.existing === true,
    })
  } catch (error) {
    console.error("Error creating guest:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء إضافة الضيف" },
      { status: 500 }
    )
  }
}
