import { relations } from "drizzle-orm"
import { episodes, timestamps, quotes, resources, episodeVersions, episodeCategories } from "./episodes"
import { guests } from "./guests"
import { studioSessions } from "./studio"
import { newsletterSubscribers } from "./system"
import { newsletterCampaigns, newsletterDeliveries, newsletterLinks, newsletterClicks } from "./newsletter"
import { guestPrepForms } from "./guest-prep"
import { guestApplications } from "./guests"

// --- Episode relations ---

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  guest: one(guests, { fields: [episodes.guest_id], references: [guests.id] }),
  category: one(episodeCategories, { fields: [episodes.category_id], references: [episodeCategories.id] }),
  timestamps: many(timestamps),
  quotes: many(quotes),
  resources: many(resources),
  versions: many(episodeVersions),
}))

export const episodeCategoriesRelations = relations(episodeCategories, ({ many }) => ({
  episodes: many(episodes),
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

// Studio relations: legacy studio_* tables were dropped in Phase 5.
// Output rows now live in studio_analysis_records (queryable via the
// repo in lib/studio/analysis-records.ts), not via Drizzle relations.

// --- Newsletter relations ---

export const newsletterCampaignsRelations = relations(newsletterCampaigns, ({ many }) => ({
  deliveries: many(newsletterDeliveries),
  links: many(newsletterLinks),
}))

export const newsletterDeliveriesRelations = relations(newsletterDeliveries, ({ one, many }) => ({
  campaign: one(newsletterCampaigns, { fields: [newsletterDeliveries.campaign_id], references: [newsletterCampaigns.id] }),
  subscriber: one(newsletterSubscribers, { fields: [newsletterDeliveries.subscriber_id], references: [newsletterSubscribers.id] }),
  clicks: many(newsletterClicks),
}))

export const newsletterLinksRelations = relations(newsletterLinks, ({ one, many }) => ({
  campaign: one(newsletterCampaigns, { fields: [newsletterLinks.campaign_id], references: [newsletterCampaigns.id] }),
  clicks: many(newsletterClicks),
}))

export const newsletterClicksRelations = relations(newsletterClicks, ({ one }) => ({
  link: one(newsletterLinks, { fields: [newsletterClicks.link_id], references: [newsletterLinks.id] }),
  delivery: one(newsletterDeliveries, { fields: [newsletterClicks.delivery_id], references: [newsletterDeliveries.id] }),
}))

// --- Guest Prep relations ---

export const guestApplicationsRelations = relations(guestApplications, ({ one }) => ({
  prepForm: one(guestPrepForms, { fields: [guestApplications.id], references: [guestPrepForms.application_id] }),
}))

export const guestPrepFormsRelations = relations(guestPrepForms, ({ one }) => ({
  application: one(guestApplications, { fields: [guestPrepForms.application_id], references: [guestApplications.id] }),
}))
