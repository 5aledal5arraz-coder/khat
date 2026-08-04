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
 * Manifa V2 — the identity's own face, installed 2026-08-04 — sets far shorter
 * ink: the same pair needs 69.4px, a leading of 1.049 against the 1.5 in force.
 * The collision was a property of the wrong typeface, not of the sentence, so
 * the balanced break comes back.
 *
 * MEASURE THE PAIR, NOT THE LINE, AND MEASURE IT IN THE FONT YOU SHIP. The
 * first check compared each line's own ink height to the leading and passed,
 * because the constraint is descender(line 1) + ascender(line 2). The second
 * was correct but measured a font this site no longer uses. Any edit to these
 * three strings needs both halves of that.
 */
export const BRAND_HEADLINE_LEAD = "كالعبارات التي"
export const BRAND_HEADLINE_REST_BEFORE = "تضع تحتها"
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
