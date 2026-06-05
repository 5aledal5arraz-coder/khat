import { pgTable, text, boolean, timestamp, uuid, jsonb } from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Admin Users — standalone auth (not Firebase)
// ---------------------------------------------------------------------------

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  password_hash: text("password_hash").notNull(),
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
