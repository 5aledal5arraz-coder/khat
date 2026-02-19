-- 020: Email system - notification prefs, newsletter status, send logs
-- Depends on: 016_core_content_tables.sql (newsletter_subscribers, profiles)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add email + notification preferences to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS notify_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_replies BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_likes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_follows BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_unsubscribe_token TEXT;

-- Generate unsubscribe tokens for existing profiles
UPDATE profiles
SET notification_unsubscribe_token = encode(gen_random_bytes(16), 'hex')
WHERE notification_unsubscribe_token IS NULL;

-- Index for unsubscribe lookups
CREATE INDEX IF NOT EXISTS idx_profiles_unsub_token
  ON profiles(notification_unsubscribe_token);

-- Add status + unsubscribe to newsletter_subscribers
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Generate unsubscribe tokens for existing subscribers
UPDATE newsletter_subscribers
SET unsubscribe_token = encode(gen_random_bytes(16), 'hex')
WHERE unsubscribe_token IS NULL;

-- Index for newsletter unsubscribe lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_unsub_token
  ON newsletter_subscribers(unsubscribe_token);

-- Newsletter sends log (admin-composed newsletters)
CREATE TABLE IF NOT EXISTS newsletter_sends (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email notifications dedup log
CREATE TABLE IF NOT EXISTS email_notifications_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  notification_type TEXT NOT NULL,
  trigger_user_id UUID NOT NULL REFERENCES profiles(id),
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicate notifications
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_notif_dedup
  ON email_notifications_log(recipient_id, notification_type, trigger_user_id, target_id);
