# Hybrid Topics — Judge Brief

The judge ranks a combined pool of [generated candidates, hand-picked
positives] for editorial quality. Same prompt template across features
(in `lib/evals/judge.ts`) — this doc records the *feature-specific
quality bar* that judge prompt embeds.

## What the judge rewards

- **Specific conflict.** "بين الحرية كهدف والحرية كصدمة" beats
  "بين القديم والجديد."
- **Unscrollable emotional hook.** A sentence a thoughtful person would
  stop on. Never "في هذه الحلقة" or "تعرف على".
- **Named stakes.** Real people, real places, real losses.
- **Why-now that doesn't smell like marketing.** A real reason this
  topic matters this season.
- **Lens-conflict alignment.** Title's tension fits the editorial lens.

## What the judge penalises

- Listicles, "how to", "X secrets" patterns (matches against
  `lib/original-thinking/novelty.ts:GENERIC_TITLE_PATTERNS`).
- "Be your best self" wording (`VAGUE_CONFLICT_PHRASES`).
- Hooks shorter than 40 characters or containing
  `WEAK_HOOK_PHRASES`.
- Kuwait-bias when the run did not request it.
- Self-rated score > 0.8 without specific evidence in conflict/hook.

## Reference exemplars

Top 4 positives are anchored in real episodes 001 / 010 / 014 / 016 —
all > 179k YouTube views. These are not aspirational; they are what
Khat is already proven to do well.

## Operator override

If the judge ranking ever puts a candidate above a real-episode
positive AND the operator disagrees, the resolution is to add the
candidate's failure mode to the negative set with a written reason.
The judge does not have the final word; the operator's record does.
