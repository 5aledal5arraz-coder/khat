CREATE TABLE "deleted_episodes" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now(),
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "episode_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "episode_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "episode_enrichments" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"hero_summary" text,
	"full_summary" text,
	"takeaways" jsonb,
	"resources" jsonb,
	"timestamps" jsonb,
	"why_this_conversation" text,
	"before_you_watch" jsonb,
	"conversation_map" jsonb,
	"central_question" text,
	"exclusive_clip" jsonb,
	"unsaid_reflections" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episode_overrides" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"original_title" text NOT NULL,
	"custom_title" text NOT NULL,
	"custom_description" text
);
--> statement-breakpoint
CREATE TABLE "episode_quotes_config" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"episode_title" text NOT NULL,
	"quotes" jsonb NOT NULL,
	"transcript" text,
	"status" text DEFAULT 'draft',
	"generated_at" text,
	"published_at" text
);
--> statement-breakpoint
CREATE TABLE "episode_sponsors" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"custom_brand_line" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episode_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"change_type" text NOT NULL,
	"change_summary" text,
	"snapshot" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"summary" text,
	"key_takeaways" jsonb,
	"youtube_url" text NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"release_date" date NOT NULL,
	"episode_number" integer,
	"season" integer,
	"mood" text,
	"thumbnail_url" text,
	"status" text DEFAULT 'published',
	"featured" boolean DEFAULT false,
	"view_count" integer DEFAULT 0,
	"category_id" text,
	"guest_id" text,
	"guest_testimonial" text,
	"guest_video_url" text,
	"audio_url" text,
	"audio_type" text,
	"rss_guid" text,
	"rss_published_at" timestamp with time zone,
	"audio_duration" integer,
	"eir_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "episodes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "episodes_rss_guid_unique" UNIQUE("rss_guid")
);
--> statement-breakpoint
CREATE TABLE "hidden_episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"guest_id" text,
	"text" text NOT NULL,
	"theme" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"type" text
);
--> statement-breakpoint
CREATE TABLE "timestamps" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"time_seconds" integer NOT NULL,
	"title" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "guest_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"country" text NOT NULL,
	"can_travel_to_kuwait" text,
	"story_idea" text NOT NULL,
	"beyond_job_title" text NOT NULL,
	"life_changing_moment" text NOT NULL,
	"hope_people_understand" text NOT NULL,
	"unasked_question" text NOT NULL,
	"why_khat" text NOT NULL,
	"previous_podcast" boolean DEFAULT false,
	"previous_podcast_info" text,
	"prefer_dialogue_or_story" text NOT NULL,
	"topics_to_avoid" text,
	"filming_concern" text DEFAULT 'no',
	"agrees_to_publish" boolean DEFAULT true,
	"social_links" text,
	"status" text DEFAULT 'new',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"bio" text,
	"photo_url" text,
	"external_links" jsonb DEFAULT '{}'::jsonb,
	"testimonial" text,
	"normalized_name" text GENERATED ALWAYS AS (regexp_replace(regexp_replace(translate(lower(name), E'ًٌٍَُِّْٰ', ''), '[^a-z0-9؀-ۿ\s]+', ' ', 'g'), '\s+', ' ', 'g')) STORED,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guests_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "studio_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_url" text,
	"video_id" text,
	"source" text,
	"status" text DEFAULT 'draft',
	"video_title" text,
	"channel_title" text,
	"published_at" timestamp with time zone,
	"duration_seconds" integer,
	"thumbnail_url" text,
	"raw_youtube_response" jsonb,
	"audio_filename" text,
	"audio_file_size" integer,
	"audio_start_seconds" integer,
	"audio_end_seconds" integer,
	"audio_best_intro" text,
	"audio_edit_suggestions" jsonb,
	"episode_id" text,
	"episode_title" text,
	"source_type" text,
	"notes" text,
	"eir_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_reflections" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"short_quote" text NOT NULL,
	"reflection" text NOT NULL,
	"thinking_question" text NOT NULL,
	"attribution" text,
	"episode_id" text,
	"episode_slug" text,
	"episode_title" text,
	"status" text DEFAULT 'draft',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "home_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"attribution" text NOT NULL,
	"episode_id" text,
	"episode_slug" text,
	"episode_title" text,
	"theme" text,
	"scheduled_date" text,
	"status" text DEFAULT 'draft',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "homepage_featured" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"episode_id" text NOT NULL,
	"custom_quote" text,
	"custom_description" text,
	"custom_image" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "homepage_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "homepage_thinkers" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"guest_id" text NOT NULL,
	"custom_title" text,
	"custom_description" text,
	"custom_image" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teaser_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"teaser_id" text NOT NULL,
	"display_name" text NOT NULL,
	"question_text" text NOT NULL,
	"status" text DEFAULT 'pending',
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teasers" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_name" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"video_filename" text NOT NULL,
	"poster_image" text,
	"is_active" boolean DEFAULT false,
	"publish_at" text,
	"expire_at" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "thinker_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"thinker_name" text NOT NULL,
	"research_field" text NOT NULL,
	"reason" text NOT NULL,
	"social_links" text,
	"phone" text,
	"status" text DEFAULT 'new',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text,
	"event_type" text NOT NULL,
	"event_data" jsonb,
	"page_path" text,
	"referrer" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "config_store" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_notifications_log" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"notification_type" text NOT NULL,
	"trigger_user_id" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "email_notifications_log_recipient_id_notification_type_trigger_user_id_target_id_unique" UNIQUE("recipient_id","notification_type","trigger_user_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'active',
	"unsubscribe_token" text,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "personalization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "personalization_profiles_visitor_id_unique" UNIQUE("visitor_id")
);
--> statement-breakpoint
CREATE TABLE "platform_analytics" (
	"platform" text PRIMARY KEY NOT NULL,
	"followers" integer DEFAULT 0,
	"posts" integer DEFAULT 0,
	"engagement" text DEFAULT '0%',
	"url" text DEFAULT '',
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"metadata" jsonb,
	"social_links" jsonb,
	"seo" jsonb,
	"feature_flags" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sponsorship_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"industry" text NOT NULL,
	"contact_name" text NOT NULL,
	"job_title" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"collaboration_types" text[] DEFAULT '{}',
	"collaboration_other" text,
	"main_goal" text NOT NULL,
	"target_audience" text NOT NULL,
	"preferred_timeline" text,
	"budget_range" text NOT NULL,
	"additional_info" text,
	"status" text DEFAULT 'new',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "static_content" (
	"key" text PRIMARY KEY NOT NULL,
	"content" jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "visitor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text NOT NULL,
	"event_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "visitor_profiles" (
	"visitor_id" text PRIMARY KEY NOT NULL,
	"interest_vector" jsonb NOT NULL,
	"last_updated" text,
	"event_count_at_build" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "watch_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text NOT NULL,
	"episode_id" text NOT NULL,
	"progress" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trusted_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"website_url" text,
	"show_on_homepage" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "newsletter_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'one_off' NOT NULL,
	"subject" text NOT NULL,
	"preview_text" text,
	"content_html" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_by" text,
	"total_recipients" integer DEFAULT 0,
	"total_sent" integer DEFAULT 0,
	"total_failed" integer DEFAULT 0,
	"total_delivered" integer DEFAULT 0,
	"total_opened" integer DEFAULT 0,
	"total_clicked" integer DEFAULT 0,
	"total_bounced" integer DEFAULT 0,
	"total_complaints" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "newsletter_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"link_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "newsletter_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"subscriber_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"resend_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"open_count" integer DEFAULT 0,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"click_count" integer DEFAULT 0,
	"first_clicked_at" timestamp with time zone,
	"last_clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "newsletter_deliveries_campaign_id_subscriber_id_unique" UNIQUE("campaign_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_links" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"url" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "newsletter_links_token_unique" UNIQUE("token"),
	CONSTRAINT "newsletter_links_campaign_id_url_unique" UNIQUE("campaign_id","url")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"ip_address" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'VIEWER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "podcast_platform_links" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_key" text NOT NULL,
	"platform_name" text NOT NULL,
	"url" text NOT NULL,
	"handle" text,
	"icon_name" text,
	"category" text DEFAULT 'other' NOT NULL,
	"is_primary" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"show_in_header" boolean DEFAULT false,
	"show_in_footer" boolean DEFAULT true,
	"show_on_homepage" boolean DEFAULT false,
	"show_on_episode_page" boolean DEFAULT false,
	"show_on_about_page" boolean DEFAULT false,
	"show_on_contact_page" boolean DEFAULT false,
	"show_on_guest_page" boolean DEFAULT false,
	"notes_internal" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "podcast_platform_links_platform_key_unique" UNIQUE("platform_key")
);
--> statement-breakpoint
CREATE TABLE "sponsorship_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"status" text DEFAULT 'generating',
	"fit_score" integer,
	"quality" text,
	"risk_level" text,
	"intent_summary" text,
	"budget_fit" text,
	"recommended_package" text,
	"reasoning" text,
	"risk_flags" jsonb DEFAULT '[]'::jsonb,
	"opportunity_highlights" jsonb DEFAULT '[]'::jsonb,
	"raw_response" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sponsorship_analysis_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "sponsorship_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"analysis_id" text,
	"status" text DEFAULT 'generating',
	"subject" text,
	"greeting" text,
	"introduction" text,
	"value_proposition" text,
	"proposed_packages" jsonb DEFAULT '[]'::jsonb,
	"next_steps" text,
	"closing" text,
	"full_draft" text,
	"edited_draft" text,
	"tone" text DEFAULT 'formal',
	"raw_response" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_application_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"status" text DEFAULT 'generating',
	"fit_score" integer,
	"emotional_depth_score" integer,
	"story_clarity_score" integer,
	"originality_score" integer,
	"readiness_score" integer,
	"risk_level" text,
	"recommendation" text,
	"fit_summary" text,
	"strongest_angle" text,
	"why_now" text,
	"audience_value" text,
	"concerns" jsonb DEFAULT '[]'::jsonb,
	"strengths" jsonb DEFAULT '[]'::jsonb,
	"suggested_direction" text,
	"raw_response" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guest_application_analysis_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "guest_application_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"analysis_id" text,
	"status" text DEFAULT 'generating',
	"proposed_episode_title" text,
	"title_alternatives" jsonb DEFAULT '[]'::jsonb,
	"episode_hook" text,
	"episode_logline" text,
	"why_this_episode_matters" text,
	"conversation_style" text,
	"suggested_opening_question" text,
	"suggested_core_questions" jsonb DEFAULT '[]'::jsonb,
	"suggested_sensitive_areas" jsonb DEFAULT '[]'::jsonb,
	"suggested_topics_to_avoid" jsonb DEFAULT '[]'::jsonb,
	"host_preparation_notes" text,
	"raw_response" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_application_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"analysis_id" text,
	"status" text DEFAULT 'generating',
	"acceptance_formal" text,
	"acceptance_warm" text,
	"rejection_formal" text,
	"rejection_warm" text,
	"consider_later_formal" text,
	"consider_later_warm" text,
	"raw_response" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guest_application_responses_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "guest_prep_forms" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"response" jsonb,
	"submitted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guest_prep_forms_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "guest_prep_forms_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "guest_candidate_ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"run_type" text NOT NULL,
	"model_name" text NOT NULL,
	"input_snapshot_json" jsonb,
	"output_snapshot_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "guest_candidate_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"prep_link_id" text,
	"notification_type" text NOT NULL,
	"delivery_channel" text NOT NULL,
	"recipient" text,
	"payload_json" jsonb,
	"delivered_at" timestamp with time zone,
	"delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_candidate_outreach_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"channel_type" text NOT NULL,
	"tone" text NOT NULL,
	"subject_line" text,
	"message_body" text NOT NULL,
	"generated_by_ai" boolean DEFAULT true,
	"edited_by_admin" boolean DEFAULT false,
	"version_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_candidate_social_links" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false,
	"confidence_score" real,
	"source" text DEFAULT 'manual',
	"verified_by_admin" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_candidate_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"old_status" text,
	"new_status" text NOT NULL,
	"changed_by" text,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text,
	"slug" text,
	"primary_language" text DEFAULT 'ar',
	"category" text,
	"city" text,
	"country" text,
	"bio" text,
	"notes_internal" text,
	"status" text DEFAULT 'new' NOT NULL,
	"source_type" text DEFAULT 'manual',
	"source_note" text,
	"priority_level" text DEFAULT 'medium',
	"ai_score_overall" real,
	"ai_fit_score" real,
	"ai_depth_score" real,
	"ai_reach_score" real,
	"ai_risk_score" real,
	"ai_summary" text,
	"ai_strengths" jsonb DEFAULT '[]'::jsonb,
	"ai_weaknesses" jsonb DEFAULT '[]'::jsonb,
	"ai_risk_notes" text,
	"ai_topics_json" jsonb DEFAULT '[]'::jsonb,
	"ai_reason_to_invite" text,
	"ai_conversation_angles_json" jsonb DEFAULT '[]'::jsonb,
	"ai_suggested_questions_json" jsonb DEFAULT '{}'::jsonb,
	"ai_model_used" text,
	"ai_generated_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"prep_link_last_sent_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guest_candidates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prep_form_links" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"template_id" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"sent_via" text,
	"location_note" text,
	"meeting_note" text,
	"admin_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "prep_form_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "prep_form_response_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"ai_personality_summary" text,
	"ai_talking_points_json" jsonb DEFAULT '[]'::jsonb,
	"ai_sensitive_topics_json" jsonb DEFAULT '[]'::jsonb,
	"ai_preferred_angles_json" jsonb DEFAULT '[]'::jsonb,
	"ai_followup_questions_json" jsonb DEFAULT '[]'::jsonb,
	"ai_red_flags_json" jsonb DEFAULT '[]'::jsonb,
	"ai_practical_notes" text,
	"ai_opening_line" text,
	"ai_recommended_style" text,
	"model_name" text,
	"generated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prep_form_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"prep_link_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"response_json" jsonb NOT NULL,
	"completion_percent" real DEFAULT 0,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prep_form_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"schema_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episode_preparations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"guest_name" text,
	"guest_description" text,
	"guest_profile_link" text,
	"guest_identity" jsonb,
	"short_description" text,
	"episode_goal" text,
	"key_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tone_type" text,
	"focus_mode" text,
	"expected_duration_min" integer,
	"depth_level" integer DEFAULT 3 NOT NULL,
	"boldness_level" integer DEFAULT 3 NOT NULL,
	"content_focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inputs_meta" jsonb,
	"research_data" jsonb,
	"executive_summary" jsonb,
	"knowledge_bank" jsonb,
	"guest_intelligence" jsonb,
	"conversation_axes" jsonb,
	"episode_flow" jsonb,
	"question_system" jsonb,
	"host_instructions" jsonb,
	"quotes_references" jsonb,
	"viral_moments" jsonb,
	"sections_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"live_token_hash" text,
	"live_state" jsonb,
	"linked_episode_id" text,
	"eir_id" text,
	"prep_v2" jsonb,
	"cards_generated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_preparations_live_token_hash_unique" UNIQUE("live_token_hash")
);
--> statement-breakpoint
CREATE TABLE "card_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"source_name" text,
	"credibility" text DEFAULT 'unverified' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"preparation_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"phase" text DEFAULT 'opening' NOT NULL,
	"energy_level" integer DEFAULT 3 NOT NULL,
	"active_card_id" text,
	"host_notes" text DEFAULT '' NOT NULL,
	"recording_started_at" timestamp with time zone,
	"recording_ended_at" timestamp with time zone,
	"recording_paused_at" timestamp with time zone,
	"recording_elapsed_ms" integer DEFAULT 0 NOT NULL,
	"director_notes" text,
	"current_section_key" text,
	"current_section_index" integer,
	"eir_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"preparation_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"section_id" text NOT NULL,
	"section_label" text NOT NULL,
	"bucket" text NOT NULL,
	"short_title" text NOT NULL,
	"source_question_id" text,
	"spoken_kuwaiti" text NOT NULL,
	"formal_version" text,
	"shorter_version" text,
	"deeper_version" text,
	"softer_version" text,
	"entry_soft" text,
	"entry_direct" text,
	"entry_emotional" text,
	"entry_provocative" text,
	"transition_out" text,
	"follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why_this_matters" text,
	"when_to_ask" text,
	"how_to_ask" text,
	"emotional_tone" text,
	"if_guest_avoids" text,
	"if_guest_emotional" text,
	"if_answer_weak" text,
	"sensitivity_note" text,
	"clip_potential" boolean DEFAULT false NOT NULL,
	"quote_potential" boolean DEFAULT false NOT NULL,
	"emotional_peak" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_card_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"card_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"note_type" text DEFAULT 'normal' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"is_seen_by_host" boolean DEFAULT false NOT NULL,
	"seen_by_host_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_card_state" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"card_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "room_card_state_room_card" UNIQUE("room_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "room_participants_room_user" UNIQUE("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "room_session_markers" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"author_id" text NOT NULL,
	"marker_type" text NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"recording_ms" integer NOT NULL,
	"section_key" text,
	"wall_time" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_accepted_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern_text" text NOT NULL,
	"category" text,
	"success_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_channel_fingerprint" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"identity_summary" text,
	"khat_dna" jsonb,
	"strongest_emotional_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"most_successful_episodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"most_successful_guests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analysis_notes" text,
	"raw_gemini_payload" jsonb,
	"model_name" text,
	"generated_by" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_episode_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"slot_index" integer,
	"working_title" text NOT NULL,
	"hook" text,
	"why_matters" text,
	"why_now" text,
	"goal" text,
	"description" text,
	"episode_type" text NOT NULL,
	"topic_domain" text DEFAULT 'none' NOT NULL,
	"topic_angle_code" text,
	"suggested_guest_candidate_id" text,
	"main_axes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"production_notes" text,
	"risk_level" text,
	"effort_level" text,
	"sponsor_appeal" text,
	"composite_score" real,
	"composite_score_rationale" text,
	"converted_preparation_id" text,
	"converted_episode_id" text,
	"converted_at" timestamp with time zone,
	"rejection_reason" text,
	"postponed_reason" text,
	"eir_id" text,
	"discovery_stale_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_episode_performance" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"episode_id" text,
	"preparation_id" text,
	"episode_title" text,
	"youtube_url" text,
	"release_date" text,
	"duration_minutes" integer,
	"view_count" integer,
	"quote_count" integer DEFAULT 0 NOT NULL,
	"has_enrichment" boolean DEFAULT false NOT NULL,
	"has_chapters" boolean DEFAULT false NOT NULL,
	"has_clips" boolean DEFAULT false NOT NULL,
	"like_count" integer,
	"comment_count" integer,
	"retention_pct" real,
	"performance_score" real,
	"topic_domain" text,
	"episode_type" text,
	"topic_angle_code" text,
	"guest_candidate_id" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_guest_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text,
	"bio" text,
	"gender" text DEFAULT 'unknown' NOT NULL,
	"profession" text,
	"why_fit" text,
	"topic_fit_rationale" text,
	"category" text,
	"country" text,
	"city" text,
	"public_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"social_accounts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"official_website" text,
	"evidence_summary" text,
	"evidence_citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relevance_score" real,
	"depth_score" real,
	"reach_score" real,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality" text DEFAULT 'normal' NOT NULL,
	"converted_to_guest_candidate_id" text,
	"converted_at" timestamp with time zone,
	"linked_guest_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_rejected_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern_text" text NOT NULL,
	"category" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"rejection_count" integer DEFAULT 1 NOT NULL,
	"last_rejected_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_season_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"admin_id" text,
	"batch_index" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"target" text DEFAULT 'pair' NOT NULL,
	"topic_candidate_id" text,
	"guest_candidate_id" text,
	"reason_category" text,
	"reason_text" text,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season_number" integer,
	"status" text DEFAULT 'planning' NOT NULL,
	"target_episode_count" integer DEFAULT 10 NOT NULL,
	"v2_mode" text,
	"v2_episode_target" integer,
	"editorial_controls" jsonb DEFAULT '{"guest_filters":{"gender":"all","nationality":"any"},"domain_weights":{},"identity_override":{"priorities":[],"tone_emphasis":{},"identity_description":null},"hard_avoid":{"banned_topics":[],"banned_guests":[],"repeated_topics_to_avoid":[]}}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"wizard_stage" text DEFAULT 'topics' NOT NULL,
	"topics_locked_at" timestamp with time zone,
	"guests_started_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_topic_bank" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"angle_notes" text,
	"angle_code" text,
	"episode_type" text,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"freshness" text DEFAULT 'fresh' NOT NULL,
	"last_used_season_id" text,
	"last_used_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'ai_discovered' NOT NULL,
	"importance_score" real,
	"status" text DEFAULT 'active' NOT NULL,
	"quality" text DEFAULT 'normal' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_topic_fingerprints" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text,
	"source" text NOT NULL,
	"angle_code" text,
	"title_ar" text NOT NULL,
	"summary_ar" text,
	"domain" text,
	"embedding" jsonb NOT NULL,
	"embedding_model" text NOT NULL,
	"topic_candidate_id" text,
	"decision_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_user_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"reason_category" text,
	"reason_text" text,
	"admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "khat_map_user_taste_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejected_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"depth_score" real DEFAULT 0.5 NOT NULL,
	"controversy_tolerance" real DEFAULT 0.5 NOT NULL,
	"emotional_preference" real DEFAULT 0.5 NOT NULL,
	"kuwait_relevance_weight" real DEFAULT 0.5 NOT NULL,
	"total_decisions" integer DEFAULT 0 NOT NULL,
	"last_recomputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eir_phase_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"from_phase" text,
	"to_phase" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_intelligence_records" (
	"id" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'idea' NOT NULL,
	"season_id" text,
	"working_title" text NOT NULL,
	"final_title" text,
	"topic_domain" text,
	"episode_type" text,
	"topic_angle_code" text,
	"guest_id" text,
	"editorial_intent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_level" text,
	"effort_level" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text,
	"season_id" text,
	"subject_table" text,
	"subject_id" text,
	"task_kind" text NOT NULL,
	"provider" text NOT NULL,
	"model_name" text NOT NULL,
	"prompt_version" text,
	"prompt_hash" text,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" real,
	"error_class" text,
	"error_message" text,
	"stripped_at" timestamp with time zone,
	"actor_id" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"episode_id" text,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"view_count" text,
	"like_count" text,
	"comment_count" text,
	"source" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_analysis_records" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text,
	"studio_session_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_provider_response" jsonb,
	"error" text,
	"edited_fields" jsonb,
	"generated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text,
	"source_episode_candidate_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"seed_prompt" text,
	"archetypes" jsonb,
	"source_config" jsonb,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_discovery_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"discovery_run_id" text,
	"target_episode_candidate_id" text,
	"proposed_name" text,
	"proposed_role" text,
	"proposed_country" text,
	"archetype" jsonb,
	"evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_summary" jsonb,
	"platform_signals" jsonb,
	"story_signals" jsonb,
	"general_rationale" text,
	"topic_fit_rationale" text,
	"social_links" jsonb,
	"editorial_fit_score" numeric,
	"hiddenness_score" numeric,
	"novelty_score" numeric,
	"evidence_strength_score" numeric,
	"topic_fit_score" numeric,
	"composite_score" numeric,
	"pipeline_version" text,
	"display_name" text,
	"full_name_normalized" text,
	"person_class_signals" jsonb,
	"identity_confidence" numeric,
	"attribute_confidences" jsonb,
	"evidence_bundle" jsonb,
	"hidden_gem_score" numeric,
	"recommendation_score" numeric,
	"dropped_reason" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"promoted_guest_id" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_topic_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"language" text NOT NULL,
	"signal_count" integer NOT NULL,
	"dominant_themes" jsonb NOT NULL,
	"dominant_emotions" jsonb NOT NULL,
	"median_view_signal" bigint,
	"source_breakdown" jsonb NOT NULL,
	"narrative_hooks" jsonb,
	"editorial_score" real,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_topic_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"language" text DEFAULT 'ar' NOT NULL,
	"view_signal" bigint,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"theme" text,
	"emotional_trigger" text,
	"controversy_score" real,
	"embedding" jsonb,
	"raw" jsonb NOT NULL,
	"review_status" text DEFAULT 'new' NOT NULL,
	"editorial_tags" jsonb,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"operator_notes" text,
	"operator_created" boolean DEFAULT false NOT NULL,
	"trusted_source_id" text,
	"signal_score" real,
	"score_components" jsonb
);
--> statement-breakpoint
CREATE TABLE "editorial_taste_weights" (
	"id" text PRIMARY KEY NOT NULL,
	"dimension" text NOT NULL,
	"key" text NOT NULL,
	"weight" real DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"last_reinforced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_signal_review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"tag" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_trusted_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"identifier" text NOT NULL,
	"display_name" text NOT NULL,
	"language" text DEFAULT 'ar' NOT NULL,
	"geography" text,
	"trust_score" real DEFAULT 0.5 NOT NULL,
	"editorial_alignment_score" real DEFAULT 0.5 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_application_links" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"application_id" text NOT NULL,
	"link_type" text DEFAULT 'accepted' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" text
);
--> statement-breakpoint
CREATE TABLE "guest_candidate_links" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"link_type" text DEFAULT 'promoted' NOT NULL,
	"confidence" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" text
);
--> statement-breakpoint
CREATE TABLE "guest_discovery_links" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"discovery_candidate_id" text,
	"discovery_run_id" text,
	"link_type" text DEFAULT 'promoted' NOT NULL,
	"confidence_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_identity_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"source_summary" jsonb,
	"discovery_evidence" jsonb,
	"application_summary" jsonb,
	"studio_signals" jsonb,
	"preparation_signals" jsonb,
	"social_accounts" jsonb,
	"speaking_style" jsonb,
	"story_arcs" jsonb,
	"risk_map" jsonb,
	"suggested_angles" jsonb,
	"extraction_questions" jsonb,
	"fit_scores" jsonb,
	"last_analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hybrid_topic_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text,
	"language" text DEFAULT 'ar' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output_topics" jsonb,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"rejection_summary" jsonb,
	"ai_run_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "original_thinking_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"lens" text NOT NULL,
	"philosophical_frame" text NOT NULL,
	"conflict" text NOT NULL,
	"emotional_hook" text NOT NULL,
	"language" text DEFAULT 'ar' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_performance_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"views_at_7d" real,
	"views_at_14d" real,
	"views_at_28d" real,
	"like_rate" real,
	"comment_rate" real,
	"engagement_rate" real,
	"view_velocity_7d" real,
	"view_velocity_14d" real,
	"view_velocity_28d" real,
	"editorial_signal_score" real,
	"baseline_used" text,
	"explanation" jsonb,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jsonb_validation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"column_name" text NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text,
	"mode" text NOT NULL,
	"source" text NOT NULL,
	"issue_count" integer NOT NULL,
	"issue_summary" text NOT NULL,
	"raw_value_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"year_month" text NOT NULL,
	"task_kind" text NOT NULL,
	"provider" text NOT NULL,
	"model_name" text NOT NULL,
	"prompt_version" text,
	"total_runs" integer NOT NULL,
	"succeeded" integer NOT NULL,
	"failed" integer NOT NULL,
	"timed_out" integer NOT NULL,
	"total_tokens_in" bigint DEFAULT 0 NOT NULL,
	"total_tokens_out" bigint DEFAULT 0 NOT NULL,
	"total_cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"mean_latency_ms" integer,
	"error_class_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_rate_limit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mode" text NOT NULL,
	"decision" text NOT NULL,
	"enforced" text DEFAULT 'false' NOT NULL,
	"tier" text NOT NULL,
	"task_kind" text NOT NULL,
	"actor_id" text,
	"subject_table" text,
	"subject_id" text,
	"current_concurrency" integer,
	"concurrency_limit" integer,
	"daily_cost_so_far_usd" real,
	"daily_cost_limit_usd" real,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_subject_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eir_invalid_transition_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"eir_id" text NOT NULL,
	"from_phase" text,
	"attempted_to_phase" text NOT NULL,
	"actor" text,
	"mode" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_sql" text
);
--> statement-breakpoint
CREATE TABLE "system_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"actor" text,
	"subject_kind" text,
	"subject_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_voice_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"candidate_id" text,
	"signal_type" text NOT NULL,
	"snapshot" jsonb,
	"weight" numeric DEFAULT '1.0' NOT NULL,
	"note" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_sponsors" ADD CONSTRAINT "episode_sponsors_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_versions" ADD CONSTRAINT "episode_versions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_category_id_episode_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."episode_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timestamps" ADD CONSTRAINT "timestamps_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaser_questions" ADD CONSTRAINT "teaser_questions_teaser_id_teasers_id_fk" FOREIGN KEY ("teaser_id") REFERENCES "public"."teasers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_clicks" ADD CONSTRAINT "newsletter_clicks_link_id_newsletter_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."newsletter_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_clicks" ADD CONSTRAINT "newsletter_clicks_delivery_id_newsletter_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."newsletter_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_links" ADD CONSTRAINT "newsletter_links_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_admin_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_user_id_admin_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_analysis" ADD CONSTRAINT "sponsorship_analysis_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorship_proposals" ADD CONSTRAINT "sponsorship_proposals_lead_id_sponsorship_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sponsorship_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_application_analysis" ADD CONSTRAINT "guest_application_analysis_application_id_guest_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."guest_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_application_concepts" ADD CONSTRAINT "guest_application_concepts_application_id_guest_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."guest_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_application_responses" ADD CONSTRAINT "guest_application_responses_application_id_guest_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."guest_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_prep_forms" ADD CONSTRAINT "guest_prep_forms_application_id_guest_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."guest_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_ai_runs" ADD CONSTRAINT "guest_candidate_ai_runs_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_notifications" ADD CONSTRAINT "guest_candidate_notifications_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_notifications" ADD CONSTRAINT "guest_candidate_notifications_prep_link_id_prep_form_links_id_fk" FOREIGN KEY ("prep_link_id") REFERENCES "public"."prep_form_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_outreach_messages" ADD CONSTRAINT "guest_candidate_outreach_messages_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_social_links" ADD CONSTRAINT "guest_candidate_social_links_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_status_history" ADD CONSTRAINT "guest_candidate_status_history_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_form_links" ADD CONSTRAINT "prep_form_links_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_form_links" ADD CONSTRAINT "prep_form_links_template_id_prep_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prep_form_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_form_response_analysis" ADD CONSTRAINT "prep_form_response_analysis_response_id_prep_form_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."prep_form_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_form_response_analysis" ADD CONSTRAINT "prep_form_response_analysis_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_form_responses" ADD CONSTRAINT "prep_form_responses_prep_link_id_prep_form_links_id_fk" FOREIGN KEY ("prep_link_id") REFERENCES "public"."prep_form_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_form_responses" ADD CONSTRAINT "prep_form_responses_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_preparations" ADD CONSTRAINT "episode_preparations_linked_episode_id_episodes_id_fk" FOREIGN KEY ("linked_episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_materials" ADD CONSTRAINT "card_materials_card_id_interview_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."interview_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_rooms" ADD CONSTRAINT "collaboration_rooms_preparation_id_episode_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."episode_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_rooms" ADD CONSTRAINT "collaboration_rooms_active_card_id_interview_cards_id_fk" FOREIGN KEY ("active_card_id") REFERENCES "public"."interview_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_cards" ADD CONSTRAINT "interview_cards_preparation_id_episode_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."episode_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_card_notes" ADD CONSTRAINT "room_card_notes_room_id_collaboration_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."collaboration_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_card_notes" ADD CONSTRAINT "room_card_notes_card_id_interview_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."interview_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_card_notes" ADD CONSTRAINT "room_card_notes_author_id_room_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_card_state" ADD CONSTRAINT "room_card_state_room_id_collaboration_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."collaboration_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_card_state" ADD CONSTRAINT "room_card_state_card_id_interview_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."interview_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_collaboration_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."collaboration_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_markers" ADD CONSTRAINT "room_session_markers_room_id_collaboration_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."collaboration_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_markers" ADD CONSTRAINT "room_session_markers_author_id_room_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD CONSTRAINT "khat_map_episode_candidates_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD CONSTRAINT "khat_map_episode_candidates_converted_preparation_id_episode_preparations_id_fk" FOREIGN KEY ("converted_preparation_id") REFERENCES "public"."episode_preparations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_candidates" ADD CONSTRAINT "khat_map_episode_candidates_converted_episode_id_episodes_id_fk" FOREIGN KEY ("converted_episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_performance" ADD CONSTRAINT "khat_map_episode_performance_candidate_id_khat_map_episode_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."khat_map_episode_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_performance" ADD CONSTRAINT "khat_map_episode_performance_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_performance" ADD CONSTRAINT "khat_map_episode_performance_preparation_id_episode_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."episode_preparations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_episode_performance" ADD CONSTRAINT "khat_map_episode_performance_guest_candidate_id_khat_map_guest_candidates_id_fk" FOREIGN KEY ("guest_candidate_id") REFERENCES "public"."khat_map_guest_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_guest_candidates" ADD CONSTRAINT "khat_map_guest_candidates_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_guest_candidates" ADD CONSTRAINT "khat_map_guest_candidates_converted_to_guest_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("converted_to_guest_candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_guest_candidates" ADD CONSTRAINT "khat_map_guest_candidates_linked_guest_id_guests_id_fk" FOREIGN KEY ("linked_guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_season_decisions" ADD CONSTRAINT "khat_map_season_decisions_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_season_decisions" ADD CONSTRAINT "khat_map_season_decisions_topic_candidate_id_khat_map_episode_candidates_id_fk" FOREIGN KEY ("topic_candidate_id") REFERENCES "public"."khat_map_episode_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_season_decisions" ADD CONSTRAINT "khat_map_season_decisions_guest_candidate_id_khat_map_guest_candidates_id_fk" FOREIGN KEY ("guest_candidate_id") REFERENCES "public"."khat_map_guest_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_topic_bank" ADD CONSTRAINT "khat_map_topic_bank_last_used_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("last_used_season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_topic_fingerprints" ADD CONSTRAINT "khat_map_topic_fingerprints_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_topic_fingerprints" ADD CONSTRAINT "khat_map_topic_fingerprints_topic_candidate_id_khat_map_episode_candidates_id_fk" FOREIGN KEY ("topic_candidate_id") REFERENCES "public"."khat_map_episode_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_topic_fingerprints" ADD CONSTRAINT "khat_map_topic_fingerprints_decision_id_khat_map_season_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."khat_map_season_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khat_map_user_feedback" ADD CONSTRAINT "khat_map_user_feedback_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eir_phase_transitions" ADD CONSTRAINT "eir_phase_transitions_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_intelligence_records" ADD CONSTRAINT "episode_intelligence_records_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_intelligence_records" ADD CONSTRAINT "episode_intelligence_records_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_analysis_records" ADD CONSTRAINT "studio_analysis_records_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_source_episode_candidate_id_khat_map_episode_candidates_id_fk" FOREIGN KEY ("source_episode_candidate_id") REFERENCES "public"."khat_map_episode_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_discovery_candidates" ADD CONSTRAINT "guest_discovery_candidates_discovery_run_id_discovery_runs_id_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_discovery_candidates" ADD CONSTRAINT "guest_discovery_candidates_target_episode_candidate_id_khat_map_episode_candidates_id_fk" FOREIGN KEY ("target_episode_candidate_id") REFERENCES "public"."khat_map_episode_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_signal_review_events" ADD CONSTRAINT "market_signal_review_events_signal_id_market_topic_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."market_topic_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_application_links" ADD CONSTRAINT "guest_application_links_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_application_links" ADD CONSTRAINT "guest_application_links_application_id_guest_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."guest_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_links" ADD CONSTRAINT "guest_candidate_links_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_candidate_links" ADD CONSTRAINT "guest_candidate_links_candidate_id_guest_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_discovery_links" ADD CONSTRAINT "guest_discovery_links_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_discovery_links" ADD CONSTRAINT "guest_discovery_links_discovery_candidate_id_guest_discovery_candidates_id_fk" FOREIGN KEY ("discovery_candidate_id") REFERENCES "public"."guest_discovery_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_identity_profiles" ADD CONSTRAINT "guest_identity_profiles_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hybrid_topic_generations" ADD CONSTRAINT "hybrid_topic_generations_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hybrid_topic_generations" ADD CONSTRAINT "hybrid_topic_generations_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_performance_signals" ADD CONSTRAINT "episode_performance_signals_eir_id_episode_intelligence_records_id_fk" FOREIGN KEY ("eir_id") REFERENCES "public"."episode_intelligence_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_voice_signals" ADD CONSTRAINT "editorial_voice_signals_season_id_khat_map_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."khat_map_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_voice_signals" ADD CONSTRAINT "editorial_voice_signals_candidate_id_guest_discovery_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."guest_discovery_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opl_active_category_idx" ON "podcast_platform_links" USING btree ("is_active","category");--> statement-breakpoint
CREATE INDEX "opl_sort_order_idx" ON "podcast_platform_links" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_perf_snap_eir_at" ON "performance_snapshots" USING btree ("eir_id","snapshot_at");--> statement-breakpoint
CREATE INDEX "idx_perf_snap_episode" ON "performance_snapshots" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "idx_studio_analysis_eir" ON "studio_analysis_records" USING btree ("eir_id");--> statement-breakpoint
CREATE INDEX "idx_studio_analysis_session" ON "studio_analysis_records" USING btree ("studio_session_id");--> statement-breakpoint
CREATE INDEX "idx_studio_analysis_eir_kind" ON "studio_analysis_records" USING btree ("eir_id","kind");--> statement-breakpoint
CREATE INDEX "idx_studio_analysis_session_kind" ON "studio_analysis_records" USING btree ("studio_session_id","kind");--> statement-breakpoint
CREATE INDEX "idx_studio_analysis_status" ON "studio_analysis_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discovery_runs_status" ON "discovery_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discovery_runs_season" ON "discovery_runs" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_disc_cand_run" ON "guest_discovery_candidates" USING btree ("discovery_run_id");--> statement-breakpoint
CREATE INDEX "idx_disc_cand_status" ON "guest_discovery_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_disc_cand_composite" ON "guest_discovery_candidates" USING btree ("composite_score");--> statement-breakpoint
CREATE INDEX "idx_disc_cand_target_episode" ON "guest_discovery_candidates" USING btree ("target_episode_candidate_id");--> statement-breakpoint
CREATE INDEX "idx_market_clusters_computed_at" ON "market_topic_clusters" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "idx_market_clusters_language" ON "market_topic_clusters" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_market_clusters_editorial_score" ON "market_topic_clusters" USING btree ("editorial_score");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_market_signals_source_external" ON "market_topic_signals" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "idx_market_signals_collected_at" ON "market_topic_signals" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "idx_market_signals_theme" ON "market_topic_signals" USING btree ("theme");--> statement-breakpoint
CREATE INDEX "idx_market_signals_language" ON "market_topic_signals" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_market_signals_review_status" ON "market_topic_signals" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_market_signals_signal_score" ON "market_topic_signals" USING btree ("signal_score");--> statement-breakpoint
CREATE INDEX "idx_market_signals_trusted_source" ON "market_topic_signals" USING btree ("trusted_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_taste_weights_dimension_key" ON "editorial_taste_weights" USING btree ("dimension","key");--> statement-breakpoint
CREATE INDEX "idx_taste_weights_last_reinforced" ON "editorial_taste_weights" USING btree ("last_reinforced_at");--> statement-breakpoint
CREATE INDEX "idx_signal_review_events_signal" ON "market_signal_review_events" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "idx_signal_review_events_created" ON "market_signal_review_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_signal_review_events_actor" ON "market_signal_review_events" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_trusted_sources_type_identifier" ON "market_trusted_sources" USING btree ("source_type","identifier");--> statement-breakpoint
CREATE INDEX "idx_trusted_sources_active" ON "market_trusted_sources" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_trusted_sources_language" ON "market_trusted_sources" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_trusted_sources_archived" ON "market_trusted_sources" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gal_application" ON "guest_application_links" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_gal_guest" ON "guest_application_links" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gcl_candidate" ON "guest_candidate_links" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_gcl_guest" ON "guest_candidate_links" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_gdl_guest" ON "guest_discovery_links" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_gdl_candidate" ON "guest_discovery_links" USING btree ("discovery_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_guest_identity_profile_guest" ON "guest_identity_profiles" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_hybrid_gen_season_id" ON "hybrid_topic_generations" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_hybrid_gen_language" ON "hybrid_topic_generations" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_hybrid_gen_status" ON "hybrid_topic_generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hybrid_gen_created_at" ON "hybrid_topic_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_original_topics_generated_at" ON "original_thinking_topics" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "idx_original_topics_lens" ON "original_thinking_topics" USING btree ("lens");--> statement-breakpoint
CREATE INDEX "idx_original_topics_language" ON "original_thinking_topics" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_original_topics_unconsumed" ON "original_thinking_topics" USING btree ("generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_episode_performance_signals_eir" ON "episode_performance_signals" USING btree ("eir_id");--> statement-breakpoint
CREATE INDEX "idx_episode_performance_signals_score" ON "episode_performance_signals" USING btree ("editorial_signal_score");--> statement-breakpoint
CREATE INDEX "idx_jve_created_at" ON "jsonb_validation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_jve_table_column_created" ON "jsonb_validation_events" USING btree ("table_name","column_name","created_at");--> statement-breakpoint
CREATE INDEX "idx_jve_raw_value_hash" ON "jsonb_validation_events" USING btree ("raw_value_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ai_runs_summary_dimensions" ON "ai_runs_summary" USING btree ("year_month","task_kind","provider","model_name","prompt_version");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_summary_year_month" ON "ai_runs_summary" USING btree ("year_month");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_summary_task_kind" ON "ai_runs_summary" USING btree ("task_kind");--> statement-breakpoint
CREATE INDEX "idx_arle_created_at" ON "ai_rate_limit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_arle_decision_created" ON "ai_rate_limit_events" USING btree ("decision","created_at");--> statement-breakpoint
CREATE INDEX "idx_arle_actor_created" ON "ai_rate_limit_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_arle_subject" ON "ai_rate_limit_events" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_asl_subject" ON "ai_subject_locks" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE INDEX "idx_asl_acquired_at" ON "ai_subject_locks" USING btree ("acquired_at");--> statement-breakpoint
CREATE INDEX "idx_eita_attempted_at" ON "eir_invalid_transition_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "idx_eita_eir_attempted" ON "eir_invalid_transition_attempts" USING btree ("eir_id","attempted_at");--> statement-breakpoint
CREATE INDEX "idx_eita_mode_attempted" ON "eir_invalid_transition_attempts" USING btree ("mode","attempted_at");--> statement-breakpoint
CREATE INDEX "idx_system_events_event_at" ON "system_events" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "idx_system_events_source_type_event_at" ON "system_events" USING btree ("source","event_type","event_at");--> statement-breakpoint
CREATE INDEX "idx_system_events_subject" ON "system_events" USING btree ("subject_kind","subject_id") WHERE subject_kind IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_system_events_severity_event_at" ON "system_events" USING btree ("severity","event_at") WHERE severity <> 'info';--> statement-breakpoint
CREATE INDEX "idx_evs_season" ON "editorial_voice_signals" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_evs_signal_type" ON "editorial_voice_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "idx_evs_created" ON "editorial_voice_signals" USING btree ("created_at");