# Khat Brain — Evaluation Architecture

Phase 0 deliverable. Defines the shape of the eval system so every later
phase has a stable contract to build against.

## Goal

Every editorial AI feature must be **measurable** before it is **changed**.
No prompt edit, no model swap, and no scoring tweak ships in Phase 2
without a baseline-vs-candidate eval comparison written to `evals/results/`.

## Non-goals (Phase 0)

- Not yet replacing rejection rules with model-graded judgment.
- Not yet changing any production behavior.
- Not yet evaluating every AI feature — only the five highest-value ones.
- Not yet wiring evals into CI. (Manual `npm run eval` for now.)

---

## Directory layout

```
evals/
├── ARCHITECTURE.md              # this file
├── baselines.json               # frozen baselines per feature + prompt hash
├── CURATION_NEEDED.md           # what the operator must add by hand
├── <feature>/
│   ├── golden.json              # the golden set
│   └── judge.md                 # human-readable description of what
│                                # the judge checks for this feature
└── results/<feature>/
    └── <iso-timestamp>.json     # one report per run
```

Five features have golden sets in Phase 0:

| Feature                  | Generator file                              | task_kind     |
|--------------------------|---------------------------------------------|---------------|
| `hybrid-topics`          | `lib/hybrid-topics/generate.ts`             | editorial     |
| `original-thinking`      | `lib/original-thinking/generator.ts`        | editorial     |
| `discovery-archetypes`   | `lib/discovery/seed-archetypes.ts`          | discovery     |
| `discovery-verify`       | `lib/discovery/verify-candidate.ts`         | verification  |
| `studio-package`         | `lib/ai/studio.ts`                          | editorial     |

The Prep V2 critique pass is excluded from Phase 0 evals (its 4-pass
shape requires multi-call orchestration; defer to Phase 2 when we wire
the critique improvements). The 14 other `runAiTask` call sites are
peripheral; their consolidation into `lib/ai/prompts/` is also deferred.

---

## Golden-set shape

A golden set is a JSON file with one schema per feature, all sharing a
common envelope:

```jsonc
{
  "$schema_version": "v1",
  "feature": "hybrid-topics",
  "language": "ar",
  "description": "Curated examples of strong vs. weak Hybrid topics.",
  "positive": [
    {
      "id": "pos-001",
      "source": "real-episode-077",       // provenance — what entitles us
                                          //              to cite this
      "evidence": "view_count=296502",    // why it's a positive
      "example": { ...feature-specific... }
    }
  ],
  "negative": [
    {
      "id": "neg-001",
      "source": "synthetic-rule-driven",
      "evidence": "violates novelty.GENERIC_TITLE_PATTERNS",
      "example": { ...feature-specific... }
    }
  ]
}
```

**Provenance is mandatory.** Every entry says either:
- `real-episode-<n>` — pulled from `config/episode-cache.json`
- `real-candidate-<id>` — pulled from a `khat_map_episode_candidates` row
- `operator-curated` — the operator personally added/edited it
- `synthetic-rule-driven` — generated as a deliberate rule violation

This prevents the eval set from being a fiction.

---

## Judge contract

For each feature, the eval system calls a **judge prompt** that:

1. Receives the candidate output + the golden set's positives and negatives.
2. Returns a score (0–10) and a one-sentence reason per candidate.
3. Optionally returns a pairwise ranking against the positives.

Judge prompts are stored as `evals/<feature>/judge.md` so non-engineers
can review and edit them.

**Pairwise > absolute** is the explicit choice. Asking a model "rank these
five candidates relative to these reference titles" produces stable signals;
asking "rate this on a 0–10 scale" produces drift across runs. The judge
returns rank + reason; the eval engine derives a quality score from rank.

### Scoring formula

For a generated batch of N candidates and a golden positive set of P
positives:

```
quality(generated) = mean_position_of(generated_topic, sorted_by_judge_among
                     [...generated_topics, ...positives])
```

A "perfect" generator's candidates would consistently rank inside the
positives. The metric is bounded `[0, N+P]` where lower is better
(closer to 1 means generated topics rank top among positives).

For convenience, we normalize to `[0, 1]` where 1 is best. The baseline
becomes the floor.

---

## Prompt versioning contract

Every `runAiTask` call now accepts an optional `promptVersion` field
(e.g., `"hybrid-v1.0"`). The router writes it to `ai_runs.prompt_version`.
The eval engine reads from there to track which prompt produced which
outputs.

Prompt-version strings are defined in
`lib/ai/prompts/<feature>.ts` and exported as `export const VERSION =
"<feature>-vX.Y"`. Whenever a prompt edit ships, the version bumps. Any
A/B comparison is a SQL filter on `prompt_version`.

---

## What the operator must curate (in `CURATION_NEEDED.md`)

The eval system seeds the golden sets with provenance-anchored entries
(real episodes, rule-violation synthetics). It cannot author the
editorial-taste judgments. Operator must:

1. Review the auto-seeded positives and remove any that don't match
   Khat's voice on closer reading.
2. Add 3–5 personally-chosen positives per feature with `source:
   operator-curated`.
3. Review the synthetic negatives and replace at least 30% with
   real-world weak titles the operator has encountered.

---

## Snapshot stability

Every prompt-builder refactor in P0.5 is **byte-equivalent**. A snapshot
test (`evals/snapshots/<feature>.txt`) records the exact prompt string the
current code produces for a fixed input. The refactor passes iff the
new code produces the same string. This guarantees the refactor is a
pure code reorganization, not a behavior change.

---

## Failure modes the architecture defends against

- **"We changed the prompt and quality dropped — when?"** → prompt_version
  column + golden-set re-runs make this answerable.
- **"The eval set was tuned to make us look good."** → provenance field
  surfaces synthetic vs. real; an audit can spot-check the ratio.
- **"Our judge is biased toward our own outputs."** → pairwise format
  against reference positives makes the judge compare relative quality,
  not absolute. Plus judge prompts live in `evals/<feature>/judge.md` for
  review.
- **"Eval cost is unbounded."** → judge runs use `gpt-4o-mini`
  (the cheap structural model) because the judgment is structural
  (ranking), not editorial. Per-eval cost is bounded by the size of the
  golden set.

---

## Phase 0 → Phase 2 handoff

After Phase 0 ships, Phase 2 can:
1. Change a prompt, bump its `VERSION` constant.
2. Run `npm run eval -- <feature>` to grade against the baseline.
3. See the lift (or regression) before any code reaches an operator.
4. Decide ship/abort based on numbers, not intuition.
