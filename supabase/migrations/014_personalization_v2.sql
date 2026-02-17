-- Personalization V2: expanded event types + visitor profiles

-- 1. Drop old CHECK constraint and add expanded one
ALTER TABLE visitor_events DROP CONSTRAINT IF EXISTS visitor_events_event_type_check;

ALTER TABLE visitor_events ADD CONSTRAINT visitor_events_event_type_check
  CHECK (event_type IN (
    'episode_view', 'episode_watch',
    'watch_25', 'watch_50', 'watch_90',
    'quote_open', 'guest_open',
    'path_click', 'search_used', 'episode_saved',
    -- Legacy types kept for existing data
    'save_item', 'quote_view', 'search'
  ));

-- 2. Visitor profiles: cached interest vectors
CREATE TABLE IF NOT EXISTS visitor_profiles (
  visitor_id uuid PRIMARY KEY,
  interest_vector jsonb NOT NULL DEFAULT '{}',
  last_updated timestamptz DEFAULT now(),
  event_count_at_build int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vp_updated ON visitor_profiles(last_updated);

-- RLS: open for anonymous visitors
ALTER TABLE visitor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read visitor profiles"
  ON visitor_profiles FOR SELECT
  USING (true);

CREATE POLICY "Anyone can upsert visitor profiles"
  ON visitor_profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update visitor profiles"
  ON visitor_profiles FOR UPDATE
  USING (true);

-- 3. Batch events insert support: add index for dedup queries
CREATE INDEX IF NOT EXISTS idx_ve_dedup
  ON visitor_events(visitor_id, event_type, target_id, created_at DESC);
