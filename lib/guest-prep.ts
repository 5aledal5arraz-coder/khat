import crypto from "crypto"
import { db } from "@/lib/db"
import { guestPrepForms } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { GuestPrepForm, GuestPrepResponse, GuestPrepFormStatus } from "@/types/database"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default expiry: 30 days */
export const PREP_FORM_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Token helpers (same pattern as admin auth)
// ---------------------------------------------------------------------------

export function generatePrepToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export function hashPrepToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

// ---------------------------------------------------------------------------
// DB row → app type
// ---------------------------------------------------------------------------

function rowToForm(row: typeof guestPrepForms.$inferSelect): GuestPrepForm {
  return {
    id: row.id,
    application_id: row.application_id,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    token_hash: row.token_hash,
    status: row.status as GuestPrepFormStatus,
    expires_at: row.expires_at ? row.expires_at.toISOString() : null,
    response: row.response as GuestPrepResponse | null,
    submitted_at: row.submitted_at ? row.submitted_at.toISOString() : null,
    created_by: row.created_by,
    created_at: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPrepForm(params: {
  applicationId: string
  guestName: string
  guestEmail: string
  createdBy: string
  expiresInMs?: number
}): Promise<{ form: GuestPrepForm; rawToken: string }> {
  if (!db) throw new Error("Database not available")

  const rawToken = generatePrepToken()
  const tokenHash = hashPrepToken(rawToken)
  const expiresAt = new Date(Date.now() + (params.expiresInMs ?? PREP_FORM_EXPIRY_MS))

  const rows = await db.insert(guestPrepForms).values({
    application_id: params.applicationId,
    guest_name: params.guestName,
    guest_email: params.guestEmail,
    token_hash: tokenHash,
    status: "pending",
    expires_at: expiresAt,
    created_by: params.createdBy,
  }).returning()

  return { form: rowToForm(rows[0]), rawToken }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getPrepFormByToken(rawToken: string): Promise<GuestPrepForm | null> {
  if (!db) return null

  const tokenHash = hashPrepToken(rawToken)
  const rows = await db.select().from(guestPrepForms)
    .where(eq(guestPrepForms.token_hash, tokenHash))
    .limit(1)

  if (!rows[0]) return null
  return rowToForm(rows[0])
}

export async function getPrepFormByApplicationId(applicationId: string): Promise<GuestPrepForm | null> {
  if (!db) return null

  const rows = await db.select().from(guestPrepForms)
    .where(eq(guestPrepForms.application_id, applicationId))
    .limit(1)

  if (!rows[0]) return null
  return rowToForm(rows[0])
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

export type TokenValidation =
  | { valid: true; form: GuestPrepForm }
  | { valid: false; reason: "not_found" | "expired" | "revoked" }

export function validatePrepToken(form: GuestPrepForm | null): TokenValidation {
  if (!form) return { valid: false, reason: "not_found" }
  if (form.status === "revoked") return { valid: false, reason: "revoked" }
  if (form.expires_at && new Date(form.expires_at) < new Date()) {
    return { valid: false, reason: "expired" }
  }
  return { valid: true, form }
}

// ---------------------------------------------------------------------------
// Submit response
// ---------------------------------------------------------------------------

export async function submitPrepResponse(
  rawToken: string,
  response: GuestPrepResponse
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Database not available" }

  const form = await getPrepFormByToken(rawToken)
  const validation = validatePrepToken(form)
  if (!validation.valid) return { success: false, error: validation.reason }

  const { form: validForm } = validation

  // Only allow submission when pending or submitted (re-edit)
  if (validForm.status === "locked") {
    return { success: false, error: "locked" }
  }

  const tokenHash = hashPrepToken(rawToken)
  await db.update(guestPrepForms)
    .set({
      response: response as unknown as Record<string, unknown>,
      status: "submitted",
      submitted_at: new Date(),
    })
    .where(eq(guestPrepForms.token_hash, tokenHash))

  return { success: true }
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export async function lockPrepForm(applicationId: string): Promise<GuestPrepForm | null> {
  if (!db) throw new Error("Database not available")

  const rows = await db.update(guestPrepForms)
    .set({ status: "locked" })
    .where(eq(guestPrepForms.application_id, applicationId))
    .returning()

  return rows[0] ? rowToForm(rows[0]) : null
}

export async function unlockPrepForm(applicationId: string): Promise<GuestPrepForm | null> {
  if (!db) throw new Error("Database not available")

  const rows = await db.update(guestPrepForms)
    .set({ status: "submitted" })
    .where(eq(guestPrepForms.application_id, applicationId))
    .returning()

  return rows[0] ? rowToForm(rows[0]) : null
}

export async function revokePrepForm(applicationId: string): Promise<GuestPrepForm | null> {
  if (!db) throw new Error("Database not available")

  const rows = await db.update(guestPrepForms)
    .set({ status: "revoked" })
    .where(eq(guestPrepForms.application_id, applicationId))
    .returning()

  return rows[0] ? rowToForm(rows[0]) : null
}

export async function regeneratePrepToken(applicationId: string): Promise<{ form: GuestPrepForm; rawToken: string } | null> {
  if (!db) throw new Error("Database not available")

  const rawToken = generatePrepToken()
  const tokenHash = hashPrepToken(rawToken)
  const expiresAt = new Date(Date.now() + PREP_FORM_EXPIRY_MS)

  const rows = await db.update(guestPrepForms)
    .set({
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: "pending",
    })
    .where(eq(guestPrepForms.application_id, applicationId))
    .returning()

  if (!rows[0]) return null
  return { form: rowToForm(rows[0]), rawToken }
}
