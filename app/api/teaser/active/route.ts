import { NextResponse } from "next/server"
import { getActiveTeaser } from "@/lib/teaser"

export async function GET() {
  try {
    const result = await getActiveTeaser()
    if (!result) {
      return NextResponse.json({ teaser: null, questions: [] })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching active teaser:", error)
    return NextResponse.json({ teaser: null, questions: [] })
  }
}
