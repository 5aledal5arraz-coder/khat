import { relations } from "drizzle-orm"
import { episodes, episodeTopics, timestamps, quotes, resources, episodeVersions } from "./episodes"
import { guests, guestApplications } from "./guests"
import { topics } from "./topics"
import {
  profiles, hibrArticles, hibrThoughts, hibrComments, hibrReplies,
  hibrLikes, hibrFollows, hibrBookmarks, hibrReactions, hibrReports, hibrDrafts,
} from "./community"
import {
  studioSessions, studioTranscripts, studioAiOutputs,
  studioChapters, studioClips, studioWebsitePackages, studioAnalyzers,
} from "./studio"

// --- Episode relations ---

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  guest: one(guests, { fields: [episodes.guest_id], references: [guests.id] }),
  episodeTopics: many(episodeTopics),
  timestamps: many(timestamps),
  quotes: many(quotes),
  resources: many(resources),
  versions: many(episodeVersions),
}))

export const episodeTopicsRelations = relations(episodeTopics, ({ one }) => ({
  episode: one(episodes, { fields: [episodeTopics.episode_id], references: [episodes.id] }),
  topic: one(topics, { fields: [episodeTopics.topic_id], references: [topics.id] }),
}))

export const timestampsRelations = relations(timestamps, ({ one }) => ({
  episode: one(episodes, { fields: [timestamps.episode_id], references: [episodes.id] }),
}))

export const quotesRelations = relations(quotes, ({ one }) => ({
  episode: one(episodes, { fields: [quotes.episode_id], references: [episodes.id] }),
  guest: one(guests, { fields: [quotes.guest_id], references: [guests.id] }),
}))

export const resourcesRelations = relations(resources, ({ one }) => ({
  episode: one(episodes, { fields: [resources.episode_id], references: [episodes.id] }),
}))

export const episodeVersionsRelations = relations(episodeVersions, ({ one }) => ({
  episode: one(episodes, { fields: [episodeVersions.episode_id], references: [episodes.id] }),
}))

// --- Guest relations ---

export const guestsRelations = relations(guests, ({ many }) => ({
  episodes: many(episodes),
  quotes: many(quotes),
}))

// --- Topic relations ---

export const topicsRelations = relations(topics, ({ many }) => ({
  episodeTopics: many(episodeTopics),
}))

// --- Profile / Community relations ---

export const profilesRelations = relations(profiles, ({ many }) => ({
  articles: many(hibrArticles),
  thoughts: many(hibrThoughts),
  comments: many(hibrComments),
  replies: many(hibrReplies),
  likes: many(hibrLikes),
  bookmarks: many(hibrBookmarks),
  drafts: many(hibrDrafts),
}))

export const hibrArticlesRelations = relations(hibrArticles, ({ one, many }) => ({
  author: one(profiles, { fields: [hibrArticles.user_id], references: [profiles.id] }),
  comments: many(hibrComments),
  reactions: many(hibrReactions),
  bookmarks: many(hibrBookmarks),
}))

export const hibrThoughtsRelations = relations(hibrThoughts, ({ one, many }) => ({
  author: one(profiles, { fields: [hibrThoughts.user_id], references: [profiles.id] }),
  replies: many(hibrReplies),
}))

export const hibrCommentsRelations = relations(hibrComments, ({ one }) => ({
  article: one(hibrArticles, { fields: [hibrComments.article_id], references: [hibrArticles.id] }),
  author: one(profiles, { fields: [hibrComments.user_id], references: [profiles.id] }),
}))

export const hibrRepliesRelations = relations(hibrReplies, ({ one }) => ({
  thought: one(hibrThoughts, { fields: [hibrReplies.thought_id], references: [hibrThoughts.id] }),
  author: one(profiles, { fields: [hibrReplies.user_id], references: [profiles.id] }),
}))

export const hibrLikesRelations = relations(hibrLikes, ({ one }) => ({
  user: one(profiles, { fields: [hibrLikes.user_id], references: [profiles.id] }),
}))

export const hibrFollowsRelations = relations(hibrFollows, ({ one }) => ({
  follower: one(profiles, { fields: [hibrFollows.follower_id], references: [profiles.id], relationName: "follower" }),
  following: one(profiles, { fields: [hibrFollows.following_id], references: [profiles.id], relationName: "following" }),
}))

export const hibrBookmarksRelations = relations(hibrBookmarks, ({ one }) => ({
  user: one(profiles, { fields: [hibrBookmarks.user_id], references: [profiles.id] }),
  article: one(hibrArticles, { fields: [hibrBookmarks.article_id], references: [hibrArticles.id] }),
}))

export const hibrReactionsRelations = relations(hibrReactions, ({ one }) => ({
  user: one(profiles, { fields: [hibrReactions.user_id], references: [profiles.id] }),
  article: one(hibrArticles, { fields: [hibrReactions.article_id], references: [hibrArticles.id] }),
}))

// --- Studio relations ---

export const studioSessionsRelations = relations(studioSessions, ({ many }) => ({
  transcripts: many(studioTranscripts),
  aiOutputs: many(studioAiOutputs),
  chapters: many(studioChapters),
  clips: many(studioClips),
  websitePackages: many(studioWebsitePackages),
  analyzers: many(studioAnalyzers),
}))

export const studioTranscriptsRelations = relations(studioTranscripts, ({ one }) => ({
  session: one(studioSessions, { fields: [studioTranscripts.session_id], references: [studioSessions.id] }),
}))

export const studioAiOutputsRelations = relations(studioAiOutputs, ({ one }) => ({
  session: one(studioSessions, { fields: [studioAiOutputs.session_id], references: [studioSessions.id] }),
}))

export const studioChaptersRelations = relations(studioChapters, ({ one }) => ({
  session: one(studioSessions, { fields: [studioChapters.session_id], references: [studioSessions.id] }),
}))

export const studioClipsRelations = relations(studioClips, ({ one }) => ({
  session: one(studioSessions, { fields: [studioClips.session_id], references: [studioSessions.id] }),
}))

export const studioWebsitePackagesRelations = relations(studioWebsitePackages, ({ one }) => ({
  session: one(studioSessions, { fields: [studioWebsitePackages.session_id], references: [studioSessions.id] }),
}))

export const studioAnalyzersRelations = relations(studioAnalyzers, ({ one }) => ({
  session: one(studioSessions, { fields: [studioAnalyzers.session_id], references: [studioSessions.id] }),
}))
