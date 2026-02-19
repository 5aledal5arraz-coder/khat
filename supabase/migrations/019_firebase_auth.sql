-- ============================================================
-- Firebase Auth Migration
-- Switch from Supabase Auth (uuid) to Firebase Auth (text UIDs)
-- No real users exist, safe to drop and recreate constraints
-- ============================================================

-- 1. Drop the Supabase auto-create-profile trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 2. Drop all RLS policies (auth enforced at application layer now)
-- Articles
DROP POLICY IF EXISTS "articles_select_public" ON hibr_articles;
DROP POLICY IF EXISTS "articles_select_own" ON hibr_articles;
DROP POLICY IF EXISTS "articles_select_admin" ON hibr_articles;
DROP POLICY IF EXISTS "articles_insert_own" ON hibr_articles;
DROP POLICY IF EXISTS "articles_update_own" ON hibr_articles;
DROP POLICY IF EXISTS "articles_update_admin" ON hibr_articles;
DROP POLICY IF EXISTS "articles_delete_own" ON hibr_articles;
-- Thoughts
DROP POLICY IF EXISTS "thoughts_select_public" ON hibr_thoughts;
DROP POLICY IF EXISTS "thoughts_select_own" ON hibr_thoughts;
DROP POLICY IF EXISTS "thoughts_select_admin" ON hibr_thoughts;
DROP POLICY IF EXISTS "thoughts_insert_own" ON hibr_thoughts;
DROP POLICY IF EXISTS "thoughts_update_own" ON hibr_thoughts;
DROP POLICY IF EXISTS "thoughts_update_admin" ON hibr_thoughts;
DROP POLICY IF EXISTS "thoughts_delete_own" ON hibr_thoughts;
-- Comments
DROP POLICY IF EXISTS "comments_select_public" ON hibr_comments;
DROP POLICY IF EXISTS "comments_insert_own" ON hibr_comments;
DROP POLICY IF EXISTS "comments_update_admin" ON hibr_comments;
DROP POLICY IF EXISTS "comments_delete_own" ON hibr_comments;
-- Replies
DROP POLICY IF EXISTS "replies_select_public" ON hibr_replies;
DROP POLICY IF EXISTS "replies_insert_own" ON hibr_replies;
DROP POLICY IF EXISTS "replies_update_admin" ON hibr_replies;
DROP POLICY IF EXISTS "replies_delete_own" ON hibr_replies;
-- Drafts
DROP POLICY IF EXISTS "drafts_all_own" ON hibr_drafts;
-- Likes
DROP POLICY IF EXISTS "likes_select_all" ON hibr_likes;
DROP POLICY IF EXISTS "likes_insert_own" ON hibr_likes;
DROP POLICY IF EXISTS "likes_delete_own" ON hibr_likes;
-- Follows
DROP POLICY IF EXISTS "follows_select_all" ON hibr_follows;
DROP POLICY IF EXISTS "follows_insert_own" ON hibr_follows;
DROP POLICY IF EXISTS "follows_delete_own" ON hibr_follows;
-- Bookmarks
DROP POLICY IF EXISTS "bookmarks_select_own" ON hibr_bookmarks;
DROP POLICY IF EXISTS "bookmarks_insert_own" ON hibr_bookmarks;
DROP POLICY IF EXISTS "bookmarks_delete_own" ON hibr_bookmarks;
-- Reactions
DROP POLICY IF EXISTS "reactions_select_all" ON hibr_reactions;
DROP POLICY IF EXISTS "reactions_insert_own" ON hibr_reactions;
DROP POLICY IF EXISTS "reactions_delete_own" ON hibr_reactions;
-- Reports
DROP POLICY IF EXISTS "reports_insert_own" ON hibr_reports;
DROP POLICY IF EXISTS "reports_select_admin" ON hibr_reports;
DROP POLICY IF EXISTS "reports_update_admin" ON hibr_reports;
-- Moderation log
DROP POLICY IF EXISTS "modlog_insert_admin" ON hibr_moderation_log;
DROP POLICY IF EXISTS "modlog_select_admin" ON hibr_moderation_log;
-- Rate limits
DROP POLICY IF EXISTS "rate_limits_insert_own" ON rate_limits;
DROP POLICY IF EXISTS "rate_limits_select_own" ON rate_limits;

-- 3. Disable RLS on all Hibr tables (auth enforced at application layer)
ALTER TABLE hibr_articles DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_thoughts DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_replies DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_drafts DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_likes DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_follows DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_bookmarks DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE hibr_moderation_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;

-- 4. Drop the is_admin helper function (used by RLS policies)
DROP FUNCTION IF EXISTS is_admin(uuid);

-- 5. Drop all foreign key constraints referencing auth.users
ALTER TABLE hibr_articles DROP CONSTRAINT IF EXISTS hibr_articles_user_id_fkey;
ALTER TABLE hibr_thoughts DROP CONSTRAINT IF EXISTS hibr_thoughts_user_id_fkey;
ALTER TABLE hibr_comments DROP CONSTRAINT IF EXISTS hibr_comments_user_id_fkey;
ALTER TABLE hibr_replies DROP CONSTRAINT IF EXISTS hibr_replies_user_id_fkey;
ALTER TABLE hibr_drafts DROP CONSTRAINT IF EXISTS hibr_drafts_user_id_fkey;
ALTER TABLE hibr_likes DROP CONSTRAINT IF EXISTS hibr_likes_user_id_fkey;
ALTER TABLE hibr_follows DROP CONSTRAINT IF EXISTS hibr_follows_follower_id_fkey;
ALTER TABLE hibr_follows DROP CONSTRAINT IF EXISTS hibr_follows_following_id_fkey;
ALTER TABLE hibr_bookmarks DROP CONSTRAINT IF EXISTS hibr_bookmarks_user_id_fkey;
ALTER TABLE hibr_reactions DROP CONSTRAINT IF EXISTS hibr_reactions_user_id_fkey;
ALTER TABLE hibr_reports DROP CONSTRAINT IF EXISTS hibr_reports_reporter_id_fkey;
ALTER TABLE hibr_reports DROP CONSTRAINT IF EXISTS hibr_reports_reviewed_by_fkey;
ALTER TABLE hibr_moderation_log DROP CONSTRAINT IF EXISTS hibr_moderation_log_moderator_id_fkey;
ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_user_id_fkey;

-- 6. Change profiles.id from uuid to text (Firebase UIDs are 28-char strings)
ALTER TABLE profiles ALTER COLUMN id TYPE text USING id::text;

-- 7. Change all user_id columns from uuid to text
ALTER TABLE hibr_articles ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_thoughts ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_comments ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_replies ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_drafts ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_likes ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_follows ALTER COLUMN follower_id TYPE text USING follower_id::text;
ALTER TABLE hibr_follows ALTER COLUMN following_id TYPE text USING following_id::text;
ALTER TABLE hibr_bookmarks ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_reactions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE hibr_reports ALTER COLUMN reporter_id TYPE text USING reporter_id::text;
ALTER TABLE hibr_reports ALTER COLUMN reviewed_by TYPE text USING reviewed_by::text;
ALTER TABLE hibr_moderation_log ALTER COLUMN moderator_id TYPE text USING moderator_id::text;
ALTER TABLE rate_limits ALTER COLUMN user_id TYPE text USING user_id::text;

-- 8. Add foreign key constraints referencing profiles(id) instead of auth.users(id)
ALTER TABLE hibr_articles ADD CONSTRAINT hibr_articles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_thoughts ADD CONSTRAINT hibr_thoughts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_comments ADD CONSTRAINT hibr_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_replies ADD CONSTRAINT hibr_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_drafts ADD CONSTRAINT hibr_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_likes ADD CONSTRAINT hibr_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_follows ADD CONSTRAINT hibr_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_follows ADD CONSTRAINT hibr_follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_bookmarks ADD CONSTRAINT hibr_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_reactions ADD CONSTRAINT hibr_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_reports ADD CONSTRAINT hibr_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE hibr_reports ADD CONSTRAINT hibr_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE hibr_moderation_log ADD CONSTRAINT hibr_moderation_log_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
