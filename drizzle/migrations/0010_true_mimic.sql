CREATE TABLE "model_benchmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"baseline_model" text NOT NULL,
	"candidate_model" text NOT NULL,
	"suite_version" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"scores" jsonb,
	"summary" jsonb,
	"thresholds" jsonb,
	"judge_model" text,
	"error" text,
	"triggered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "model_benchmarks_pair_idx" ON "model_benchmarks" USING btree ("candidate_model","baseline_model","suite_version");--> statement-breakpoint
CREATE INDEX "model_benchmarks_created_idx" ON "model_benchmarks" USING btree ("created_at");