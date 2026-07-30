CREATE TABLE "room_takes" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"take_number" integer DEFAULT 1 NOT NULL,
	"anchor_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"camera_offset_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_takes_room_take" UNIQUE("room_id","take_number")
);
--> statement-breakpoint
ALTER TABLE "collaboration_rooms" ADD COLUMN "take_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_session_markers" ADD COLUMN "take_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_takes" ADD CONSTRAINT "room_takes_room_id_collaboration_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."collaboration_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_room_session_markers_room_take" ON "room_session_markers" USING btree ("room_id","take_number");