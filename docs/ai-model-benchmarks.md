# Model benchmarks — evidence-based upgrades

_Companion to [ai-model-selection.md](ai-model-selection.md). Written 2026-07-11._

The selection engine is version-aware (it detects newer GPT families); this layer
makes it **benchmark-aware**: every newly discovered compatible model is measured
against the current production model on our real workloads before anyone is asked
to adopt it. Recommendations come from thresholds, not release notes.

## What gets measured (9 dimensions, one suite)

| Dimension | How it's graded |
|---|---|
| Guest discovery & ranking | Blind pairwise judge (see below) on "propose & rank 8 guests" for a season-style topic |
| Arabic editorial generation | Blind pairwise judge on titles + hero summary from a transcript |
| Research synthesis | Blind pairwise judge on a cited brief from source snippets |
| Long-context reasoning | **Exact matching**: 5 planted needles across a ~35k-char document + 1 ordering question |
| Information extraction | **Exact matching**: planted verbatim quotes, guest name, chapter-count bounds from a transcript |
| Output consistency | Same extraction prompt ×3: valid-JSON rate + chapter-count stability + quote-recall stability |
| Cost | Measured `cost_usd` across the suite calls (needs pricing; unknown → surfaced, not fabricated) |
| Latency | Median wall-clock per call, same task mix both sides |
| Token efficiency | Total output tokens (incl. reasoning tokens) candidate ÷ baseline |

Fixtures (`lib/ai-router/benchmark/fixtures.ts`) are synthetic Arabic workloads
with **planted, programmatically-checkable facts** — no real episode data, fully
deterministic. Changing them requires bumping `SUITE_VERSION` (scorecards are
comparable only within one suite version).

**Judging is blind pairwise** (`lib/evals`' "pairwise > absolute" rule): the judge
sees output A vs output B without knowing which model produced which, twice with
orders swapped to cancel position bias. Judge model is pinned
(`BENCHMARK_JUDGE_MODEL`, recorded per row).

## The decision (configurable thresholds)

Thresholds live in `config_store` under `ai_benchmark_thresholds`
(`npm run ai:benchmark -- --set-threshold minQualityNet=10`). Defaults in
`scoring.ts` → `DEFAULT_THRESHOLDS`:

| Threshold | Default | Meaning |
|---|---|---|
| `minQualityNet` | 8 | Quality-led upgrade needs net judge preference ≥ 8 (−100..100 scale) |
| `minAccuracyGainPp` | 5 | Accuracy-led upgrade needs ≥ +5pp programmatic gain |
| `minAccuracyDeltaPp` | −2 | Floor: programmatic score may not regress below this |
| `maxCostIncreasePct` | 30 | Gate for any upgrade |
| `maxLatencyIncreasePct` | 75 | Gate for any upgrade |
| `minCostSavingPct` | 25 | Cost-led upgrade needs ≥ 25% saving with no quality loss |
| `minConsistencyDeltaPp` | −10 | Floor: consistency may not regress below this |
| `autoBenchmark` | true | Auto-run for models in families newer than the defaults |

Three upgrade paths — **quality-led** (judge prefers candidate), **accuracy-led**
(programmatic gains, matters for the efficient tier), **cost-led** (much cheaper,
quality not worse). Anything else → *Keep current*, with Arabic reasons listing
exactly which gates failed. Tier weights (`JUDGED_WEIGHTS`/`PROGRAMMATIC_WEIGHTS`)
skew the aggregates toward what each tier actually does.

## How runs happen

- **Auto-discovery**: the worker scans every 12h (and 2min after boot). Models in
  GPT families newer than `KNOWN_LATEST_FAMILY` are matched to a tier by suffix
  (`-sol`/`-pro`/bare → flagship, `-terra` → balanced, `-luna`/`-mini`/`-nano` →
  efficient) and benchmarked against that tier's default — once per
  candidate+baseline+suite (dedupe in the table).
- **Manual**: Settings → الذكاء الاصطناعي → "قياس النماذج" → pick candidate + tier
  ("شغّل القياس"; runs on the worker), or `npm run ai:benchmark -- --candidate
  gpt-5.7-sol` (runs inline, no worker needed).
- A run ≈ 20 AI calls (7 per model + 6 judge calls); budget roughly $0.5–3
  depending on tier. Calls are tagged `actor_id=model-benchmark` in `ai_runs`.

## Where results live

- **Admin**: Settings → الذكاء الاصطناعي → "قياس النماذج — أدلة الترقية": current
  vs candidate per dimension, cost/latency deltas, recommendation badge
  (⬆ يُوصى بالترقية / إبقاء النموذج الحالي), benchmark date, and the reasons.
- **CLI**: `npm run ai:benchmark -- --list`.
- **DB**: `model_benchmarks` (scorecard + summary + thresholds-at-decision-time +
  judge model — fully auditable later).

## Honest limitations

- The suite is a **proxy**, not production: ~20 calls on synthetic fixtures.
  It reliably catches regressions and obvious wins; a "+2 net preference" is
  noise, which is exactly why `minQualityNet` defaults to 8.
- Judge bias: the pinned judge is today's flagship; a candidate from a very
  different lineage may be under-credited for style. Pairwise blinding + swap
  mitigates order bias, not lineage bias. Revisit `BENCHMARK_JUDGE_MODEL` when
  the flagship default changes.
- Cost for brand-new models is unknown until pricing is registered (Settings
  override or registry) — the scorecard says so instead of guessing.
- An "upgrade" recommendation still requires a human click (Settings override).
  That's deliberate: evidence-based, not auto-adopted.
