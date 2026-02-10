import { NextRequest, NextResponse } from "next/server"
import { createGuest } from "@/lib/admin/queries"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const result = await createGuest(body)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Error creating guest:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء إضافة الضيف" },
      { status: 500 }
    )
  }
}
