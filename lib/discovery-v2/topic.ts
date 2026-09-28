/**
 * The discovery topic for ONE episode, built from its planning fields.
 *
 * Both episode launchers (the EIR «تشغيل اكتشاف لهذه الحلقة» CTA and the
 * season Phase-B action) used to join `topic_domain` verbatim, so the raw
 * enum key («money_career») landed in the run title and in the text the
 * propose prompt reads. The domain now goes in by its Arabic label from the
 * one label map (KHAT_TOPIC_DOMAIN_LABEL); "none" and unknown keys are left
 * out rather than leaking English.
 */

import { KHAT_TOPIC_DOMAIN_LABEL, type KhatMapTopicDomain } from "@/types/khat-map"

const TOPIC_SEPARATOR = " — "

/** Arabic label for a topic-domain key, or null for "none" / an unknown key. */
export function topicDomainLabel(domain: string | null | undefined): string | null {
  if (!domain || domain === "none") return null
  return KHAT_TOPIC_DOMAIN_LABEL[domain as KhatMapTopicDomain]?.label ?? null
}

export function buildEpisodeDiscoveryTopic(
  parts: {
    title?: string | null
    topicDomain?: string | null
    hook?: string | null
    whyMatters?: string | null
  },
  fallback: string,
): string {
  const segments = [parts.title, topicDomainLabel(parts.topicDomain), parts.hook, parts.whyMatters]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
  return (segments.join(TOPIC_SEPARATOR) || fallback).slice(0, 600)
}

/**
 * A stored run topic for display: a segment that is exactly a domain key
 * (runs created before buildEpisodeDiscoveryTopic) is shown by its label.
 */
export function displayDiscoveryTopic(topic: string): string {
  return topic
    .split(TOPIC_SEPARATOR)
    .map((seg) => {
      const key = seg.trim()
      return key in KHAT_TOPIC_DOMAIN_LABEL ? (topicDomainLabel(key) ?? seg) : seg
    })
    .filter((seg) => seg.trim() && seg.trim() !== "none")
    .join(TOPIC_SEPARATOR)
}
