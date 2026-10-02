/**
 * Messages sent through the public «تواصل معنا» form (/contact).
 *
 * Every message is stored here FIRST, then the team is notified by email.
 * The two are recorded separately on purpose: a message is never lost because
 * Resend refused or was down — it is in the admin inbox either way — and the
 * row says whether the notification actually went out (`email_status`), so a
 * failed send is visible instead of being a swallowed catch.
 */
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core"

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    /** queued | sent | failed — the TEAM notification, not the message itself. */
    email_status: text("email_status").notNull().default("queued"),
    /** Last provider/queue error when `email_status` is failed (or a retry is pending). */
    email_error: text("email_error"),
    emailed_at: timestamp("emailed_at", { withTimezone: true }),
    /** Set when an operator opens it in the admin inbox; null = unread. */
    read_at: timestamp("read_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_contact_messages_created").on(t.created_at)],
)
