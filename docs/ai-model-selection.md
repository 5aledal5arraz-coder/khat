# AI model selection — strategy, discovery, and how to upgrade

_Written 2026-07-11, after the GPT-5.6 upgrade. The goal: when OpenAI ships a
better compatible model, adopting it takes minutes and zero code changes._

## The layers (bottom → top)

```
lib/ai-router/registry.ts         static knowledge: task-kind defaults, pricing,
                                  reasoning-effort defaults, FALLBACK_CHAINS
lib/ai-router/model-catalog.ts    live discovery: GET /v1/models per API key,
                                  6h TTL cache, family detection, fail-open
lib/ai-router/model-selection.ts  policy: env/config overrides + availability
                                  fallback + diagnostics snapshot
lib/ai-router/router.ts           runAiTask() — consults selection on the
                                  default OpenAI path for every call
```

## Resolution order (per task kind)

1. **Per-call `preferredModel`** — code-level, used verbatim. For generators
   with a hard requirement; bypasses selection entirely.
2. **Env override** — `KHAT_AI_MODEL_<KIND>` (e.g. `KHAT_AI_MODEL_EDITORIAL=gpt-5.7-sol`).
   Operator pin in PM2/shell; survives DB problems.
3. **Settings override** — admin → الإعدادات → الذكاء الاصطناعي → "تخصيص نموذج
   مهمة". Stored in the `config_store` table under `ai_model_overrides`
   (15s-cached, fail-safe reads — same mechanism as the rate-limit controls).
   Can also override the reasoning effort and carry the model's USD/1M pricing
   so `ai_runs.cost_usd` stays accurate for models the registry doesn't know.
4. **Registry default** — `FALLBACK_CHAINS[kind][0]` (== `DEFAULT_MODELS[kind]`).

The winner is then **availability-checked** against the live catalog:

- Model in `/v1/models` for this key → use it.
- Not available → walk the task's fallback chain to the first available model;
  log `[ai-router] <kind>: "<wanted>" is not available … fell back to "<used>"`
  once per process; diagnostics show source = "بديل تلقائي".
- Catalog unavailable (endpoint down, no key) → **fail open**: use the selection
  unchecked. A catalog hiccup must never block AI calls.

Reasoning-effort resolution is analogous: per-call `providerOptions.reasoningEffort`
> Settings override > task-kind default in the registry.

## Fallback chains (best-first; head = default)

| Task kind | Chain |
|---|---|
| editorial, discovery | gpt-5.6-sol → gpt-5.5 → gpt-5.6-terra → gpt-5.4 → gpt-4o |
| research | gpt-5.6-terra → gpt-5.4 → gpt-5.6-sol → gpt-4o |
| structural, verification, analysis | gpt-5.6-luna → gpt-5.4-mini → gpt-5.4-nano → gpt-4o-mini |

Chains are ordered by "closest in quality/cost profile", ending in a
previous-generation model that has never been unavailable. Every chain entry has
static pricing in the registry (unit-tested), so even a fallback run costs
correctly. Chains guard **availability only** — adopting a new generation does
not edit them (use an override); update them opportunistically when the defaults
themselves move.

## How to adopt a newer model (e.g. OpenAI ships gpt-5.7)

The settings panel (and `npm run ai:models`) will show a banner: _"رُصد جيل
أحدث: GPT-5.7"_ — the catalog detected a family newer than `KNOWN_LATEST_FAMILY`.

1. **No-code adoption (minutes):** Settings → الذكاء الاصطناعي → تخصيص نموذج
   مهمة → pick the task, enter `gpt-5.7-sol` (datalist offers everything the key
   can use), enter its input/output $/1M from the pricing page, save. Applies to
   the next AI call on both server and worker. Or per box:
   `KHAT_AI_MODEL_EDITORIAL=gpt-5.7-sol`.
2. **Make it the default (one small PR, when settled):** update
   `DEFAULT_MODELS` + `FALLBACK_CHAINS` + `EXTRA_PRICING` in
   `lib/ai-router/registry.ts`, bump `KNOWN_LATEST_FAMILY` in
   `model-catalog.ts`, run the (already-written) consistency tests, clear the
   Settings overrides. Verify parameter compatibility on the [model guidance
   page](https://developers.openai.com/api/docs/guides/latest-model) — the
   adapter's parameter translation (temperature gating, `max_output_tokens`,
   reasoning effort values) is the only code that would care.

## Diagnostics

- **UI**: admin → الإعدادات → الذكاء الاصطناعي — catalog freshness + refresh
  button, families available to the key, newer-family banner, effective model
  per task with source badge and fallback order.
- **CLI**: `npm run ai:models` (add `-- --refresh` to force a catalog fetch) —
  same data for the worker box / SSH.
- **Telemetry**: every run's resolved model lands in `ai_runs.model_name`.

## Failure semantics (summary)

| Failure | Behavior |
|---|---|
| `/v1/models` unreachable | Last good catalog is kept; if never fetched, availability checks fail open. Never throws, never blocks a call. |
| `config_store` read fails | Last cached overrides (or none). AI hot path unaffected. |
| Override names an unavailable model | Fallback chain, logged once, visible in diagnostics. |
| Override names an unknown-but-available model without pricing | Call works; `cost_usd` is null (honest unknown) and the panel warns. |
| Selection layer throws unexpectedly | `router.ts` catches and proceeds with the registry default. |

## Boot

`instrumentation.ts` (Next server) and `lib/jobs/worker.ts` warm the catalog at
startup (fire-and-forget). TTL is 6h with stale-while-revalidate — steady-state
adds zero latency to AI calls.
