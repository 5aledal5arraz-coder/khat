/**
 * Topic-engine switches (config/topic-engine.json via the config store).
 *
 *   hybrid_performance_hint — render the worked-report («drew more viewers»)
 *     into the hybrid prompt. DEFAULT OFF: Khaled's strategy is a reference
 *     archive judged by «بعد خمس سنين، أحد بيرجع للحلقة ويستفيد؟», not views.
 *     The code path exists so the decision is one switch, not a code change.
 *
 * A missing or unreadable file means the defaults — never an error.
 */

import { createConfigStore } from "@/lib/config-store"

export interface TopicEngineSettings {
  hybrid_performance_hint: boolean
}

export const TOPIC_ENGINE_DEFAULTS: TopicEngineSettings = {
  hybrid_performance_hint: false,
}

const store = createConfigStore<Partial<TopicEngineSettings>>(
  "topic-engine.json",
  TOPIC_ENGINE_DEFAULTS,
)

export async function getTopicEngineSettings(): Promise<TopicEngineSettings> {
  try {
    const raw = await store.read()
    return {
      hybrid_performance_hint: raw?.hybrid_performance_hint === true,
    }
  } catch {
    return TOPIC_ENGINE_DEFAULTS
  }
}
