import { pgTable, text, integer, boolean, timestamp, uuid, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // Firebase UID
  display_name: text("display_name"),
  username: text("username").unique(),
  avatar_url: text("avatar_url"),
  bio: text("bio"),
  email: text("email"),
  is_admin: boolean("is_admin").default(false),
  is_banned: boolean("is_banned").default(false),
  ban_reason: text("ban_reason"),
  articles_count: integer("articles_count").default(0),
  followers_count: integer("followers_count").default(0),
  role: text("role").default("user"),
  notify_comments: boolean("notify_comments").default(true),
  notify_replies: boolean("notify_replies").default(true),
  notify_likes: boolean("notify_likes").default(true),
  notify_follows: boolean("notify_follows").default(true),
  notification_unsubscribe_token: text("notification_unsubscribe_token"),
  must_change_password: boolean("must_change_password").default(false),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const hibrArticles = pgTable("hibr_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  cover_image: text("cover_image"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  episode_id: text("episode_id"),
  episode_title: text("episode_title"),
  episode_slug: text("episode_slug"),
  read_time_minutes: integer("read_time_minutes").default(1),
  likes_count: integer("likes_count").default(0),
  comments_count: integer("comments_count").default(0),
  status: text("status").default("published"),
  moderation_status: text("moderation_status").default("pending"),
  moderation_reason: text("moderation_reason"),
  featured: boolean("featured").default(false),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const hibrThoughts = pgTable("hibr_thoughts", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  likes_count: integer("likes_count").default(0),
  replies_count: integer("replies_count").default(0),
  moderation_status: text("moderation_status").default("pending"),
  moderation_reason: text("moderation_reason"),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const hibrComments = pgTable("hibr_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  article_id: uuid("article_id").notNull().references(() => hibrArticles.id, { onDelete: "cascade" }),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  likes_count: integer("likes_count").default(0),
  moderation_status: text("moderation_status").default("approved"),
  moderation_reason: text("moderation_reason"),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const hibrReplies = pgTable("hibr_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  thought_id: uuid("thought_id").notNull().references(() => hibrThoughts.id, { onDelete: "cascade" }),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  likes_count: integer("likes_count").default(0),
  moderation_status: text("moderation_status").default("approved"),
  moderation_reason: text("moderation_reason"),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const hibrDrafts = pgTable("hibr_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").default(""),
  content: text("content").default(""),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  episode_id: text("episode_id"),
  episode_slug: text("episode_slug"),
  episode_title: text("episode_title"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

export const hibrLikes = pgTable("hibr_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  target_type: text("target_type").notNull(),
  target_id: uuid("target_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.user_id, t.target_type, t.target_id),
])

export const hibrFollows = pgTable("hibr_follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  follower_id: text("follower_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  following_id: text("following_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.follower_id, t.following_id),
  check("no_self_follow", sql`${t.follower_id} != ${t.following_id}`),
])

export const hibrBookmarks = pgTable("hibr_bookmarks", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  article_id: uuid("article_id").notNull().references(() => hibrArticles.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.user_id, t.article_id),
])

export const hibrReactions = pgTable("hibr_reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  article_id: uuid("article_id").notNull().references(() => hibrArticles.id, { onDelete: "cascade" }),
  reaction_type: text("reaction_type").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.user_id, t.article_id, t.reaction_type),
])

export const hibrReports = pgTable("hibr_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporter_id: text("reporter_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  target_type: text("target_type").notNull(),
  target_id: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").default("pending"),
  reviewed_by: text("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const hibrModerationLog = pgTable("hibr_moderation_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  moderator_id: text("moderator_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  target_type: text("target_type").notNull(),
  target_id: uuid("target_id").notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})
