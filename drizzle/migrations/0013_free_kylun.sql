CREATE TABLE "guest_prep_meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'video' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"notes" text,
	"outcome" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "guest_prep_meetings" ADD CONSTRAINT "guest_prep_meetings_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guest_prep_meetings_candidate" ON "guest_prep_meetings" USING btree ("candidate_id");