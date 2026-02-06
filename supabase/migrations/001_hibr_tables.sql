-- ============================================================
-- Hibr (حبر) Tables Migration
-- Adds all tables needed for the community writing platform
-- ============================================================

-- Extend profiles table with admin/ban/counter fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS articles_count integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0;

-- ============================================================
-- Articles
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL,
  cover_image text,
  tags text[] DEFAULT '{}',
  episode_id text,
  episode_title text,
  episode_slug text,
  read_time_minutes integer DEFAULT 1,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'auto_flagged', 'rejected', 'hidden')),
  featured boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_articles_user ON hibr_articles(user_id);
CREATE INDEX idx_hibr_articles_status ON hibr_articles(status, moderation_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_hibr_articles_created ON hibr_articles(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_hibr_articles_featured ON hibr_articles(featured) WHERE deleted_at IS NULL AND status = 'published';

-- ============================================================
-- Thoughts (280-char micro-posts)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_thoughts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 280),
  tags text[] DEFAULT '{}',
  likes_count integer DEFAULT 0,
  replies_count integer DEFAULT 0,
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'auto_flagged', 'rejected', 'hidden')),
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_thoughts_user ON hibr_thoughts(user_id);
CREATE INDEX idx_hibr_thoughts_created ON hibr_thoughts(created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================
-- Comments (on articles, max 500 chars)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES hibr_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 500),
  likes_count integer DEFAULT 0,
  moderation_status text NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending', 'approved', 'auto_flagged', 'rejected', 'hidden')),
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_comments_article ON hibr_comments(article_id) WHERE deleted_at IS NULL;

-- ============================================================
-- Replies (on thoughts, max 280 chars)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thought_id uuid NOT NULL REFERENCES hibr_thoughts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 280),
  likes_count integer DEFAULT 0,
  moderation_status text NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending', 'approved', 'auto_flagged', 'rejected', 'hidden')),
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_replies_thought ON hibr_replies(thought_id) WHERE deleted_at IS NULL;

-- ============================================================
-- Drafts (server-side, replaces localStorage)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT '',
  content text DEFAULT '',
  tags text[] DEFAULT '{}',
  episode_id text,
  episode_slug text,
  episode_title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_drafts_user ON hibr_drafts(user_id);

-- ============================================================
-- Likes (polymorphic: article, thought, comment, reply)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('article', 'thought', 'comment', 'reply')),
  target_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX idx_hibr_likes_target ON hibr_likes(target_type, target_id);

-- ============================================================
-- Follows
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX idx_hibr_follows_follower ON hibr_follows(follower_id);
CREATE INDEX idx_hibr_follows_following ON hibr_follows(following_id);

-- ============================================================
-- Bookmarks
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES hibr_articles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX idx_hibr_bookmarks_user ON hibr_bookmarks(user_id);

-- ============================================================
-- Reactions (emoji: clap, fire, bulb, heart)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES hibr_articles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('clap', 'fire', 'bulb', 'heart')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, article_id, reaction_type)
);

CREATE INDEX idx_hibr_reactions_article ON hibr_reactions(article_id);

-- ============================================================
-- Reports
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('article', 'thought', 'comment', 'reply')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'misinformation', 'other')),
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_reports_status ON hibr_reports(status) WHERE status = 'pending';

-- ============================================================
-- Moderation log (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS hibr_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'hide', 'unhide', 'ban', 'unban', 'delete')),
  target_type text NOT NULL CHECK (target_type IN ('article', 'thought', 'comment', 'reply', 'user', 'report')),
  target_id uuid NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hibr_moderation_log_created ON hibr_moderation_log(created_at DESC);

-- ============================================================
-- Rate limits
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rate_limits_user_action ON rate_limits(user_id, action, created_at);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE hibr_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is admin
CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = uid), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- Articles ----
CREATE POLICY "articles_select_public" ON hibr_articles
  FOR SELECT USING (
    deleted_at IS NULL
    AND status = 'published'
    AND moderation_status IN ('approved', 'pending')
  );

CREATE POLICY "articles_select_own" ON hibr_articles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "articles_select_admin" ON hibr_articles
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "articles_insert_own" ON hibr_articles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "articles_update_own" ON hibr_articles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "articles_update_admin" ON hibr_articles
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "articles_delete_own" ON hibr_articles
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Thoughts ----
CREATE POLICY "thoughts_select_public" ON hibr_thoughts
  FOR SELECT USING (
    deleted_at IS NULL
    AND moderation_status IN ('approved', 'pending')
  );

CREATE POLICY "thoughts_select_own" ON hibr_thoughts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "thoughts_select_admin" ON hibr_thoughts
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "thoughts_insert_own" ON hibr_thoughts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "thoughts_update_own" ON hibr_thoughts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "thoughts_update_admin" ON hibr_thoughts
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "thoughts_delete_own" ON hibr_thoughts
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Comments ----
CREATE POLICY "comments_select_public" ON hibr_comments
  FOR SELECT USING (
    deleted_at IS NULL
    AND moderation_status IN ('approved', 'pending')
  );

CREATE POLICY "comments_insert_own" ON hibr_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_update_admin" ON hibr_comments
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "comments_delete_own" ON hibr_comments
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Replies ----
CREATE POLICY "replies_select_public" ON hibr_replies
  FOR SELECT USING (
    deleted_at IS NULL
    AND moderation_status IN ('approved', 'pending')
  );

CREATE POLICY "replies_insert_own" ON hibr_replies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "replies_update_admin" ON hibr_replies
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "replies_delete_own" ON hibr_replies
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Drafts ----
CREATE POLICY "drafts_all_own" ON hibr_drafts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---- Likes ----
CREATE POLICY "likes_select_all" ON hibr_likes
  FOR SELECT USING (true);

CREATE POLICY "likes_insert_own" ON hibr_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "likes_delete_own" ON hibr_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Follows ----
CREATE POLICY "follows_select_all" ON hibr_follows
  FOR SELECT USING (true);

CREATE POLICY "follows_insert_own" ON hibr_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own" ON hibr_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- ---- Bookmarks ----
CREATE POLICY "bookmarks_select_own" ON hibr_bookmarks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_insert_own" ON hibr_bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_delete_own" ON hibr_bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Reactions ----
CREATE POLICY "reactions_select_all" ON hibr_reactions
  FOR SELECT USING (true);

CREATE POLICY "reactions_insert_own" ON hibr_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete_own" ON hibr_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Reports ----
CREATE POLICY "reports_insert_own" ON hibr_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "reports_select_admin" ON hibr_reports
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "reports_update_admin" ON hibr_reports
  FOR UPDATE USING (is_admin(auth.uid()));

-- ---- Moderation log ----
CREATE POLICY "modlog_insert_admin" ON hibr_moderation_log
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "modlog_select_admin" ON hibr_moderation_log
  FOR SELECT USING (is_admin(auth.uid()));

-- ---- Rate limits ----
CREATE POLICY "rate_limits_insert_own" ON rate_limits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rate_limits_select_own" ON rate_limits
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile on signup trigger
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hibr_articles_updated_at
  BEFORE UPDATE ON hibr_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_hibr_drafts_updated_at
  BEFORE UPDATE ON hibr_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
