/**
 * Per-company offer pages — data layer.
 *
 * An offer is an editable, optionally password-protected proposal published at a
 * secret link (/offer/<token>) and sent to ONE company. It's seeded from that
 * lead's AI proposal, then amended freely. The token in the URL is the secret;
 * a password adds a second gate.
 */

import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnershipOffers, sponsorshipProposals } from "@/lib/db/schema/sponsorship-ai"
import { sponsorshipLeads } from "@/lib/db/schema/system"
import { getSiteSettings } from "@/lib/site-settings"
import type { PartnershipOffer, ProposedPackage } from "@/types/database"

const BCRYPT_ROUNDS = 12

export function generateOfferToken(): string {
  return "offer-" + randomBytes(12).toString("hex")
}

export async function hashOfferPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyOfferPassword(input: string, hash: string): Promise<boolean> {
  if (!hash) return true
  return bcrypt.compare(input, hash)
}

function mapOffer(row: typeof partnershipOffers.$inferSelect): PartnershipOffer {
  return {
    id: row.id,
    lead_id: row.lead_id,
    token: row.token,
    title: row.title,
    intro: row.intro,
    body: row.body,
    packages: (row.packages as ProposedPackage[]) ?? [],
    validity_note: row.validity_note,
    contact_email: row.contact_email,
    password_hash: row.password_hash,
    published: row.published,
    view_count: row.view_count,
    last_viewed_at: row.last_viewed_at ? row.last_viewed_at.toISOString() : null,
    created_at: (row.created_at ?? new Date()).toISOString(),
    updated_at: (row.updated_at ?? new Date()).toISOString(),
  }
}

export async function getOfferByLead(leadId: string): Promise<PartnershipOffer | null> {
  if (!db) return null
  const [row] = await db.select().from(partnershipOffers).where(eq(partnershipOffers.lead_id, leadId)).limit(1)
  return row ? mapOffer(row) : null
}

export async function getOfferById(id: string): Promise<PartnershipOffer | null> {
  if (!db) return null
  const [row] = await db.select().from(partnershipOffers).where(eq(partnershipOffers.id, id)).limit(1)
  return row ? mapOffer(row) : null
}

export async function getOfferByToken(token: string): Promise<PartnershipOffer | null> {
  if (!db) return null
  const [row] = await db.select().from(partnershipOffers).where(eq(partnershipOffers.token, token)).limit(1)
  return row ? mapOffer(row) : null
}

/**
 * Get the lead's offer, creating it (seeded from the latest AI proposal) if none
 * exists. Never overwrites an existing offer — edits are preserved.
 */
export async function getOrCreateOfferForLead(leadId: string): Promise<PartnershipOffer | null> {
  if (!db) return null
  const existing = await getOfferByLead(leadId)
  if (existing) return existing

  const [lead] = await db.select().from(sponsorshipLeads).where(eq(sponsorshipLeads.id, leadId)).limit(1)
  if (!lead) return null

  const [proposal] = await db
    .select()
    .from(sponsorshipProposals)
    .where(and(eq(sponsorshipProposals.lead_id, leadId), eq(sponsorshipProposals.status, "ready")))
    .orderBy(desc(sponsorshipProposals.created_at))
    .limit(1)

  const settings = await getSiteSettings().catch(() => null)
  const contactEmail = settings?.metadata.contactEmail?.trim() || "hello@khatpodcast.com"

  const body = proposal?.edited_draft || proposal?.full_draft || ""
  const packages = (proposal?.proposed_packages as ProposedPackage[] | null) ?? []

  const [row] = await db
    .insert(partnershipOffers)
    .values({
      lead_id: leadId,
      token: generateOfferToken(),
      title: `عرض شراكة — خط × ${lead.company_name}`,
      intro: proposal?.value_proposition || null,
      body,
      packages,
      validity_note: null,
      contact_email: contactEmail,
      published: false,
    })
    .returning()
  return mapOffer(row)
}

export interface OfferPatch {
  title?: string | null
  intro?: string | null
  body?: string | null
  packages?: ProposedPackage[]
  validity_note?: string | null
  contact_email?: string | null
  published?: boolean
}

export async function updateOffer(id: string, patch: OfferPatch): Promise<PartnershipOffer | null> {
  if (!db) return null
  const [row] = await db
    .update(partnershipOffers)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(partnershipOffers.id, id))
    .returning()
  return row ? mapOffer(row) : null
}

/** Set or clear the optional password gate. Pass null to remove it. */
export async function setOfferPassword(id: string, password: string | null): Promise<void> {
  if (!db) return
  const password_hash = password ? await hashOfferPassword(password) : null
  await db
    .update(partnershipOffers)
    .set({ password_hash, updated_at: new Date() })
    .where(eq(partnershipOffers.id, id))
}

/** Rotate the secret token (invalidates the old link). */
export async function regenerateOfferToken(id: string): Promise<string | null> {
  if (!db) return null
  const token = generateOfferToken()
  const [row] = await db
    .update(partnershipOffers)
    .set({ token, updated_at: new Date() })
    .where(eq(partnershipOffers.id, id))
    .returning({ token: partnershipOffers.token })
  return row?.token ?? null
}

export async function recordOfferView(token: string): Promise<void> {
  if (!db) return
  const [row] = await db
    .update(partnershipOffers)
    .set({ view_count: sql`${partnershipOffers.view_count} + 1`, last_viewed_at: new Date() })
    .where(eq(partnershipOffers.token, token))
    .returning({ lead_id: partnershipOffers.lead_id, view_count: partnershipOffers.view_count })
  // A partner opening their offer is a strong buying signal — surface it on the
  // timeline. Import the module directly to avoid a CRM↔offers import cycle.
  if (row) {
    const { logActivity } = await import("@/lib/partnership-crm/activities")
    await logActivity(row.lead_id, {
      type: "offer_viewed",
      summary: `فتح الشريك العرض (مشاهدة #${row.view_count})`,
      actor: "public",
      metadata: { token, view_count: row.view_count },
    })
  }
}

/** Company name for an offer (for the public page heading). */
export async function getOfferCompanyName(leadId: string): Promise<string> {
  if (!db) return "خط"
  const [lead] = await db
    .select({ company_name: sponsorshipLeads.company_name })
    .from(sponsorshipLeads)
    .where(eq(sponsorshipLeads.id, leadId))
    .limit(1)
  return lead?.company_name ?? ""
}
