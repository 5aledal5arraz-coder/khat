CREATE TABLE "partnership_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"token" text NOT NULL,
	"title" text,
	"intro" text,
	"body" text,
	"packages" jsonb DEFAULT '[]'::jsonb,
	"validity_note" text,
	"contact_email" text,
	"password_hash" text,
	"published" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "partnership_offers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "partner_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"episode_refs" jsonb DEFAULT '[]'::jsonb,
	"deliverables" jsonb DEFAULT '[]'::jsonb,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"roi_notes" text,
	"performance_summary" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partner_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"title" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"value" integer,
	"currency" text DEFAULT 'KWD' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"terms" text,
	"document_url" text,
	"signed_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partner_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"to_email" text,
	"from_email" text,
	"subject" text,
	"body" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"provider_message_id" text,
	"created_by" text,
	"sent_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partner_meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'call' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"attendees" text,
	"agenda" text,
	"notes" text,
	"outcome" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"actor" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"body" text NOT NULL,
	"author" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"type" text DEFAULT 'follow_up' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"created_by" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"contributor_name" text,
	"contributor_email" text,
	"reference" text,
	"status" text DEFAULT 'new' NOT NULL,
	"routed_kind" text,
	"routed_id" text,
	"routed_at" timestamp with time zone,
	"public_credit" boolean DEFAULT false NOT NULL,
	"outcome_emailed_at" timestamp with time zone,
	"triage_status" text DEFAULT 'generating' NOT NULL,
	"quality_score" integer,
	"category" text,
	"ai_summary" text,
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"concerns" jsonb DEFAULT '[]'::jsonb,
	"spam" boolean DEFAULT false NOT NULL,
	"recommended_action" text,
	"action_rationale" text,
	"ai_raw" jsonb,
	"error_message" text,
	"triaged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "market_source_feedback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"source_id" text NOT NULL,
	"theme" text NOT NULL,
	"signal_score" real NOT NULL,
	"trust_before" real NOT NULL,
	"trust_after" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DROP TABLE "thinker_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "sponsorship_leads" ADD COLUMN "company_website" text;--> statement-breakpoint
ALTER TABLE "sponsorship_leads" ADD COLUMN "brand_values" text;--> statement-breakpoint
ALTER TABLE "sponsorship_leads" ADD COLUMN "campaign_goals" text;--> statement-breakpoint
ALTER TABLE "sponsorship_leads" ADD COLUMN "expectations" text;--> statement-breakpoint
ALTER TABLE "sponsorship_leads" ADD COLUMN "previous_partnerships" text;--> statement-breakpoint
ALTER TABLE "sponsorship_leads" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "research_summary" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "research_sources" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "reputation" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "products_summary" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "market_position" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "audience_summary" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "fit_verdict" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "fit_reasoning" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "recommended_structure" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "recommended_episodes" integer;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "pricing_strategy" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "recommended_action" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "action_rationale" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "win_probability" integer;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "strategy_summary" text;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "talking_points" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "likely_objections" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "negotiation_tactics" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD COLUMN "researched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sponsorship_proposals" ADD COLUMN "reply_email" text;--> statement-breakpoint
ALTER TABLE "guest_application_analysis" ADD COLUMN "research_summary" text;--> statement-breakpoint
ALTER TABLE "guest_application_analysis" ADD COLUMN "research_sources" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "guest_application_analysis" ADD COLUMN "public_presence" text;--> statement-breakpoint
ALTER TABLE "guest_application_analysis" ADD COLUMN "credibility_note" text;--> statement-breakpoint
ALTER TABLE "guest_application_analysis" ADD COLUMN "researched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD COLUMN "topic_category" text;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD COLUMN "regional_note" text;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD COLUMN "topic_subcategory" text;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD COLUMN "success_score" real;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD COLUMN "editorial_intel" jsonb;--> statement-breakpoint
ALTER TABLE "partnership_offers" ADD CONSTRAINT "partnership_offers_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_campaigns" ADD CONSTRAINT "partner_campaigns_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contracts" ADD CONSTRAINT "partner_contracts_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_emails" ADD CONSTRAINT "partner_emails_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_meetings" ADD CONSTRAINT "partner_meetings_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_source_feedback_events" ADD CONSTRAINT "market_source_feedback_events_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_partner_campaigns_lead" ON "partner_campaigns" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_partner_contracts_lead" ON "partner_contracts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_partner_emails_lead" ON "partner_emails" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_partner_meetings_lead" ON "partner_meetings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_crm_activities_subject" ON "crm_activities" USING btree ("subject_kind","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_crm_notes_subject" ON "crm_notes" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "idx_crm_tasks_subject" ON "crm_tasks" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "idx_crm_tasks_due" ON "crm_tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "idx_community_type_status" ON "community_contributions" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "idx_community_created" ON "community_contributions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_source_feedback_eir" ON "market_source_feedback_events" USING btree ("eir_id");--> statement-breakpoint
CREATE INDEX "idx_source_feedback_source" ON "market_source_feedback_events" USING btree ("source_id");