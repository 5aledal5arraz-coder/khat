/**
 * Podcast Intelligence — abstracted success patterns of the medium.
 *
 * Not a copy of any show. The principles below distill WHY episodes succeed or
 * die across YouTube, Apple Podcasts, Spotify, and the wider internet — watch
 * time, clip-ability, guest pull, sponsor fit, timeless reference value, and the
 * overdone traps to avoid. Injected into the generation + Editorial Court prompts
 * so the engine reasons like a strategist who has watched a thousand episodes.
 *
 * Pure values + pure prompt builders. No I/O.
 */

/** The principle block for the generation prompt. */
export function buildPodcastPrinciplesBlock(): string {
  return [
    "# Podcast strategy (principles, not imitation)",
    "Judge each idea the way a strategist who studied what travels on YouTube, Apple, and",
    "Spotify would. What actually works:",
    "",
    "## What earns long watch / listen time",
    "- A real question the listener wants answered, revealed slowly, not dumped up front.",
    "- Narrative tension: a journey, a mystery, a stake — not a flat lecture.",
    "- One vivid human thread to hang the ideas on; abstraction alone loses people.",
    "- Depth that rewards staying — the best part is at minute 40, not minute 2.",
    "",
    "## What creates clips and short-form spread",
    "- A single sharp, quotable claim or reversal that stands alone out of context.",
    "- A moment of emotion, confession, or controversy that demands to be shared.",
    "- A counter-intuitive fact that makes someone say 'wait, what?' in 30 seconds.",
    "",
    "## What attracts strong guests",
    "- A frame that flatters the guest's expertise and lets them say something new.",
    "- A topic with enough weight that a credible person wants their name on it.",
    "",
    "## What attracts sponsors without cheapening the brand",
    "- Adjacent to a real audience need (money, health, tech, growth) but treated with depth.",
    "- Safe enough to sit beside a brand, bold enough to be worth watching — not either/or.",
    "",
    "## What becomes a timeless reference",
    "- Answers a question people will still ask in five years, not a 3-day news cycle.",
    "- The definitive take on a subject — the episode people send to others to explain it.",
    "",
    "## Overdone — avoid unless you have a genuinely fresh angle",
    "- Generic 'success habits / morning routine / mindset' self-help with no specificity.",
    "- Surface 'AI will change everything' takes with no concrete stakes.",
    "- Recycled motivational clichés, vague 'power of the mind', empty wellness.",
    "- A topic already done to death with the exact same framing everyone uses.",
    "Reward the FRESH angle on a strong subject over a tired angle on a trendy one.",
  ].join("\n")
}
