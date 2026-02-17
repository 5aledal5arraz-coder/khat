"use server"

import { revalidatePath } from "next/cache"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { saveAboutContent } from "@/lib/static-content"
import { requireAdmin } from "@/lib/api-utils"
import { validateImageUpload } from "@/lib/upload-validation"
import type { AboutPageContent } from "@/types/static-content"

const CONTENT_DIR = path.join(process.cwd(), "public", "content")

export async function saveAboutContentAction(content: AboutPageContent) {
  await requireAdmin()
  await saveAboutContent(content)
  revalidatePath("/about")
  revalidatePath("/admin/content")
  return { success: true }
}

export async function uploadHostImageAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireAdmin()

  const file = formData.get("file") as File | null
  if (!file) return { error: "لم يتم رفع أي ملف" }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const validation = validateImageUpload(file, buffer)

  if (!validation.valid) return { error: validation.error }

  const hash = crypto.randomBytes(8).toString("hex")
  const filename = `${hash}.${validation.ext}`

  await mkdir(CONTENT_DIR, { recursive: true })
  await writeFile(path.join(CONTENT_DIR, filename), buffer)

  return { url: `/content/${filename}` }
}
