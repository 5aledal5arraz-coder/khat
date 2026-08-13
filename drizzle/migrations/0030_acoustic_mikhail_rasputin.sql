-- «ردّ خط» — our side of the negotiation.
--
-- Additive only, and written to be replayable: our migrator compares a
-- high-water mark rather than checking membership, so a re-run must not abort.
-- Same shape and same idempotency style as 0028 (offer_responses).

CREATE TABLE IF NOT EXISTS "offer_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"response_id" text NOT NULL,
	"message" text NOT NULL,
	"counter_amount" numeric(10, 3),
	"counter_currency" text DEFAULT 'KWD' NOT NULL,
	-- Deliberately NOT a foreign key to admin_users. It was one, briefly, and it
	-- refused every reply written in `next dev`: devNoAuthUser() serves a
	-- synthetic admin whose id is in no table. Authorship is metadata; it must
	-- never be able to reject the record it describes. Matches
	-- crm_activities.actor, which is plain text for the same reason.
	"author_admin_id" text,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "offer_counters" ADD CONSTRAINT "offer_counters_offer_id_partnership_offers_id_fk"
    FOREIGN KEY ("offer_id") REFERENCES "public"."partnership_offers"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "offer_counters" ADD CONSTRAINT "offer_counters_response_id_offer_responses_id_fk"
    FOREIGN KEY ("response_id") REFERENCES "public"."offer_responses"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_counters_offer" ON "offer_counters" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offer_counters_response" ON "offer_counters" USING btree ("response_id");
--> statement-breakpoint

-- The API validates too; this is the floor that holds when someone posts
-- straight at the database. Mirrors offer_responses_amount_check.
DO $$ BEGIN
  ALTER TABLE "offer_counters" ADD CONSTRAINT "offer_counters_amount_check"
    CHECK ("counter_amount" IS NULL OR "counter_amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- A counter with no sentence beside it is a number appearing on a partner's
-- screen with no explanation. Required in the route; required here too.
DO $$ BEGIN
  ALTER TABLE "offer_counters" ADD CONSTRAINT "offer_counters_message_check"
    CHECK (length(btrim("message")) > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
