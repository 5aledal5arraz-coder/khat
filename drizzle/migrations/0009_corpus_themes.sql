CREATE TABLE "corpus_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label_ar" text NOT NULL,
	"description_ar" text,
	"example_titles" jsonb DEFAULT '[]'::jsonb,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"centroid" jsonb,
	"episode_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"khat_count" integer DEFAULT 0 NOT NULL,
	"mean_engagement" real,
	"median_engagement" real,
	"resonance_score" real,
	"saturation_score" real,
	"is_white_space" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "corpus_themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "idx_corpus_themes_resonance" ON "corpus_themes" USING btree ("resonance_score");--> statement-breakpoint
CREATE INDEX "idx_corpus_themes_whitespace" ON "corpus_themes" USING btree ("is_white_space");