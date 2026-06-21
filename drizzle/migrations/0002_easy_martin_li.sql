ALTER TABLE "room_card_notes" ALTER COLUMN "card_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_card_notes" ADD COLUMN "section_key" text;