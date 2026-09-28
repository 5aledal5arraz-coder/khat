ALTER TABLE "collaboration_rooms" ADD COLUMN IF NOT EXISTS "current_question_id" text;--> statement-breakpoint
ALTER TABLE "collaboration_rooms" ADD COLUMN IF NOT EXISTS "current_section_started_ms" integer;
