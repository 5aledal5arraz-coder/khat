/**
 * Smoke tests: Site settings read/write path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings"

describe("Site Settings — Read", () => {
  beforeEach(() => resetMock())

  it("returns defaults when no DB row exists", async () => {
    mockSelectResult([]) // empty result

    const settings = await getSiteSettings()

    expect(settings).toBeTruthy()
    expect(settings.metadata.name).toBe("خط بودكاست")
    expect(settings.featureFlags.studioEnabled).toBe(true)
    expect(settings.socialLinks).toEqual([])
    expect(settings.seo.titleTemplate).toContain("خط بودكاست")
  })

  it("returns DB values when row exists", async () => {
    mockSelectResult([
      {
        key: "default",
        metadata: { name: "Custom Name", tagline: "T", description: "D", contactEmail: "a@b.com" },
        social_links: [{ platform: "twitter", url: "https://x.com/khat", visible: true }],
        seo: { titleTemplate: "%s | Custom", defaultDescription: "Desc", defaultOgImage: "", keywords: [] },
        feature_flags: { guestApplicationsEnabled: true, maintenanceMode: false, studioEnabled: false },
        updated_at: new Date(),
      },
    ])

    const settings = await getSiteSettings()

    expect(settings.metadata.name).toBe("Custom Name")
    expect(settings.socialLinks).toHaveLength(1)
    expect(settings.socialLinks[0].platform).toBe("twitter")
    expect(settings.featureFlags.studioEnabled).toBe(false)
    expect(settings.featureFlags.guestApplicationsEnabled).toBe(true)
  })
})

describe("Site Settings — Write", () => {
  beforeEach(() => resetMock())

  it("saveSiteSettings calls insert with onConflictDoUpdate", async () => {
    await saveSiteSettings({
      metadata: { name: "Test", tagline: "", description: "", contactEmail: "" },
      socialLinks: [],
      seo: { titleTemplate: "%s", defaultDescription: "", defaultOgImage: "", keywords: [] },
      featureFlags: { guestApplicationsEnabled: false, maintenanceMode: false, studioEnabled: true },
    })

    expect(mockDb.insert).toHaveBeenCalled()
  })
})
