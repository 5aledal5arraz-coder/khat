ALTER TABLE "teaser_questions" ALTER COLUMN "display_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teasers" ALTER COLUMN "guest_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teaser_questions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "teasers" ADD COLUMN "eir_id" text;--> statement-breakpoint
ALTER TABLE "teasers" ADD COLUMN "guest_id" text;--> statement-breakpoint
ALTER TABLE "teasers" ADD CONSTRAINT "teasers_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teasers" ADD CONSTRAINT "teasers_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;