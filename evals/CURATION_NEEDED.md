# Khat Brain — Golden-Set Curation Needed

Phase 0 ships **provenance-anchored seed entries** for each feature.
The engineering pass alone cannot author editorial taste. Before any
Phase 2 AI-quality change is trusted against these baselines, the
**operator must complete the following curation**.

This document is the contract. Until every TODO below is closed,
treat Phase 0 baselines as *partial*.

---

## Why this matters

The audit and the roadmap explicitly stated: "operator personally
curates 80% of golden-set entries." The seeded entries are anchored
in real Khat episode data (view-count cited) or in rule violations
that are deterministically verifiable. They are honest, but they are
**not enough alone**.

Without operator-curated positives, the eval can detect *regression*
against past quality (good) but cannot detect *failure to reach
operator-grade quality* (gap).

---

## Per-feature curation list

### hybrid-topics (`evals/hybrid-topics/golden.json`)

Currently: 4 positives anchored in real episodes (#001, #010, #014, #016),
4 synthetic negatives derived from `lib/original-thinking/novelty.ts`.

**Operator TODO:**
- [ ] Add **3–5 personally-curated positives** with `source:
      operator-curated`. Pick topics you wish the Hybrid Generator
      had produced for a past season — the kind you wrote down and
      thought "this would have been a great Khat episode."
- [ ] Replace **at least 1 synthetic negative** with a real-world weak
      title the system has produced or you have rejected. Tag it
      `source: operator-curated` with an `operator_note` explaining
      why it failed.
- [ ] Skim the 4 seeded positives and remove any that, on closer
      reading, don't pass your editorial bar. (Each cites the real
      episode it derives from; you can compare.)

### original-thinking (`evals/original-thinking/golden.json`)

Currently: 3 positives transcribed from real episode arcs into the
lens-driven shape, 3 synthetic negatives.

**Operator TODO:**
- [ ] Add **3–5 personally-curated positives** that exemplify each of
      the 12 lenses in `config/lenses.json`. Specifically, write at
      least one positive that uses each of these lenses:
      `betrayal_of_self`, `unspoken_grief`, `moral_compromise`,
      `existential_dread`, `power_and_intimacy`.
- [ ] Add **one negative** that demonstrates the most common failure
      mode you see in actual output (probably "the lens fits but the
      conflict is paraphrased from the title").

### discovery-archetypes (`evals/discovery-archetypes/golden.json`)

Currently: 3 operator-curated archetype shapes (derived from
the editorial brief in `lib/discovery/seed-archetypes.ts`), 2 synthetic
negatives.

**Operator TODO:**
- [ ] Confirm the 3 seeded archetypes match your real editorial intent.
      Edit names / descriptions / signals to reflect your actual
      language for these patterns.
- [ ] Add **2–3 more archetypes** for patterns Khat looks for that
      aren't covered. Candidates: 'الحرفي الذي لم يبحث عن الكاميرا',
      'العائد من الحرب الصامت', 'المرأة التي لم تأخذ الميكروفون',
      'من خرج من اليقين'.
- [ ] Replace **1 synthetic negative** with a real archetype that the
      old prompt produced and you rejected.

### discovery-verify (`evals/discovery-verify/golden.json`)

Currently: 2 operator-curated verdict examples (one accepting, one
rejecting), 2 synthetic negatives (inflation + invention).

**Operator TODO:**
- [ ] Verify the 2 seeded verdicts are stylistically how YOU would
      write a verification — tone, depth, calibration of the fit
      score.
- [ ] Add **2 more positives**: one ambiguous case (fit ≈ 0.5 with
      explicit reasoning about both sides), one strong rejection with
      named red flags.
- [ ] Add **1 negative** demonstrating "verdict that contradicts the
      evidence" — e.g., low fit score on a candidate the evidence
      clearly supports.

### studio-package (`evals/studio-package/golden.json`)

Currently: 2 positives reconstructed from real top-performing episode
titles, 2 synthetic negatives (vague + clickbait).

**Operator TODO:**
- [ ] Add **2–3 more positives** from episodes 003 / 011 / 015 / 017 /
      018 — reconstruct each as a complete package (title_best, alt
      titles, thumbnails, description, keywords, hashtags). Use the
      seeded entries as the template.
- [ ] Add **1 negative** demonstrating a real failure pattern — e.g.,
      a package whose `youtube_description` is markdown-heavy when
      the prompt says "no Markdown."

---

## Curation workflow

1. Open the `golden.json` for the feature.
2. Add new entries to the `positive` or `negative` array with a
   unique `id`, a `source` value, an `evidence` field explaining why
   the entry belongs, and the example payload.
3. (Recommended) Add an `operator_note` field explaining the
   editorial judgment behind the entry.
4. Save. The eval CLI picks up the change on the next run.
5. After significant curation, re-run baselines:
   `npm run eval -- baseline <feature>`

The eval engine hashes the golden set so a quality comparison
between runs is invalid if the golden set itself changed — re-baseline
when you curate.

---

## Honest expectations

You should expect to spend **2–4 focused hours** completing the TODOs
above. The result is the editorial-taste record that justifies every
later AI-quality claim. It's the most important manual step in the
entire roadmap.
