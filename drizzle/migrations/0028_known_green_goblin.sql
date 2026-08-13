-- The company's counter-offer.
--
-- Additive only, and written to be replayable: our migrator compares a
-- high-water mark rather than checking membership, so a re-run must not abort.

CREATE TABLE IF NOT EXISTS "offer_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"selected_package" text NOT NULL,
	"proposed_amount" numeric(10, 3),
	"proposed_currency" text DEFAULT 'KWD' NOT NULL,
	"notes" text,
	"responder_name" text NOT NULL,
	"responder_email" text NOT NULL,
	"responder_job_title" text,
	"status" text DEFAULT 'new' NOT NULL,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "offer_responses" ADD CONSTRAINT "offer_responses_offer_id_partnership_offers_id_fk"
    FOREIGN KEY ("offer_id") REFERENCES "public"."partnership_offers"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_responses_offer" ON "offer_responses" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_responses_status" ON "offer_responses" USING btree ("status");
--> statement-breakpoint
-- Only Khaled's four states are meaningful; a typo in an action must not be
-- able to invent a fifth that no screen knows how to render.
DO $$ BEGIN
  ALTER TABLE "offer_responses" ADD CONSTRAINT "offer_responses_status_check"
    CHECK ("status" IN ('new','reviewed','accepted','declined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- A counter-offer of zero or a negative number is not a negotiation, it is a
-- malformed or hostile payload. The API validates too; this is the floor that
-- holds when someone posts straight at the database.
DO $$ BEGIN
  ALTER TABLE "offer_responses" ADD CONSTRAINT "offer_responses_amount_check"
    CHECK ("proposed_amount" IS NULL OR "proposed_amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
