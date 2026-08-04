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
 * THE BREAK IS A TYPESETTING DECISION, NOT A RHETORICAL ONE. It was
 * «كالعبارات التي / تضع تحتها خطًّا» — balanced on the page and broken in the
 * ink. The ي of «التي» drops 30.1px below its baseline; the tanween-plus-shadda
 * over «خطًّا» climbs 71.6px above its own. At the display size (66.2px) that
 * is 101.7px of stacked ink inside a 99.2px line box: the two marks touched,
 * and Khaled saw it before any guard did.
 *
 * Moving the break puts «كالعبارات» above the accented word instead — it ends
 * in ت, whose dots sit ABOVE, so line one now descends only 15.9px and the gap
 * is +11.7px. Two lines of unequal length, which centred display type carries
 * fine; a collision it does not.
 *
 * MEASURE THE PAIR, NOT THE LINE. The earlier check measured each line's own
 * ink height against the leading and passed — it could not see this, because
 * the constraint is descender(line 1) + ascender(line 2). Any future edit to
 * these three strings has to be re-measured that way.
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
