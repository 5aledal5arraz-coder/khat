import { pgTable, text, boolean, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Admin Users — standalone auth (not Firebase)
// ---------------------------------------------------------------------------

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  password_hash: text("password_hash").notNull(),
  /**
   * The member's Arabic name, as the team says it out loud.
   *
   * Nullable on purpose: every account that existed before this column was
   * added has no name yet, and identity display must not break while Khaled
   * fills them in from /admin/team. Readers must go through
   * `resolveMemberName()` (lib/admin/team-identity.ts), which falls back to the
   * email's local part — the same string the five call sites derived inline
   * before. That fallback is also why this stays nullable rather than
   * backfilled: a real name is a decision, not a string transform.
   */
  display_name: text("display_name"),
  /**
   * The member's *صفحة* — the job he does in the studio (`JobTitle` in
   * lib/admin/team-identity.ts: host | director | photographer | sound |
   * producer | editor | viewer).
   *
   * DESCRIPTIVE ONLY. It picks the recording-room screen and the label people
   * see; it grants NO permission. `role` below is still the sole authority for
   * every action gate (`requireActionRole`). Keeping the two apart is what lets
   * Khaled be OWNER *and* the host, and Fahad be the director on a limited
   * account — see lib/collaboration/room-roles.ts.
   *
   * Not an enum/FK: the catalog with its Arabic labels lives in code (same
   * pattern as QUICK_MARKER_META), so adding a صفحة is a code review, not a
   * migration. Nullable — accounts without one fall back to deriving the room
   * role from `role`.
   */
  job_title: text("job_title"),
  role: text("role").notNull().default("VIEWER"), // OWNER | ADMIN | EDITOR | VIEWER
  is_active: boolean("is_active").notNull().default(true),
  created_by: uuid("created_by"), // nullable — OWNER has no creator
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// Admin Sessions — hashed tokens only
// ---------------------------------------------------------------------------

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull().unique(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  /**
   * Phase 1.1 — sliding session window.
   *
   * Updated by verifyAdminSession() whenever the slide rule actually
   * extends the session (throttled to at most one update per 5 minutes
   * per session). Nullable: pre-Phase-1.1 sessions and brand-new sessions
   * that haven't been re-verified yet keep this null. NULL is treated
   * as "never extended" by the slide decision function — i.e. the next
   * eligible request extends and stamps last_seen_at.
   */
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

// ---------------------------------------------------------------------------
// Admin Audit Logs
// ---------------------------------------------------------------------------

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor_user_id: uuid("actor_user_id").references(() => adminUsers.id),
  action: text("action").notNull(),
  target_user_id: uuid("target_user_id").references(() => adminUsers.id),
  ip_address: text("ip_address"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})
