import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { validateImageUpload } from "@/lib/validation/upload"
import { requireAdminAPI } from "@/lib/api-utils"

const TEAM_DIR = path.join(process.cwd(), "public", "team")

export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "لم يتم رفع أي ملف" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const validation = validateImageUpload(file, buffer)

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const hash = crypto.randomBytes(8).toString("hex")
    const filename = `${hash}.${validation.ext}`

    await mkdir(TEAM_DIR, { recursive: true })
    await writeFile(path.join(TEAM_DIR, filename), buffer)

    // NOT `/team/${filename}`. That path is served by Next out of
    // `public/`, which Next resolves when the server BOOTS — so a logo
    // uploaded while the site is running is written successfully, reported as
    // successful, and then 404s until the next restart. Measured on production
    // 2026-08-05: same file, 404 before a `pm2 restart` and 200 after, with no
    // rebuild in between. `/uploads/about-team/...` is a route handler that
    // reads the file when it is asked for, so a logo works the moment it
    // lands. See app/uploads/about-team/[file]/route.ts.
    const url = `/uploads/about-team/${filename}`

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("Error uploading team photo:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء رفع الصورة" },
      { status: 500 }
    )
  }
}
