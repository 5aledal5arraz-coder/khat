# Season Generation — How Khat Map Plans a Season

> How the admin "season wizard" generates episode topics, what the AI explores,
> and how candidates are scored and selected. Source of truth: `lib/khat-map/v2/`.

---

## Overview — two phases

Season planning runs in two phases, driven by the season's `wizard_stage`:

- **Phase A — topic generation.** The engine proposes **topics only** (`"guest": null`).
  The operator accepts/rejects in small batches until the season's episode list is full.
  This is the `generateBatch` loop in `lib/khat-map/v2/batch-engine.ts`.
- **Phase B — guest discovery.** Once topics are locked, each accepted topic is handed
  to discovery-v2 to find real guests. (Separate engine — not covered here.)

The phase is derived from the stage in `batch-engine.ts`:

```
phase = season.wizard_stage === "topics" ? "topics" : "guests"
```

---

## The Phase A loop, step by step

It is **not** "generate a whole season in one shot." The wizard calls `generateBatch`
repeatedly — **4 cards per round by default** (`DEFAULT_BATCH_SIZE`) — and every round
learns from the prior accept/reject decisions.

```
   ┌───────────────────────────────────────────────────────────────┐
   │                                                               (loop)
   ▼                                                                 │
1 · Load season state        accepted · rejected · taste · performance
        │                                                            │
        ▼                                                            │
2 · Generate idea pool  (LLM)  editorial board · ~8–10 topics         │
        │                                                            │
        ▼                                                            │
3 · Embed + memory filter      block repeats, cross-season           │
        │                                                            │
        ▼                                                            │
4 · Editorial-controls filter  drop banned · dedupe chosen           │
        │                                                            │
        ▼                                                            │
5 · Score — Regional Audience Fit  (LLM self-scores 9 factors)        │
        │                                                            │
        ▼                                                            │
6 · Select — potential-first   RAF wins · category cap ≤ 22%         │
        │                                                            │
        ▼                                                            │
7 · Persist → operator review  accept / reject each card ────────────┘
        │
        ▼
8 · Lock topics → Phase B      per-episode guest discovery
```

### 1. Load season state
Pulls everything that conditions this round:
- accepted titles + **per-category counts** (the balance axis),
- rejected titles + reason categories (the "negative memory"),
- the admin's learned **taste profile**,
- cross-season **domain performance** (aggregated from published + synced episodes).

### 2. Generate the idea pool (the only creative step)
One LLM call asks the "editorial board" for a diverse pool (~8–10) of high-potential
ideas, each **self-scored**. Prompt built in `lib/khat-map/v2/prompts-audience.ts`.
Capped to one call (`AUDIENCE_POOL_CAP = 10`) so generation stays fast.

### 3. Embed + memory filter
Every candidate is vector-embedded and cosine-compared against negative memory:
- **hard-block ≥ 0.82** (dropped),
- soft-avoid ≥ 0.75 (penalised).

Stops the season repeating itself, within and across seasons.

### 4. Editorial-controls filter
Drops cards that violate the admin's pre-generation knobs (disabled categories,
banned topics/guests, guest gender/geo filters) and **de-dupes** against
already-chosen titles. `lib/khat-map/v2/editorial-filter.ts`.

### 5. Score — Regional Audience Fit (RAF)
The heart. Each idea's **nine** self-scored factors collapse into one `[0, 10]`
composite. `lib/khat-map/v2/regional-fit.ts`.

### 6. Select — potential-first
Highest RAF wins. Diversity is only a **constraint**, never the driver:
- a small MMR-style penalty breaks near-ties toward breadth,
- a hard cap stops any single category exceeding **22% of the season**
  (`MAX_CATEGORY_SHARE = 0.22`).

`lib/khat-map/v2/select-by-potential.ts`, `lib/khat-map/v2/diversity.ts`.

### 7. Persist → operator
Stores the picks; the operator accepts/rejects each card. Decisions feed step 1
in the next round (the loop).

### 8. Lock → Phase B
When the season is full, topics lock and guest discovery begins.

> **Key design choice:** in the audience-first path, ranking is **purely RAF** — no
> taste or performance multiplier on the score. Taste only breaks near-ties; category
> balance only caps domination. A genuinely stronger topic always beats a weaker one
> from a fresher category. (The legacy path *did* multiply by taste + performance; the
> redesign deliberately removed that from the score.)

---

## What the AI explores — the 15 domains

The AI is told to range across a deliberate **15-category space**
(`lib/khat-map/v2/categories.ts`). They exist *because* the old taxonomy skewed
everything toward psychology/philosophy — these 15 are the editor's intended breadth.

| Category id | Arabic | Scope |
|---|---|---|
| `real_world` | قضايا واقعية وأحداث راهنة | what people are living now — events, shifts, questions of the hour (with depth, not trend froth) |
| `history` | تاريخ | historical events & fresh readings — Arab, Gulf, or global |
| `culture` | ثقافة وفنون | literature, film, music, art, sport, cultural phenomena |
| `psychology` | علم النفس | the mind & behaviour — scientifically, not platitudes |
| `science` | علوم | physics, biology, space, medicine — told as story for the non-specialist |
| `self_development` | تطوير الذات | habits, productivity, discipline — practical, not motivational clichés |
| `business` | أعمال وريادة | building ventures, leadership, success/failure, regional entrepreneurship |
| `personal_finance` | المال الشخصي | saving, investing, debt — financial literacy for the ordinary person |
| `social_issues` | قضايا اجتماعية | family, identity, structural pressures shaping society |
| `technology` | تقنية | AI, the internet, tools, tech's effect on daily life |
| `health` | صحة | body, nutrition, sleep, fitness, mental health — reliable & actionable |
| `future` | مستقبل واتجاهات | where tech/society/work are heading — grounded foresight |
| `human_stories` | قصص إنسانية | moving individual journeys — rise, fall, survival, transformation |
| `controversial` | نقاشات جدلية | divisive questions worth a mature debate — bold but responsible |
| `lifestyle` | أسلوب حياة | daily relationships, social habits, consumption, lifestyle choices |

Categories are a **soft** steer in the prompt (the model is nudged away from
already-saturated ones via `over_represented_categories`) and a **hard** cap after
ranking — never the generation driver.

---

## What it explores *within* each topic — the angles

For every idea, the board fleshes out the actual editorial angles
(output contract in `prompts-audience.ts`):

- `main_axes` — 2–4 Arabic angles the episode could take
- `suggested_questions` — 3–5 Arabic questions
- `hook` — the opening tension
- `debate_axis` — the core argument people would have
- `viral_angle` — why it spreads
- `regional_note` — why it lands in KSA / Kuwait / Iraq / GCC
- plus `why_now`, `why_matters`, `goal`, `description`
- and labels: `episode_type`, `risk_level`, `effort_level`, `sponsor_appeal`

---

## How the board is told to *think*

The system prompt frames the model as a **GCC editorial board** — Saudi Arabia,
Kuwait, Iraq, the wider Gulf — judging every idea "by what THIS audience wants to
watch and talk about, not what a Western or pan-Arab show would pick."

It ranks in a fixed priority order:

1. **Curiosity + discussion** — what people most want to watch / argue about
2. **Regional + cultural relevance** — does it land in KSA / Kuwait / Iraq / GCC
3. **Guest attraction** — can it land a strong, credible guest
4. **Timelessness** — lasting value, not a 3-day trend
5. **Viral + quality** — spreads while staying on Khat's bar

### The nine RAF factors and their weights
From `regional-fit.ts` (`RAF_WEIGHTS`). The composite is the weighted average,
normalised by the weight sum:

| Factor | Weight |
|---|---|
| `curiosity` | 1.50 |
| `discussion_potential` | 1.45 |
| `guest_potential` | 1.40 |
| `regional_relevance` | 1.35 |
| `cultural_resonance` | 1.10 |
| `identity_alignment` | 1.10 |
| `timelessness` | 0.95 |
| `viral_potential` | 0.90 |
| `educational_value` | 0.70 |

**Quality gate:** `identity_alignment ≤ 3` pulls the whole RAF score down hard
(`raf *= identity_alignment / 6`) — so a "viral but cheap" idea can't top the ranking.

### Two guardrails baked into the prompt
- **"Depth is universal"** — the model is explicitly told a science / business /
  health / finance / tech / history / culture topic can be as deep, timeless, and
  magnetic as a psychology or philosophy one, and **not** to default to introspective
  framing (the old failure mode).
- **Identity anchors every season** — a Kuwait national-memory anchor (policy:
  required / optional / excluded), at least one deeply human story, and at least one
  bold debatable episode. Plus a quality bar that bans trend-chasing, clickbait,
  tabloid framing, and empty self-help / finance / wellness clichés.

### Must-include roles (intelligent completion)
`lib/khat-map/v2/completion.ts` tracks five editorial roles a full season should
contain — `emotional`, `controversial`, `kuwait`, `personal`, `signature` — and,
as the season nears full (`target − accepted ≤ 2`), nudges the generator to fill any
gap with a slot-positional completion pass.

---

## File map

| File | Responsibility |
|---|---|
| `lib/khat-map/v2/batch-engine.ts` | the 8-step orchestration (`generateBatch`) |
| `lib/khat-map/v2/prompts-audience.ts` | the audience-first editorial-board prompt + output contract |
| `lib/khat-map/v2/categories.ts` | the 15-category taxonomy + helpers |
| `lib/khat-map/v2/regional-fit.ts` | RAF factors, weights, composite + quality gate |
| `lib/khat-map/v2/diversity.ts` | per-category season cap + diversity penalty |
| `lib/khat-map/v2/select-by-potential.ts` | potential-first selector |
| `lib/khat-map/v2/editorial-filter.ts` | editorial-controls + domain-weight filter |
| `lib/khat-map/v2/completion.ts` | must-include role gap detection |
| `lib/khat-map/learning/embeddings.ts` | similarity classification (hard-block / soft-avoid) |
| `lib/khat-map/learning/taste.ts` | the admin taste profile |
| `lib/khat-map/performance/` | cross-season domain performance signal |

_Generated from a read of the `lib/khat-map/v2/` engine. If the code changes, treat the code as authoritative._
