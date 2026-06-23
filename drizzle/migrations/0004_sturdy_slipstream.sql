CREATE TABLE "episode_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	"appearance_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episode_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"related_episode_id" text NOT NULL,
	"relation_type" text DEFAULT 'related' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episode_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "episode_guests" ADD CONSTRAINT "episode_guests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_guests" ADD CONSTRAINT "episode_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_relationships" ADD CONSTRAINT "episode_relationships_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_relationships" ADD CONSTRAINT "episode_relationships_related_episode_id_episodes_id_fk" FOREIGN KEY ("related_episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_topics" ADD CONSTRAINT "episode_topics_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_topics" ADD CONSTRAINT "episode_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_episode_guests_episode_guest" ON "episode_guests" USING btree ("episode_id","guest_id");--> statement-breakpoint
CREATE INDEX "idx_episode_guests_episode" ON "episode_guests" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "idx_episode_guests_guest" ON "episode_guests" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_episode_rel" ON "episode_relationships" USING btree ("episode_id","related_episode_id","relation_type");--> statement-breakpoint
CREATE INDEX "idx_episode_rel_episode" ON "episode_relationships" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "idx_episode_rel_related" ON "episode_relationships" USING btree ("related_episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_episode_topics" ON "episode_topics" USING btree ("episode_id","topic_id");--> statement-breakpoint
CREATE INDEX "idx_episode_topics_episode" ON "episode_topics" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "idx_episode_topics_topic" ON "episode_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_topics_slug" ON "topics" USING btree ("slug");