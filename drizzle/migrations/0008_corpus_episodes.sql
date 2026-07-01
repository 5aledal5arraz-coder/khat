CREATE TABLE "corpus_episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"source_slug" text NOT NULL,
	"is_khat" boolean DEFAULT false NOT NULL,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"external_id" text NOT NULL,
	"channel_id" text,
	"title" text NOT NULL,
	"description" text,
	"published_at" timestamp with time zone,
	"duration_seconds" integer,
	"view_count" bigint,
	"like_count" integer,
	"comment_count" integer,
	"engagement_index" real,
	"transcript" text,
	"transcribed_at" timestamp with time zone,
	"themes" jsonb DEFAULT '[]'::jsonb,
	"archetype" text,
	"extracted" jsonb,
	"embedding" jsonb,
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_corpus_source_external" ON "corpus_episodes" USING btree ("source_slug","external_id");--> statement-breakpoint
CREATE INDEX "idx_corpus_source" ON "corpus_episodes" USING btree ("source_slug");--> statement-breakpoint
CREATE INDEX "idx_corpus_engagement" ON "corpus_episodes" USING btree ("engagement_index");--> statement-breakpoint
CREATE INDEX "idx_corpus_published" ON "corpus_episodes" USING btree ("published_at");