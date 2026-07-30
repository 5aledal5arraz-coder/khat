CREATE TABLE "recording_checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"take_number" integer DEFAULT 1 NOT NULL,
	"item_key" text NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"not_applicable_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recording_checklist_room_take_item" UNIQUE("room_id","take_number","item_key")
);
--> statement-breakpoint
ALTER TABLE "recording_checklist_items" ADD CONSTRAINT "recording_checklist_items_room_id_collaboration_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."collaboration_rooms"("id") ON DELETE cascade ON UPDATE no action;