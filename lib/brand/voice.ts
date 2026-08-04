/**
 * How KHAT describes itself — one copy, because there used to be two.
 *
 * WHAT THIS REPLACED. The site said what it was in seven places and disagreed
 * with itself in two ways:
 *
 *   hero      «بودكاست عربي يستكشف القصص والأفكار من خلال حوارات صادقة مع عقول ملهمة»
 *   elsewhere «بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين»
 *
 * Same sentence, different words: layout.tsx, manifest.ts, footer.tsx,
 * static-content.ts and three spots in page.tsx. A visitor read one on the
 * page and another in the footer; Google read a third in the meta tag.
 *
 * WHY THIS WORDING. Both old versions were filler — «يستكشف القصص»,
 * «حوارات صادقة», «عقول ملهمة» are phrases that fit any podcast in any
 * language. Meanwhile the best line on the site was buried at the tail of the
 * hero paragraph: «عباراتٌ تستحق أن تضع تحتها خط».
 *
 * That line is the brand. خط is a line; the mark is a khaa with one under it;
 * and the identity artwork already carries the slogan «كالعبارات التي تضع
 * تحتها خطاً». It says what the show is (things worth keeping) by saying the
 * show's own name. Nothing generic can do that, so it moves to the headline
 * and the filler goes.
 */

/**
 * The headline, split where it should break. The second line carries the pun.
 *
 * THE BREAK IS A TYPESETTING DECISION, AND IT MOVED TWICE.
 *
 * Under IBM Plex Sans Arabic this balanced break collided: the ي of «التي»
 * dropped 30.1px, the tanween-plus-shadda over «خطًّا» climbed 71.6px, and
 * 101.7px of stacked ink did not fit a 99.2px line. Khaled saw it before any
 * guard did, and the fix then was to break after «كالعبارات» instead.
 *
 * Manifa V2 sets shorter ink, so after the font swap the pair measured 69.4px
 * against a 76.1px line box and the balanced break was restored — and Khaled
 * looked at the result and said the marks were still sitting under the dots.
 * He was right and the measurement was not wrong, it was answering a smaller
 * question: +6.7px of clearance is NON-OVERLAP, and non-overlap is not the
 * same as legible. Two diacritic clusters that miss each other by a hairline
 * still read as one crowded smudge at 66px.
 *
 * So the break stays off «التي» — «كالعبارات» ends in ت, whose dots sit ABOVE,
 * and it descends 11.6px where «التي» descends 16.2px — and the display leading
 * goes to 1.3 for optical room rather than arithmetic room.
 *
 * THE RULE THIS COST THREE ATTEMPTS TO LEARN. Measure the PAIR, not the line;
 * measure it in the font you actually ship; and then LOOK AT IT, because the
 * threshold that matters is not the one a canvas can report.
 */
export const BRAND_HEADLINE_LEAD = "كالعبارات"
export const BRAND_HEADLINE_REST_BEFORE = "التي تضع تحتها"
/** Underlined in the accent on the page — the sentence performing itself. */
export const BRAND_HEADLINE_ACCENT = "خطًّا"

/** Under the headline. Concrete, and free of the four adjectives that were there. */
export const BRAND_SUBHEAD = "حوارات عربية تبقى معك بعد أن تنتهي."

/**
 * The one-line description for metadata, the footer, the manifest and the
 * about page. Leads with the plain fact, closes with the brand's own image —
 * so a search result reads as a sentence and not as a keyword list.
 */
export const BRAND_DESCRIPTION =
  "بودكاست عربي: حوارات تبقى معك بعد أن تنتهي — كالعبارات التي تضع تحتها خطًّا."
