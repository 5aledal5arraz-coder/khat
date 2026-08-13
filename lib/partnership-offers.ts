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
import { listOfferResponses } from "@/lib/offer-responses"
import { listOfferCountersByResponse } from "@/lib/offer-counters"
import type {
  OfferResponse,
  PartnershipOffer,
  ProposedPackage,
  PublicOfferExchange,
  PublicPartnershipOffer,
} from "@/types/database"

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
    sent_at: row.sent_at ? row.sent_at.toISOString() : null,
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

/**
 * Stamp the moment the offer was emailed to the company.
 *
 * Deliberately NOT part of `updateOffer`: this is written by the send route
 * only, and only after the provider accepted the message. `updated_at` is left
 * alone — the content did not change, the delivery did.
 */
export async function markOfferSent(id: string, at = new Date()): Promise<string | null> {
  if (!db) return null
  const [row] = await db
    .update(partnershipOffers)
    .set({ sent_at: at })
    .where(eq(partnershipOffers.id, id))
    .returning({ sent_at: partnershipOffers.sent_at })
  return row?.sent_at ? row.sent_at.toISOString() : null
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

/**
 * ── THE ONE PLACE AN OFFER BECOMES PUBLIC ──────────────────────────────────
 *
 * Two surfaces serve `/offer/<token>`: the page itself for an open link, and
 * the verify route once a password has been accepted. Both used to assemble the
 * public shape by hand, field by field, in two places — which meant the answer
 * to «ماذا ترى الشركة؟» lived in two files that were free to disagree, and
 * adding the negotiation to one of them would have shipped a page where the
 * conversation appears only for offers with no password.
 *
 * So there is one builder, and it is a WHITELIST. Not `{...offer}` minus a few
 * keys: a spread means every column added to `partnership_offers` from now on
 * is public by default and private only if someone remembers to subtract it.
 * That is the wrong default for a table holding a bcrypt hash.
 *
 * What is deliberately absent from `PublicOfferExchange`:
 *   `status`         — Khaled's read on the reply. «مرفوض» is not a thing to
 *                      show the company that sent it.
 *   `internal_note`  — his private note. Lives in a different column from our
 *                      public answer for exactly this reason; see
 *                      `lib/db/schema/offer-counters.ts`.
 *   `responder_email`— a colleague's address the page has no reason to reprint.
 */
function toPublicExchange(
  response: OfferResponse,
  counters: PublicOfferExchange["counters"],
): PublicOfferExchange {
  return {
    id: response.id,
    selected_package: response.selected_package,
    proposed_amount: response.proposed_amount,
    proposed_currency: response.proposed_currency,
    notes: response.notes,
    responder_name: response.responder_name,
    created_at: response.created_at,
    counters,
  }
}

export async function buildPublicOffer(offer: PartnershipOffer): Promise<PublicPartnershipOffer> {
  const company_name = await getOfferCompanyName(offer.lead_id)
  const responses = await listOfferResponses(offer.id)
  const countersByResponse = await listOfferCountersByResponse(responses.map((r) => r.id))

  return {
    title: offer.title,
    intro: offer.intro,
    body: offer.body,
    packages: offer.packages,
    validity_note: offer.validity_note,
    contact_email: offer.contact_email,
    company_name,
    // Newest round first, matching `listOfferResponses`. Our replies inside a
    // round stay oldest-first — a conversation reads forwards.
    exchanges: responses.map((r) =>
      toPublicExchange(
        r,
        (countersByResponse.get(r.id) ?? []).map((c) => ({
          id: c.id,
          message: c.message,
          counter_amount: c.counter_amount,
          counter_currency: c.counter_currency,
          created_at: c.created_at,
        })),
      ),
    ),
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
