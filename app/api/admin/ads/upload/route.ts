import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { validateImageUpload } from "@/lib/upload-validation"
import { requireAdminAPI } from "@/lib/api-utils"

const ADS_DIR = path.join(process.cwd(), "public", "ads")

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "لم يتم رفع أي ملف" }, { status: 400 })
    }

    // Read file bytes and validate (extension + MIME + magic bytes)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const validation = validateImageUpload(file, buffer)

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Use the verified extension from magic byte detection, not user input
    const hash = crypto.randomBytes(8).toString("hex")
    const filename = `${hash}.${validation.ext}`

    await mkdir(ADS_DIR, { recursive: true })
    await writeFile(path.join(ADS_DIR, filename), buffer)

    const url = `/ads/${filename}`

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("Error uploading ad image:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء رفع الصورة" },
      { status: 500 }
    )
  }
}
