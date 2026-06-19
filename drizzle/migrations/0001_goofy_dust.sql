ALTER TABLE "newsletter_deliveries" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD COLUMN "bounce_type" text;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD COLUMN "complained_at" timestamp with time zone;