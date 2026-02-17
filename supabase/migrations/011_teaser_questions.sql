CREATE TABLE IF NOT EXISTS teaser_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teaser_id text NOT NULL,
  display_name text,
  question_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_teaser_questions_teaser ON teaser_questions(teaser_id);
CREATE INDEX idx_teaser_questions_status ON teaser_questions(teaser_id, status);
CREATE INDEX idx_teaser_questions_created ON teaser_questions(created_at DESC);
