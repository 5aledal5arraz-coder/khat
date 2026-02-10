-- Home Page Content Tables
-- Quotes, Emotional Paths, and Daily Reflections for the redesigned home page

-- 1. Home Quotes
CREATE TABLE IF NOT EXISTS home_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  attribution TEXT NOT NULL,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  episode_slug TEXT,
  episode_title TEXT,
  theme TEXT,
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_quotes_status ON home_quotes(status);
CREATE INDEX idx_home_quotes_scheduled_date ON home_quotes(scheduled_date);

-- 2. Emotional Paths
CREATE TABLE IF NOT EXISTS emotional_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug IN ('understanding-people', 'motivation-work', 'faith-meaning', 'self-awareness')),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Heart',
  color TEXT NOT NULL DEFAULT '#6366f1',
  episode_ids UUID[] DEFAULT '{}',
  quote_ids UUID[] DEFAULT '{}',
  "order" INTEGER NOT NULL DEFAULT 0
);

-- Seed default paths
INSERT INTO emotional_paths (slug, title, subtitle, icon, color, "order") VALUES
  ('understanding-people', 'فهم الناس', 'حلقات عن العلاقات والتواصل والتعاطف', 'Users', '#6366f1', 1),
  ('motivation-work', 'الدافع والعمل', 'حلقات عن الطموح والإنجاز والمهنة', 'Rocket', '#f59e0b', 2),
  ('faith-meaning', 'الإيمان والمعنى', 'حلقات عن الروحانيات والهدف والقيم', 'Heart', '#10b981', 3),
  ('self-awareness', 'وعي الذات', 'حلقات عن النمو الشخصي والتأمل الذاتي', 'Eye', '#8b5cf6', 4)
ON CONFLICT (slug) DO NOTHING;

-- 3. Daily Reflections
CREATE TABLE IF NOT EXISTS daily_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  short_quote TEXT NOT NULL,
  reflection TEXT NOT NULL,
  thinking_question TEXT NOT NULL,
  attribution TEXT,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  episode_slug TEXT,
  episode_title TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_reflections_date ON daily_reflections(date);
CREATE INDEX idx_daily_reflections_status ON daily_reflections(status);

-- RLS Policies

ALTER TABLE home_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotional_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reflections ENABLE ROW LEVEL SECURITY;

-- Public read for published content
CREATE POLICY "Public can read published home quotes"
  ON home_quotes FOR SELECT
  USING (status = 'published');

CREATE POLICY "Public can read emotional paths"
  ON emotional_paths FOR SELECT
  USING (true);

CREATE POLICY "Public can read published daily reflections"
  ON daily_reflections FOR SELECT
  USING (status = 'published');

-- Admin full access (service role bypasses RLS, but add explicit policies for admin users)
CREATE POLICY "Admins can manage home quotes"
  ON home_quotes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can manage emotional paths"
  ON emotional_paths FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can manage daily reflections"
  ON daily_reflections FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_home_quotes_updated_at
  BEFORE UPDATE ON home_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_reflections_updated_at
  BEFORE UPDATE ON daily_reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
