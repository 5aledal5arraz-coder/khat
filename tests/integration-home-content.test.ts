/**
 * Integration tests: Homepage content — home quotes, daily reflections, static content.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, mockDeleteResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

// Home Quotes
import {
  getAllHomeQuotes,
  getHomeQuoteById,
  addHomeQuote,
  deleteHomeQuote,
} from "@/lib/content/home-quotes"

// Daily Reflections
import {
  getAllReflections,
  getReflectionById,
  deleteReflection,
} from "@/lib/content/daily-reflections"

// Static Content
import {
  getAboutContent,
  saveAboutContent,
} from "@/lib/content/static-content"

describe("Home Quotes — Read", () => {
  beforeEach(() => resetMock())

  it("getAllHomeQuotes returns all quotes", async () => {
    mockSelectResult([
      { id: "hq-1", text: "اقتباس", attribution: "ضيف", status: "published", created_at: new Date() },
      { id: "hq-2", text: "اقتباس ٢", attribution: "مقدم", status: "draft", created_at: new Date() },
    ])

    const quotes = await getAllHomeQuotes()

    expect(quotes).toHaveLength(2)
    expect(quotes[0].id).toBe("hq-1")
  })

  it("getHomeQuoteById returns null when not found", async () => {
    mockSelectResult([])

    const result = await getHomeQuoteById("nonexistent")
    expect(result).toBeNull()
  })
})

describe("Home Quotes — Write", () => {
  beforeEach(() => resetMock())

  it("addHomeQuote inserts and returns new quote", async () => {
    const newQuote = {
      id: "hq-new",
      text: "اقتباس جديد",
      attribution: "ضيف جديد",
      episode_id: null,
      episode_slug: null,
      episode_title: null,
      theme: null,
      scheduled_date: null,
      status: "draft" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // Mock the insert().returning() chain
    const { mockInsertReturning } = await import("./db-mock")
    mockInsertReturning([newQuote])

    const result = await addHomeQuote({
      text: "اقتباس جديد",
      attribution: "ضيف جديد",
      episode_id: undefined,
      episode_slug: undefined,
      episode_title: undefined,
      theme: undefined,
      scheduled_date: undefined,
      status: "draft",
    })

    expect(result).toBeTruthy()
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("deleteHomeQuote returns true when deleted", async () => {
    mockDeleteResult(1)

    const result = await deleteHomeQuote("hq-1")
    expect(result).toBe(true)
  })

  it("deleteHomeQuote returns false when not found", async () => {
    mockDeleteResult(0)

    const result = await deleteHomeQuote("hq-nonexistent")
    expect(result).toBe(false)
  })
})

describe("Daily Reflections — Read", () => {
  beforeEach(() => resetMock())

  it("getAllReflections returns reflections", async () => {
    mockSelectResult([
      { id: "dr-1", date: "2026-03-28", short_quote: "تأمل", status: "published" },
    ])

    const reflections = await getAllReflections()
    expect(reflections).toHaveLength(1)
  })

  it("getReflectionById returns null when not found", async () => {
    mockSelectResult([])

    const result = await getReflectionById("nonexistent")
    expect(result).toBeNull()
  })
})

describe("Daily Reflections — Write", () => {
  beforeEach(() => resetMock())

  it("deleteReflection returns true when deleted", async () => {
    mockDeleteResult(1)
    const result = await deleteReflection("dr-1")
    expect(result).toBe(true)
  })
})

describe("Static Content — About Page", () => {
  beforeEach(() => resetMock())

  it("getAboutContent returns defaults when no DB row", async () => {
    mockSelectResult([]) // no row

    const about = await getAboutContent()

    expect(about.hostName).toBe("بودكاست خط")
    expect(about.missionQuote).toBeTruthy()
  })

  it("getAboutContent returns DB content when row exists", async () => {
    mockSelectResult([
      {
        key: "about",
        content: {
          hostName: "Custom Host",
          hostTitle: "Custom Title",
          hostDescription: "Custom Desc",
          hostPhoto: "",
          hostImageUrl: "",
          welcomeVideoId: "",
          welcomeVideoUrl: "",
          welcomeVideoPosterUrl: "",
          missionQuote: "Custom mission",
          ctaTitle: "CTA",
          ctaDescription: "CTA desc",
          socialLinks: [],
          values: [],
          teamMembers: [],
        },
        updated_at: new Date(),
      },
    ])

    const about = await getAboutContent()
    expect(about.hostName).toBe("Custom Host")
    expect(about.missionQuote).toBe("Custom mission")
  })

  it("saveAboutContent calls insert with upsert", async () => {
    await saveAboutContent({
      hostName: "Test",
      hostTitle: "T",
      hostDescription: "D",
      hostPhoto: "",
      hostImageUrl: "",
      welcomeVideoId: "",
      welcomeVideoUrl: "",
      welcomeVideoPosterUrl: "",
      missionQuote: "M",
      ctaTitle: "C",
      ctaDescription: "CD",
      socialLinks: [],
      values: [],
      teamMembers: [],
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })
})
