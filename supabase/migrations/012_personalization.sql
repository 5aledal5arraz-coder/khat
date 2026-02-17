-- Personalization: anonymous visitor behavioral events
CREATE TABLE visitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'episode_view', 'episode_watch', 'save_item',
    'path_click', 'quote_view', 'search'
  )),
  target_id text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ve_visitor ON visitor_events(visitor_id, created_at DESC);
CREATE INDEX idx_ve_type ON visitor_events(event_type);

-- RLS: open insert/select for anonymous visitors (no auth required)
ALTER TABLE visitor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert visitor events"
  ON visitor_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read visitor events"
  ON visitor_events FOR SELECT
  USING (true);

CREATE POLICY "Anyone can delete own visitor events"
  ON visitor_events FOR DELETE
  USING (true);
