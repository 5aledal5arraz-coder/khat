CREATE TABLE IF NOT EXISTS "contact_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"email_status" text DEFAULT 'queued' NOT NULL,
	"email_error" text,
	"emailed_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_messages_created" ON "contact_messages" USING btree ("created_at");