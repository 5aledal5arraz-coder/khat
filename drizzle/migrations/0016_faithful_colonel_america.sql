CREATE TABLE "studio_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text,
	"raw_session_id" uuid,
	"edited_session_id" uuid,
	"state" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_raw_session_id_studio_sessions_id_fk" FOREIGN KEY ("raw_session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_edited_session_id_studio_sessions_id_fk" FOREIGN KEY ("edited_session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_studio_projects_eir" ON "studio_projects" USING btree ("eir_id");--> statement-breakpoint
CREATE INDEX "idx_studio_projects_raw_session" ON "studio_projects" USING btree ("raw_session_id");--> statement-breakpoint
CREATE INDEX "idx_studio_projects_edited_session" ON "studio_projects" USING btree ("edited_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_studio_projects_eir" ON "studio_projects" USING btree ("eir_id") WHERE eir_id IS NOT NULL;