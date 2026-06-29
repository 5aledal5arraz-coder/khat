/**
 * Knowledge Universe — the deep map under the 15 categories.
 *
 * The 15 `SeasonCategory` values (categories.ts) are the *balance axis* — broad,
 * flat buckets good for spreading a season. They are too coarse to GENERATE from:
 * "history" or "science" as a single prompt cell pushes the model to the same
 * obvious episodes every time. This module gives each category ≥ 12 sharp,
 * generative **subcategories** — angles dense enough that the model lands on
 * fresh, specific, high-potential ideas instead of the textbook ones.
 *
 * Each subcategory carries a `scope_ar` that is a *generative* hint (what kinds
 * of episodes live here), not just a definition. The generator is shown the
 * universe; the Editorial Court and the UI use the chosen subcategory as a
 * precise classification finer than the category.
 *
 * RELATIONSHIP TO categories.ts
 * `category` stays the season balance axis (the cap, the diversity penalty).
 * `subcategory` is a finer label persisted alongside it — it never replaces the
 * category, it sharpens it. Every subcategory id is unique across the whole
 * universe so a bare id resolves to exactly one (category, subcategory) pair.
 *
 * Pure values + pure helpers only. No I/O, no DB.
 */

import { SEASON_CATEGORY_IDS, type SeasonCategoryId } from "./categories"

export interface KnowledgeSubcategory {
  /** Stable, globally-unique snake_case slug — persisted + used by the prompt. */
  id: string
  /** Arabic label shown to the model and on the card chip. */
  label_ar: string
  /** Generative Arabic hint — the kinds of episodes that live here. */
  scope_ar: string
}

/**
 * The universe: every one of the 15 categories → its deep subcategory set.
 * Order is presentation-only. Subcategory ids are unique across ALL categories.
 */
export const KNOWLEDGE_UNIVERSE: Record<SeasonCategoryId, readonly KnowledgeSubcategory[]> = {
  // ─── قضايا واقعية وأحداث راهنة ──────────────────────────────────────────────
  real_world: [
    { id: "geopolitical_shifts", label_ar: "تحوّلات جيوسياسية", scope_ar: "إعادة رسم خرائط النفوذ، تحالفات جديدة، وصعود وأفول القوى — بقراءة تشرح لا تتفرّج." },
    { id: "regional_conflicts", label_ar: "صراعات المنطقة", scope_ar: "جذور النزاعات في المشرق والخليج، من يربح ومن يخسر، وما لا يُقال في النشرات." },
    { id: "economy_now", label_ar: "اقتصاد اللحظة", scope_ar: "التضخم، أسعار النفط، البطالة، وغلاء المعيشة كما يعيشها الناس فعلاً." },
    { id: "energy_and_oil", label_ar: "الطاقة والنفط", scope_ar: "مستقبل النفط الخليجي، التحوّل الأخضر، ومن يتحكّم بمفاتيح الطاقة." },
    { id: "migration_and_demographics", label_ar: "الهجرة والديموغرافيا", scope_ar: "تغيّر تركيبة السكان، العمالة الوافدة، ونزوح العقول — وأثرها على الهوية." },
    { id: "pandemics_and_crises", label_ar: "الأوبئة والأزمات", scope_ar: "كيف يتصرّف الناس والدول في الأزمات الكبرى، ودروس لم نتعلّمها بعد." },
    { id: "tech_disruption_now", label_ar: "زلازل التقنية الآن", scope_ar: "حدث تقني يغيّر حياة الناس هذا العام — لا توقّعات بعيدة بل ما يحدث الآن." },
    { id: "social_movements", label_ar: "حركات اجتماعية", scope_ar: "موجات تغيير في القيم والسلوك العام، ولماذا تنفجر الآن تحديداً." },
    { id: "climate_reality", label_ar: "واقع المناخ", scope_ar: "حرارة الخليج، شُح الماء، والأمن الغذائي — لا شعارات بل أرقام تمسّ البيت." },
    { id: "media_and_narrative_wars", label_ar: "حروب الرواية والإعلام", scope_ar: "من يصنع الحقيقة، كيف تُدار المعارك على وعينا، ومن يموّلها." },
    { id: "scandals_and_accountability", label_ar: "فضائح ومساءلة", scope_ar: "قضية رأي عام كشفت خللاً بنيوياً — بتحليل لا بتشفٍّ." },
    { id: "everyday_struggles", label_ar: "معاناة الناس اليومية", scope_ar: "السكن، الديون، الزحام، الخدمات — الهموم الصامتة التي لا تتصدّر العناوين." },
  ],

  // ─── تاريخ ─────────────────────────────────────────────────────────────────
  history: [
    { id: "islamic_history", label_ar: "التاريخ الإسلامي", scope_ar: "لحظات مفصلية، شخصيات منسية، وقراءات تتجاوز السرد المدرسي." },
    { id: "historical_figures", label_ar: "شخصيات تاريخية", scope_ar: "حياة شخص واحد غيّر مجرى التاريخ — بطلاً كان أو طاغية أو مظلوماً." },
    { id: "history_of_civilizations", label_ar: "تاريخ الحضارات", scope_ar: "كيف تُولد الحضارات وتزدهر، وما الذي يفعله الازدهار بأهله." },
    { id: "fall_of_empires", label_ar: "سقوط الإمبراطوريات", scope_ar: "لماذا تنهار القوى العظمى — الترف، الديون، الانقسام، أم العدو الخارجي؟" },
    { id: "history_of_earth", label_ar: "تاريخ الأرض", scope_ar: "الكوارث الكبرى، العصور الجليدية، والانقراضات التي أعادت ضبط الكوكب." },
    { id: "history_of_life", label_ar: "تاريخ الحياة", scope_ar: "من الخلية الأولى إلى الإنسان — القصة الكبرى للتطوّر والبقاء." },
    { id: "history_of_money", label_ar: "تاريخ المال", scope_ar: "من المقايضة إلى الذهب إلى العملة الرقمية — وكيف صنع المال الحضارات وهدمها." },
    { id: "history_of_power", label_ar: "تاريخ السلطة", scope_ar: "كيف اختُرعت الدولة والملك والقانون، ومن دفع الثمن." },
    { id: "history_of_war", label_ar: "تاريخ الحروب", scope_ar: "معارك غيّرت العالم، عبقرية الاستراتيجية، وثمن الدم الذي لا يُروى." },
    { id: "history_of_ideas", label_ar: "تاريخ الأفكار", scope_ar: "فكرة واحدة (الحرية، العدالة، الفرد) ورحلتها عبر القرون." },
    { id: "history_of_religion", label_ar: "تاريخ الأديان", scope_ar: "نشأة المعتقدات وتحوّلاتها وصراعاتها — بموضوعية تشرح لا تحكم." },
    { id: "hidden_forgotten_history", label_ar: "تاريخ مخفي ومنسي", scope_ar: "أحداث طُمست أو حُرّفت، روايات الخاسرين، وما لا يُكتب في الكتب الرسمية." },
    { id: "gulf_kuwait_history", label_ar: "تاريخ الخليج والكويت", scope_ar: "الغوص، التجارة، النفط، الغزو، والذاكرة الوطنية — بأصوات من عاشوها." },
    { id: "history_of_science_discovery", label_ar: "تاريخ العلم والاكتشاف", scope_ar: "لحظة اكتشاف غيّرت كل شيء، والعقول التي دفعت ثمنها." },
  ],

  // ─── ثقافة وفنون ───────────────────────────────────────────────────────────
  culture: [
    { id: "literature_and_writers", label_ar: "الأدب والكتّاب", scope_ar: "رواية أو شاعر أو كاتب شكّل وعي جيل، وما الذي جعله خالداً." },
    { id: "cinema_and_film", label_ar: "السينما والفيلم", scope_ar: "فيلم أو مخرج غيّر طريقة رؤيتنا، وما تقوله السينما عنّا." },
    { id: "music_and_sound", label_ar: "الموسيقى والصوت", scope_ar: "كيف تصنع الموسيقى الهوية والمشاعر، ولماذا تبقى أغنية حيّة لعقود." },
    { id: "visual_art", label_ar: "الفن البصري", scope_ar: "لوحة أو فنان أو حركة فنية وراءها قصة أعمق من الجمال." },
    { id: "sports_culture", label_ar: "ثقافة الرياضة", scope_ar: "الرياضة كهوية وسياسة واقتصاد — ما وراء النتيجة." },
    { id: "language_and_dialects", label_ar: "اللغة واللهجات", scope_ar: "كيف تفكّر اللغة بدلاً عنّا، وما الذي يضيع حين تموت لهجة." },
    { id: "arab_gulf_identity", label_ar: "الهوية العربية والخليجية", scope_ar: "ما الذي يجمعنا ويفرّقنا ثقافياً، وكيف يتغيّر تعريف 'نحن'." },
    { id: "heritage_and_memory", label_ar: "التراث والذاكرة", scope_ar: "ما نحفظه وما ننساه، ولماذا نتمسّك بماضٍ بعينه." },
    { id: "pop_culture_phenomena", label_ar: "ظواهر الثقافة الشعبية", scope_ar: "ترند أو ظاهرة تكشف شيئاً عميقاً عن جيل كامل." },
    { id: "architecture_and_cities", label_ar: "العمارة والمدن", scope_ar: "كيف تشكّلنا المدن، وماذا تقول أبراج الخليج عن طموحاتنا." },
    { id: "food_culture", label_ar: "ثقافة الطعام", scope_ar: "الطعام كتاريخ وهوية وسلطة — ما يحكيه طبق واحد." },
    { id: "art_market_and_fame", label_ar: "سوق الفن والشهرة", scope_ar: "كيف يُصنع النجم وتُسعّر اللوحة، ومن يتحكّم بالذوق العام." },
    { id: "comedy_and_satire", label_ar: "الكوميديا والسخرية", scope_ar: "كيف يقول الضحك ما لا يُقال، والسخرية كسلاح ومرآة ومقاومة." },
  ],

  // ─── علم النفس ─────────────────────────────────────────────────────────────
  psychology: [
    { id: "cognitive_biases", label_ar: "انحيازات العقل", scope_ar: "كيف يخدعنا عقلنا يومياً، والأخطاء التي نظنّها منطقاً." },
    { id: "emotions_science", label_ar: "علم المشاعر", scope_ar: "ما هو الخوف والحب والغضب فعلاً، وكيف يحكموننا من الخلف." },
    { id: "trauma_and_healing", label_ar: "الصدمة والتعافي", scope_ar: "كيف يسكن الألم القديم في الجسد، وما الذي يشفي حقاً." },
    { id: "relationships_psychology", label_ar: "سيكولوجيا العلاقات", scope_ar: "التعلّق، الانفصال، والحب — بفهم علمي لا بكلام عاطفي." },
    { id: "motivation_and_willpower", label_ar: "الدافع والإرادة", scope_ar: "لماذا نبدأ ولا نكمل، وما الذي يحرّك السلوك فعلاً." },
    { id: "identity_and_self", label_ar: "الهوية والذات", scope_ar: "كيف نبني صورتنا عن أنفسنا، ومتى تتحطّم وتُعاد." },
    { id: "dark_psychology", label_ar: "علم النفس المظلم", scope_ar: "التلاعب، النرجسية، والسيطرة — كيف نكشفها ونحمي أنفسنا." },
    { id: "addiction_and_habits", label_ar: "الإدمان والعادات", scope_ar: "كيف يُختطف الدماغ، ولماذا تصمد العادة وتنهار العزيمة." },
    { id: "mental_health_stigma", label_ar: "الصحة النفسية والوصمة", scope_ar: "الاكتئاب والقلق في مجتمعاتنا، وثمن الصمت." },
    { id: "child_and_development", label_ar: "نفسية الطفل والنشأة", scope_ar: "كيف تصنع السنوات الأولى الإنسان، وما يبقى من الطفولة فينا." },
    { id: "decision_making", label_ar: "صناعة القرار", scope_ar: "كيف نختار تحت الضغط والخوف، ولماذا نندم." },
    { id: "loneliness_and_belonging", label_ar: "الوحدة والانتماء", scope_ar: "وباء العزلة الحديث، وحاجتنا العميقة لأن نُرى." },
    { id: "memory_and_nostalgia", label_ar: "الذاكرة والحنين", scope_ar: "كيف نعيد كتابة ماضينا بلا وعي، ولماذا نشتاق لزمن ربما لم يكن." },
    { id: "the_unconscious", label_ar: "اللاوعي", scope_ar: "ما الذي يقرّر بدلاً عنّا في الظلّ — الأحلام، الدوافع الخفية، وزلّات النفس." },
  ],

  // ─── علوم ──────────────────────────────────────────────────────────────────
  science: [
    { id: "space_and_cosmos", label_ar: "الفضاء والكون", scope_ar: "حجم الكون، البحث عن الحياة، ومكاننا الصغير في القصة الكبرى." },
    { id: "physics_of_reality", label_ar: "فيزياء الواقع", scope_ar: "الزمن، الكم، والثقوب السوداء — أعمق أسئلة الوجود بلغة يفهمها الجميع." },
    { id: "the_brain", label_ar: "الدماغ", scope_ar: "كيف تنشأ الذاكرة والوعي والقرار من كتلة من الخلايا." },
    { id: "genetics_and_dna", label_ar: "الجينات والوراثة", scope_ar: "ما الذي يكتبه الحمض النووي في مصيرنا، وأين تنتهي حدوده." },
    { id: "evolution_and_origins", label_ar: "التطوّر والأصول", scope_ar: "من أين أتينا، ولماذا نحن كما نحن — بيولوجياً وسلوكياً." },
    { id: "medicine_breakthroughs", label_ar: "اختراقات الطب", scope_ar: "اكتشاف يطيل العمر أو يهزم مرضاً، وثمنه الأخلاقي." },
    { id: "climate_science", label_ar: "علم المناخ", scope_ar: "كيف يعمل الكوكب فعلاً، وما الذي تخبرنا به الأرقام لا الشعارات." },
    { id: "neuroscience_of_behavior", label_ar: "عصبية السلوك", scope_ar: "ما الذي يحدث في الدماغ حين نحب، نخاف، أو نكذب." },
    { id: "math_and_patterns", label_ar: "الرياضيات والأنماط", scope_ar: "اللغة الخفية التي يكتب بها الكون نفسه، من النحل إلى الأسواق." },
    { id: "energy_and_matter", label_ar: "الطاقة والمادة", scope_ar: "من أين تأتي الطاقة، ومستقبل الاندماج النووي والبدائل." },
    { id: "science_controversies", label_ar: "جدل العلم", scope_ar: "حين يصطدم العلم بالأخلاق أو الدين أو السياسة — من يقرّر؟" },
    { id: "everyday_science", label_ar: "علم الحياة اليومية", scope_ar: "فيزياء وكيمياء ما نلمسه كل يوم — لماذا يحدث ما يحدث." },
    { id: "consciousness_and_unknown", label_ar: "الوعي والمجهول", scope_ar: "أصعب أسئلة العلم: ما الوعي؟ ما الذي لا نعرفه بعد، وحدود ما يمكن معرفته." },
    { id: "great_scientists", label_ar: "عقول غيّرت العلم", scope_ar: "حياة عالِم واحد وصراعه وفكرته — العبقرية وثمنها الإنساني." },
  ],

  // ─── تطوير الذات ───────────────────────────────────────────────────────────
  self_development: [
    { id: "discipline_and_systems", label_ar: "الانضباط والأنظمة", scope_ar: "كيف يبني الناجحون أنظمة تعمل بدل الاعتماد على الحماس." },
    { id: "focus_and_attention", label_ar: "التركيز والانتباه", scope_ar: "استعادة العقل من التشتّت، واقتصاد الانتباه الذي يبيعنا." },
    { id: "learning_how_to_learn", label_ar: "تعلّم كيف تتعلّم", scope_ar: "كيف نكتسب المهارات بسرعة، وأساطير التعليم التي تعطّلنا." },
    { id: "time_and_energy", label_ar: "الوقت والطاقة", scope_ar: "إدارة الطاقة لا الوقت، ولماذا نشعر بالإرهاق رغم القليل." },
    { id: "fear_and_courage", label_ar: "الخوف والشجاعة", scope_ar: "كيف نتصرّف رغم الخوف، وثمن حياة نعيشها بأمان زائف." },
    { id: "purpose_and_meaning", label_ar: "المعنى والغاية", scope_ar: "لماذا نستيقظ، وكيف نبني حياة تستحق رغم العبث." },
    { id: "habits_and_change", label_ar: "العادات والتغيير", scope_ar: "العلم الحقيقي لتغيير السلوك، لا الكليشيهات التحفيزية." },
    { id: "resilience_and_failure", label_ar: "الصمود والفشل", scope_ar: "كيف نتعافى من الانكسار، وما يصنعه الفشل في الإنسان." },
    { id: "communication_skills", label_ar: "مهارات التواصل", scope_ar: "كيف نُقنع ونُصغي ونُفهم، وقوة الكلمة الصحيحة." },
    { id: "money_mindset", label_ar: "عقلية المال", scope_ar: "علاقتنا النفسية بالمال، والمعتقدات التي تُفقرنا أو تُغنينا." },
    { id: "self_image_and_confidence", label_ar: "الثقة وصورة الذات", scope_ar: "من أين تأتي الثقة الحقيقية، والفرق بينها وبين الغرور." },
    { id: "ambition_and_burnout", label_ar: "الطموح والاحتراق", scope_ar: "ثمن السعي بلا توقّف، ومتى يصبح الطموح فخاً." },
  ],

  // ─── أعمال وريادة ──────────────────────────────────────────────────────────
  business: [
    { id: "founder_stories", label_ar: "قصص المؤسسين", scope_ar: "رحلة بناء مشروع من الصفر — الليالي السوداء قبل النجاح." },
    { id: "startup_lessons", label_ar: "دروس الشركات الناشئة", scope_ar: "لماذا تنجح فكرة وتفشل أفضل منها، وما يتجاهله الجميع." },
    { id: "leadership_and_teams", label_ar: "القيادة والفِرق", scope_ar: "كيف يُبنى فريق استثنائي، وأخطاء القادة التي تهدم الثقة." },
    { id: "money_and_fundraising", label_ar: "المال والتمويل", scope_ar: "كيف يُجمع المال ويُحرق، ولعبة المستثمرين الحقيقية." },
    { id: "gulf_entrepreneurship", label_ar: "ريادة الأعمال الخليجية", scope_ar: "واقع بناء المشاريع في الخليج — العوائق، الفرص، والتحوّل." },
    { id: "marketing_and_brand", label_ar: "التسويق والعلامة", scope_ar: "كيف تُبنى علامة تُحبّ، وعلم الإقناع خلف ما نشتري." },
    { id: "failure_and_bankruptcy", label_ar: "الفشل والإفلاس", scope_ar: "قصة انهيار شركة أو ثروة، والدروس التي تُدفع غالية." },
    { id: "future_of_work", label_ar: "مستقبل العمل", scope_ar: "نهاية الوظيفة التقليدية، العمل الحر، والذكاء الاصطناعي كزميل." },
    { id: "negotiation_and_deals", label_ar: "التفاوض والصفقات", scope_ar: "فنّ الصفقة، علم النفس خلف الطاولة، ومن يملك القوة." },
    { id: "industry_disruption", label_ar: "زلزلة الصناعات", scope_ar: "كيف يقلب لاعب جديد صناعة كاملة، ومن يُمحى." },
    { id: "wealth_and_power_families", label_ar: "ثروة وعائلات النفوذ", scope_ar: "كيف تُبنى الإمبراطوريات العائلية وتُورّث وتنهار." },
    { id: "ethics_of_business", label_ar: "أخلاقيات الأعمال", scope_ar: "حين يصطدم الربح بالضمير — أين يقف الخط؟" },
    { id: "monopolies_and_competition", label_ar: "الاحتكار والمنافسة", scope_ar: "كيف تبتلع الشركات الكبرى السوق، ومن يحمي اللاعب الصغير والمستهلك." },
  ],

  // ─── المال الشخصي ──────────────────────────────────────────────────────────
  personal_finance: [
    { id: "saving_and_budgeting", label_ar: "الادخار والميزانية", scope_ar: "كيف يتحكّم الناس بمالهم فعلاً، لا نصائح مكرّرة." },
    { id: "investing_basics", label_ar: "أساسيات الاستثمار", scope_ar: "كيف ينمو المال، الأسهم والعقار، والأخطاء التي تُفلس المبتدئين." },
    { id: "debt_and_credit", label_ar: "الديون والقروض", scope_ar: "فخ القروض الاستهلاكية، وكيف يستعيد الناس حريتهم المالية." },
    { id: "financial_independence", label_ar: "الاستقلال المالي", scope_ar: "كم يكفي للحرية، وكيف يتقاعد البعض مبكراً." },
    { id: "money_and_psychology", label_ar: "المال والنفس", scope_ar: "لماذا نصرف ما لا نملك، وعلاقتنا العاطفية بالمال." },
    { id: "real_estate", label_ar: "العقار", scope_ar: "السكن مقابل الاستثمار، فقاعات السوق، وحلم البيت في الخليج." },
    { id: "crypto_and_digital_money", label_ar: "العملات الرقمية", scope_ar: "ما وراء الضجيج — فرصة حقيقية أم مقامرة جماعية؟" },
    { id: "income_streams", label_ar: "مصادر الدخل", scope_ar: "بناء دخل إضافي، الدخل السلبي، وأساطير الثراء السريع." },
    { id: "scams_and_fraud", label_ar: "النصب والاحتيال المالي", scope_ar: "كيف يُسرق الناس بذكاء، ومخططات بونزي الحديثة." },
    { id: "consumerism", label_ar: "ثقافة الاستهلاك", scope_ar: "كيف نُدفع للشراء، والمظاهر التي تُفقر صامتةً." },
    { id: "family_and_money", label_ar: "المال والعائلة", scope_ar: "الميراث، نفقات الزواج، وتعليم الأبناء قيمة المال." },
    { id: "economic_literacy", label_ar: "الوعي الاقتصادي", scope_ar: "التضخم والفائدة والاقتصاد العام كما تمسّ جيبك أنت." },
  ],

  // ─── قضايا اجتماعية ────────────────────────────────────────────────────────
  social_issues: [
    { id: "family_and_marriage", label_ar: "الأسرة والزواج", scope_ar: "تحوّلات الزواج والطلاق، وضغوط بناء بيت في زمن صعب." },
    { id: "gender_and_roles", label_ar: "الأدوار والنوع", scope_ar: "تغيّر أدوار الرجل والمرأة، والتوتر بين التقليد والحداثة." },
    { id: "youth_and_generations", label_ar: "الشباب والأجيال", scope_ar: "صراع الأجيال، أحلام الشباب وإحباطاتهم في الخليج." },
    { id: "education_system", label_ar: "منظومة التعليم", scope_ar: "هل يصنع تعليمنا عقولاً أم موظفين، وما يحتاجه فعلاً." },
    { id: "class_and_inequality", label_ar: "الطبقية واللامساواة", scope_ar: "الفجوة بين الناس، الواسطة، والفرص غير المتكافئة." },
    { id: "identity_and_belonging", label_ar: "الهوية والانتماء", scope_ar: "من نحن في عالم متغيّر، وأزمة الانتماء لدى الجيل الجديد." },
    { id: "social_pressure_and_image", label_ar: "ضغط المجتمع والصورة", scope_ar: "ثقل نظرة الناس، السمعة، والعيش لإرضاء الآخرين." },
    { id: "addiction_society", label_ar: "إدمان المجتمع", scope_ar: "المخدّرات، القمار، والشاشات — أوبئة صامتة خلف الأبواب." },
    { id: "crime_and_justice", label_ar: "الجريمة والعدالة", scope_ar: "ما الذي يدفع للجريمة، وهل ينصف القانون فعلاً." },
    { id: "marginalized_voices", label_ar: "أصوات مهمّشة", scope_ar: "من لا يُسمع — العمالة، الأقليات، والفئات المنسية." },
    { id: "tradition_vs_modernity", label_ar: "التقليد والحداثة", scope_ar: "صراع القديم والجديد في القيم والعادات والدين." },
    { id: "mental_health_society", label_ar: "الصحة النفسية المجتمعية", scope_ar: "كيف يتعامل المجتمع مع الألم النفسي، ووصمة طلب المساعدة." },
  ],

  // ─── تقنية ─────────────────────────────────────────────────────────────────
  technology: [
    { id: "artificial_intelligence", label_ar: "الذكاء الاصطناعي", scope_ar: "كيف يغيّر الذكاء الاصطناعي العمل والإبداع والحقيقة — فرصة وتهديد." },
    { id: "social_media_effects", label_ar: "أثر السوشيال ميديا", scope_ar: "كيف تعيد المنصّات تشكيل عقولنا وعلاقاتنا وسياستنا." },
    { id: "privacy_and_surveillance", label_ar: "الخصوصية والمراقبة", scope_ar: "من يراقبنا، كيف تُباع بياناتنا، وثمن 'المجاني'." },
    { id: "attention_economy", label_ar: "اقتصاد الانتباه", scope_ar: "كيف صُمّمت التطبيقات لإدماننا، ومن يربح من وقتنا." },
    { id: "future_of_internet", label_ar: "مستقبل الإنترنت", scope_ar: "الويب القادم، الواقع الافتراضي، وحياة موازية على الشاشة." },
    { id: "automation_and_jobs", label_ar: "الأتمتة والوظائف", scope_ar: "أيّ الأعمال ستختفي، وكيف نستعدّ لزلزال سوق العمل." },
    { id: "tech_giants_power", label_ar: "قوة عمالقة التقنية", scope_ar: "كيف صارت الشركات أقوى من الدول، ومن يحكم العالم الرقمي." },
    { id: "cybersecurity_and_hacking", label_ar: "الأمن السيبراني والاختراق", scope_ar: "حروب الظل الرقمية، سرقة الهويات، وهشاشة ما نعتمد عليه." },
    { id: "biotech_and_human", label_ar: "التقنية الحيوية والإنسان", scope_ar: "تعديل الجينات، الأطراف الذكية، وحدود تطوير البشر." },
    { id: "gaming_and_virtual", label_ar: "الألعاب والعوالم الافتراضية", scope_ar: "كيف صارت الألعاب أكبر صناعة ترفيه، وثقافة جيل كامل." },
    { id: "tech_and_children", label_ar: "التقنية والأطفال", scope_ar: "ماذا تفعل الشاشات بأدمغة الصغار، وتربية في زمن رقمي." },
    { id: "deepfakes_and_truth", label_ar: "التزييف والحقيقة", scope_ar: "حين لا نعود نصدّق أعيننا — التزييف العميق وأزمة الثقة." },
    { id: "creator_economy", label_ar: "اقتصاد صنّاع المحتوى", scope_ar: "كيف صار المحتوى مهنة وثروة، ومن يربح ومن يُستهلك في ماكينة الانتباه." },
    { id: "data_and_algorithms", label_ar: "البيانات والخوارزميات", scope_ar: "من يقرّر ما نراه ونشتريه ونصدّقه — سلطة الخوارزمية الخفية." },
  ],

  // ─── صحة ───────────────────────────────────────────────────────────────────
  health: [
    { id: "nutrition_and_diet", label_ar: "التغذية والحمية", scope_ar: "ما نأكله فعلاً، أساطير الدايت، وعلم الطعام بلا تسويق." },
    { id: "sleep_and_rest", label_ar: "النوم والراحة", scope_ar: "لماذا النوم أهم مما نظن، ووباء الأرق الحديث." },
    { id: "fitness_and_body", label_ar: "اللياقة والجسد", scope_ar: "كيف يعمل الجسد، الحركة كدواء، وأساطير الرياضة." },
    { id: "mental_wellbeing", label_ar: "الصحة الذهنية", scope_ar: "القلق والتوتر والاحتراق — أدوات حقيقية لا شعارات." },
    { id: "chronic_disease", label_ar: "الأمراض المزمنة", scope_ar: "السكري والقلب والسمنة في الخليج — لماذا تنتشر وكيف نوقفها." },
    { id: "longevity", label_ar: "إطالة العمر", scope_ar: "علم العيش أطول وأصحّ، وما بين الحقيقة والوهم." },
    { id: "modern_medicine_limits", label_ar: "حدود الطب الحديث", scope_ar: "ما يعجز عنه الطب، الأدوية الزائدة، والشفاء الحقيقي." },
    { id: "gut_and_microbiome", label_ar: "الأمعاء والميكروبيوم", scope_ar: "العالم الخفي في أجسادنا وأثره على المزاج والمناعة." },
    { id: "addiction_and_substances", label_ar: "الإدمان والمواد", scope_ar: "كيف يختطف الإدمان الجسد، من السكر إلى المخدّرات." },
    { id: "women_and_health", label_ar: "صحة المرأة", scope_ar: "قضايا صحية تخصّ المرأة طالما أُهملت أو طُوّقت بالصمت." },
    { id: "preventive_health", label_ar: "الطب الوقائي", scope_ar: "كيف نمنع المرض قبل وقوعه، والعادات التي تُطيل العمر." },
    { id: "health_myths", label_ar: "خرافات الصحة", scope_ar: "تفنيد ما نصدّقه عن أجسادنا بالعلم لا بالشائعات." },
    { id: "mens_health", label_ar: "صحة الرجل", scope_ar: "قضايا جسدية وذهنية يتجاهلها الرجال طويلاً — الصمت الذي يكلّف غالياً." },
  ],

  // ─── مستقبل واتجاهات ───────────────────────────────────────────────────────
  future: [
    { id: "future_of_humanity", label_ar: "مستقبل الإنسانية", scope_ar: "إلى أين يتجه النوع البشري — تطوّر، اندماج بالآلة، أم انقراض." },
    { id: "ai_futures", label_ar: "مستقبل الذكاء الاصطناعي", scope_ar: "ماذا بعد، وعد ووعيد الذكاء الخارق على العمل والوعي." },
    { id: "future_of_cities", label_ar: "مستقبل المدن", scope_ar: "المدن الذكية، نيوم وأحلام الخليج، والعيش في 2050." },
    { id: "space_colonization", label_ar: "استيطان الفضاء", scope_ar: "هل نصبح كوكبيين، ومن يملك السماء؟" },
    { id: "future_of_money", label_ar: "مستقبل المال", scope_ar: "نهاية النقد، العملات الرقمية للدول، واقتصاد بلا بنوك." },
    { id: "climate_futures", label_ar: "مستقبل المناخ", scope_ar: "سيناريوهات الكوكب القادم، والتكيّف الذي لا مفرّ منه." },
    { id: "future_of_relationships", label_ar: "مستقبل العلاقات", scope_ar: "الحب والزواج والصداقة في زمن الذكاء الاصطناعي والعزلة." },
    { id: "post_oil_gulf", label_ar: "الخليج بعد النفط", scope_ar: "كيف يُعاد اختراع اقتصاد ومجتمع الخليج لما بعد النفط." },
    { id: "longevity_futures", label_ar: "مستقبل العمر", scope_ar: "ماذا لو عشنا 150 عاماً — مجتمع واقتصاد ونفس مختلفة." },
    { id: "future_of_education", label_ar: "مستقبل التعليم", scope_ar: "نهاية المدرسة التقليدية، والتعلّم في عصر المعرفة المجانية." },
    { id: "emerging_risks", label_ar: "مخاطر ناشئة", scope_ar: "تهديدات لا نراها بعد — أوبئة، أسلحة، انهيارات نظامية." },
    { id: "transhumanism", label_ar: "ما بعد الإنسان", scope_ar: "تطوير الجسد والعقل، وحدود ما يجعلنا بشراً." },
    { id: "future_of_war", label_ar: "مستقبل الحرب", scope_ar: "الطائرات المسيّرة، حرب السايبر، والذكاء الاصطناعي على ساحة المعركة — ومن يضغط الزر." },
  ],

  // ─── قصص إنسانية ───────────────────────────────────────────────────────────
  human_stories: [
    { id: "survival_stories", label_ar: "قصص نجاة", scope_ar: "إنسان واجه الموت أو المستحيل وعاد ليروي — والثمن الذي دفعه." },
    { id: "rise_from_nothing", label_ar: "الصعود من الصفر", scope_ar: "من القاع إلى القمة — قصة كفاح تُلهم بصدقها لا بمثاليتها." },
    { id: "fall_from_grace", label_ar: "السقوط من القمة", scope_ar: "كيف يخسر إنسان كل شيء، وما يكشفه السقوط عن الطبيعة البشرية." },
    { id: "transformation_stories", label_ar: "قصص تحوّل", scope_ar: "لحظة غيّرت إنساناً للأبد — توبة، صحوة، أو انكسار خصب." },
    { id: "unsung_heroes", label_ar: "أبطال بلا ضجيج", scope_ar: "من صنع فرقاً في صمت، بعيداً عن الأضواء والشهرة." },
    { id: "extraordinary_ordinary", label_ar: "العادي الاستثنائي", scope_ar: "إنسان عادي عاش تجربة غير عادية تمسّ الجميع." },
    { id: "loss_and_grief", label_ar: "الفقد والحزن", scope_ar: "كيف يعيش الناس بعد فقدٍ يكسر الظهر، ومعنى الاستمرار." },
    { id: "second_chances", label_ar: "الفرص الثانية", scope_ar: "من بدأ من جديد بعد سجن أو مرض أو فشل، والبداية بعد النهاية." },
    { id: "love_and_sacrifice", label_ar: "الحب والتضحية", scope_ar: "قصص حب أو تضحية تكشف أعمق ما في الإنسان." },
    { id: "witness_to_history", label_ar: "شاهد على التاريخ", scope_ar: "من عاش حدثاً تاريخياً من الداخل وحمل ذاكرته." },
    { id: "outsiders_and_rebels", label_ar: "المتمرّدون والغرباء", scope_ar: "من رفض القالب ودفع ثمن أن يكون مختلفاً." },
    { id: "redemption", label_ar: "الخلاص والتكفير", scope_ar: "من أخطأ خطأً فادحاً وأمضى حياته يصلحه." },
  ],

  // ─── نقاشات جدلية ──────────────────────────────────────────────────────────
  controversial: [
    { id: "religion_and_doubt", label_ar: "الدين والشك", scope_ar: "أسئلة الإيمان والشك بنضج واحترام — لا تهجّم ولا تسطيح." },
    { id: "freedom_vs_order", label_ar: "الحرية والنظام", scope_ar: "أين تنتهي حريتي وتبدأ حرية المجتمع — توتر لا نهائي." },
    { id: "tradition_taboos", label_ar: "تابوهات وموروث", scope_ar: "عادة أو محرّم اجتماعي يستحق نقاشاً صريحاً وناضجاً." },
    { id: "moral_dilemmas", label_ar: "معضلات أخلاقية", scope_ar: "مواقف لا إجابة سهلة لها تكشف قيمنا الحقيقية." },
    { id: "gender_debates", label_ar: "جدل الأدوار والنوع", scope_ar: "نقاش هادئ حول أدوار وحقوق وتوقّعات — بمسؤولية لا إثارة." },
    { id: "science_vs_belief", label_ar: "العلم والمعتقد", scope_ar: "حين يصطدم الاكتشاف العلمي بالقناعة الراسخة." },
    { id: "justice_and_punishment", label_ar: "العدالة والعقاب", scope_ar: "ما العدل فعلاً، وهل يصلح العقاب أم ينتقم." },
    { id: "wealth_and_morality", label_ar: "الثروة والأخلاق", scope_ar: "هل الغنى الفاحش عادل، ومن يستحق ماذا." },
    { id: "technology_ethics", label_ar: "أخلاقيات التقنية", scope_ar: "حدود الذكاء الاصطناعي والتعديل الجيني والمراقبة." },
    { id: "censorship_and_speech", label_ar: "الرقابة وحرية القول", scope_ar: "ما الذي يُقال وما يُمنع، ومن يملك حقّ المنع." },
    { id: "identity_politics", label_ar: "سياسات الهوية", scope_ar: "صراع الانتماءات والولاءات في مجتمع متغيّر." },
    { id: "life_and_death_ethics", label_ar: "أخلاقيات الحياة والموت", scope_ar: "الإجهاض، الموت الرحيم، وبداية ونهاية الحياة — بهدوء." },
  ],

  // ─── أسلوب حياة ────────────────────────────────────────────────────────────
  lifestyle: [
    { id: "relationships_daily", label_ar: "العلاقات اليومية", scope_ar: "الصداقة، الجيرة، العائلة — فنّ العيش مع الناس." },
    { id: "modern_dating", label_ar: "العلاقات العاطفية الحديثة", scope_ar: "كيف تغيّر الحب والارتباط في زمن التطبيقات والعزلة." },
    { id: "social_habits", label_ar: "العادات الاجتماعية", scope_ar: "طقوسنا اليومية وما تقوله عنّا — الضيافة، الواجبات، المظاهر." },
    { id: "consumption_and_brands", label_ar: "الاستهلاك والعلامات", scope_ar: "لماذا نشتري ما نشتري، وهويتنا عبر ما نملك." },
    { id: "minimalism_and_meaning", label_ar: "البساطة والمعنى", scope_ar: "العيش بأقل، ومقاومة ثقافة المزيد." },
    { id: "travel_and_places", label_ar: "السفر والأماكن", scope_ar: "كيف يغيّرنا السفر، والمكان كهوية وتجربة." },
    { id: "work_life_balance", label_ar: "توازن العمل والحياة", scope_ar: "ثقافة الإرهاق، والبحث عن حياة لا تُستهلك بالعمل." },
    { id: "digital_lifestyle", label_ar: "الحياة الرقمية", scope_ar: "كيف نعيش بين شاشتين، والاتّصال الدائم وثمنه." },
    { id: "fashion_and_appearance", label_ar: "المظهر والأناقة", scope_ar: "ما نلبسه ونعرضه، والضغط الاجتماعي حول الصورة." },
    { id: "home_and_belonging", label_ar: "البيت والانتماء", scope_ar: "معنى البيت، وكيف يشكّل المكان راحتنا وعلاقاتنا." },
    { id: "rituals_and_celebration", label_ar: "الطقوس والاحتفال", scope_ar: "الأعياد والمناسبات وما تعنيه لنا في زمن متغيّر." },
    { id: "wellness_culture", label_ar: "ثقافة العافية", scope_ar: "موجة العافية والتأمّل والرفاهية — أصيلة أم تسويق؟" },
  ],
}

// ─── Derived lookups ─────────────────────────────────────────────────────────

interface SubcategoryLocation {
  category: SeasonCategoryId
  sub: KnowledgeSubcategory
}

const SUB_BY_ID = new Map<string, SubcategoryLocation>()
for (const cat of SEASON_CATEGORY_IDS as SeasonCategoryId[]) {
  for (const sub of KNOWLEDGE_UNIVERSE[cat]) {
    SUB_BY_ID.set(sub.id, { category: cat, sub })
  }
}

/** Every subcategory id across the whole universe (unique). */
export const ALL_SUBCATEGORY_IDS: readonly string[] = Array.from(SUB_BY_ID.keys())

/** The subcategories for one category (empty array for an unknown category). */
export function subcategoriesFor(category: string | null | undefined): readonly KnowledgeSubcategory[] {
  if (!category) return []
  return KNOWLEDGE_UNIVERSE[category as SeasonCategoryId] ?? []
}

/** Resolve a subcategory id to its {category, sub}, or null. */
export function locateSubcategory(id: string | null | undefined): SubcategoryLocation | null {
  if (!id) return null
  return SUB_BY_ID.get(id.trim().toLowerCase()) ?? null
}

/** Arabic label for a subcategory id (falls back to the raw id). */
export function subcategoryLabel(id: string | null | undefined): string {
  if (!id) return "—"
  return SUB_BY_ID.get(id.trim().toLowerCase())?.sub.label_ar ?? id
}

/**
 * Coerce a free-form model value to a valid subcategory id, optionally checking
 * it belongs to the given category. Tolerant of brackets/quotes/casing and the
 * Arabic label returned instead of the id. Returns null when unrecognized — the
 * caller then leaves subcategory unset rather than inventing one.
 */
export function clampSubcategory(
  value: string | null | undefined,
  category?: string | null,
): string | null {
  if (!value) return null
  const id = value.trim().replace(/^["'[\s]+|["'\]\s]+$/g, "").toLowerCase()
  let hit = SUB_BY_ID.get(id)
  if (!hit) {
    // Try matching by Arabic label within the category (or anywhere).
    const label = value.trim()
    for (const [, loc] of SUB_BY_ID) {
      if (loc.sub.label_ar === label) {
        hit = loc
        break
      }
    }
  }
  if (!hit) return null
  if (category && hit.category !== category) {
    // A real subcategory but mislabeled under the wrong category — accept the
    // subcategory (it's the finer truth) rather than dropping a good signal.
    return hit.sub.id
  }
  return hit.sub.id
}

/** Total subcategory count — used by tests to assert depth (≥ 12 each). */
export function subcategoryCountByCategory(): Record<SeasonCategoryId, number> {
  const out = {} as Record<SeasonCategoryId, number>
  for (const cat of SEASON_CATEGORY_IDS as SeasonCategoryId[]) {
    out[cat] = KNOWLEDGE_UNIVERSE[cat].length
  }
  return out
}
