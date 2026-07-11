/**
 * Benchmark fixtures — deterministic Arabic workloads with PLANTED,
 * programmatically-checkable facts.
 *
 * Everything here is synthetic (no real episode data, no PII) but shaped
 * like the real pipeline inputs: an Arabic podcast transcript with
 * speaker turns, a long document for context-window stress, a discovery
 * topic, and research source snippets. Facts are planted at known
 * positions so extraction and long-context tasks are graded by exact
 * matching, not by another model's opinion.
 *
 * DO NOT edit casually: grading in scoring.ts depends on these exact
 * strings. Any change requires bumping SUITE_VERSION in run.ts (old
 * scorecards stay comparable within their own suite_version).
 */

// ─── Medium transcript (~7k chars) — extraction + editorial input ───────────

export const GUEST_NAME = "د. سالم الراشد"

/** Verbatim quotes planted in the transcript — extraction must return them. */
export const PLANTED_QUOTES = [
  "النجاح في البودكاست لا يأتي من الخوارزمية بل من الصدق مع المستمع",
  "أكبر خطأ يرتكبه صانع المحتوى هو أن يقلد صوت غيره وينسى صوته",
  "المحتوى العربي لا ينقصه الجمهور، ينقصه الاحترام لذكاء الجمهور",
] as const

const SEGMENTS: readonly string[] = [
  "بدأت رحلتي مع صناعة المحتوى قبل عشر سنوات تقريباً، حين كانت المنصات العربية في بداياتها، ولم يكن أحد يتوقع أن يتحول الصوت إلى صناعة قائمة بذاتها. كنا نسجل بميكروفونات بسيطة في غرف غير معزولة، لكن الفكرة كانت أقوى من الأدوات.",
  "التحدي الحقيقي في المحتوى الحواري ليس في طرح الأسئلة، بل في الإصغاء. المقدم الذي يستمع جيداً يكتشف اللحظة التي يقول فيها الضيف شيئاً لم يقله من قبل لأي أحد، وهذه اللحظات هي التي تصنع الحلقات الخالدة.",
  "حين ننظر إلى أرقام الاستماع في العالم العربي نجد نمواً سنوياً مضطرداً، لكن الأهم من الأرقام هو تغير نوعية الاستماع: الجمهور اليوم يبحث عن العمق، ويهرب من المحتوى السطحي المعاد المكرر.",
  "الإنتاج الجيد ليس ترفاً. الفرق بين حلقة تسمعها حتى النهاية وحلقة تغلقها بعد خمس دقائق يكمن غالباً في تفاصيل لا يراها المستمع: هندسة الصوت، وإيقاع الحوار، والقطع الذكي الذي يحذف الحشو ويبقي الجوهر.",
  "سألتني مرة صحفية: لماذا ينجح بودكاست وتفشل مئات؟ قلت لها إن السر في الاستمرارية المقرونة بالتطور. من يكرر نفسه كل أسبوع يستنزف جمهوره، ومن يتوقف كل شهرين يفقد ثقتهم.",
  "العلاقة مع الضيف تبدأ قبل التسجيل بأسابيع. البحث الجيد يجعل الضيف يشعر أنك تعرف مشروعه أكثر من بعض زملائه، وعندها فقط يمنحك ما لا يمنحه لغيرك من اللقاءات السريعة.",
  "أعتقد أن الذكاء الاصطناعي سيغير صناعة الصوت من جذورها، ليس بأن يحل محل المقدمين، بل بأن يرفع سقف المتوقع: التفريغ الفوري، والترجمة، واكتشاف اللحظات المهمة آلياً ستصبح حداً أدنى لا ميزة تنافسية.",
  "التمويل في صناعة البودكاست العربي ما زال في طور التشكل. الرعايات تأتي وتذهب، لكن النموذج المستدام يبنى على تعدد المصادر: اشتراكات، وفعاليات حية، ومحتوى متخصص للشركات.",
] as const

/** ~7k-char transcript: alternating host/guest turns + planted quotes. */
export function buildMediumTranscript(): string {
  const lines: string[] = [
    `المقدم: أهلاً بكم في حلقة جديدة، ضيفنا اليوم ${GUEST_NAME}، خبير صناعة المحتوى الصوتي.`,
    `${GUEST_NAME}: شكراً على الاستضافة، سعيد بوجودي معكم.`,
  ]
  SEGMENTS.forEach((seg, i) => {
    lines.push(`المقدم: ${QUESTIONS[i % QUESTIONS.length]}`)
    lines.push(`${GUEST_NAME}: ${seg}`)
    // Plant the quotes verbatim after segments 1, 3, 5.
    if (i === 1) lines.push(`${GUEST_NAME}: وأقولها بوضوح: ${PLANTED_QUOTES[0]}.`)
    if (i === 3) lines.push(`${GUEST_NAME}: ${PLANTED_QUOTES[1]}.`)
    if (i === 5) lines.push(`${GUEST_NAME}: ولذلك أكرر دائماً أن ${PLANTED_QUOTES[2]}.`)
  })
  // Second pass: follow-ups revisiting the same themes — pads the
  // transcript to a realistic episode length without new fact surface.
  SEGMENTS.forEach((seg, i) => {
    lines.push(`المقدم: لو عدنا لما قلته قبل قليل — ${QUESTIONS[(i + 3) % QUESTIONS.length]}`)
    lines.push(
      `${GUEST_NAME}: أضيف على ما سبق أن الفكرة نفسها تتعمق مع التجربة. ${seg}`,
    )
  })
  lines.push("المقدم: كلام جميل. شكراً جزيلاً لك على هذا الحوار الثري.")
  return lines.join("\n\n")
}

const QUESTIONS: readonly string[] = [
  "حدثنا عن بداياتك مع صناعة المحتوى الصوتي.",
  "ما الذي يميز الحوار العميق عن اللقاء العابر برأيك؟",
  "كيف تقرأ أرقام الاستماع في المنطقة اليوم؟",
  "ما دور الإنتاج في نجاح الحلقة؟",
  "لماذا تنجح برامج وتفشل أخرى؟",
  "كيف تبني علاقة ثقة مع ضيوفك؟",
  "كيف سيغير الذكاء الاصطناعي هذه الصناعة؟",
  "ماذا عن الاستدامة المالية لصناع البودكاست؟",
] as const

// ─── Long document (~35k chars) — long-context needles ──────────────────────

export interface Needle {
  id: string
  /** The sentence planted into the document. */
  text: string
  question: string
  /** Grading: answer must contain this (digits normalized). */
  expected: string
  kind: "number" | "string"
}

export const NEEDLES: readonly Needle[] = [
  {
    id: "n1",
    text: "وللتوثيق: الرقم المرجعي لمخطط الموسم التجريبي هو 4721.",
    question: "ما الرقم المرجعي لمخطط الموسم التجريبي؟",
    expected: "4721",
    kind: "number",
  },
  {
    id: "n2",
    text: "عُقد الاجتماع التأسيسي لفريق الإنتاج في مدينة سالمية الاستوديوهات القديمة.",
    question: "في أي مدينة عُقد الاجتماع التأسيسي لفريق الإنتاج؟",
    expected: "سالمية",
    kind: "string",
  },
  {
    id: "n3",
    text: "بلغت مدة أطول حلقة منشورة في الأرشيف 187 دقيقة كاملة.",
    question: "كم دقيقة بلغت مدة أطول حلقة منشورة في الأرشيف؟",
    expected: "187",
    kind: "number",
  },
  {
    id: "n4",
    text: "اختار الفريق اسم «مشروع السنونو» رمزاً داخلياً لخطة التوسع الإقليمي.",
    question: "ما الاسم الرمزي الداخلي لخطة التوسع الإقليمي؟",
    expected: "السنونو",
    kind: "string",
  },
  {
    id: "n5",
    text: "خُصصت ميزانية قدرها 5390 ديناراً لتجهيز غرفة التسجيل الثانية.",
    question: "كم ديناراً خُصص لتجهيز غرفة التسجيل الثانية؟",
    expected: "5390",
    kind: "number",
  },
] as const

export const ORDER_QUESTION = {
  question:
    "أيهما ورد أولاً في الوثيقة: ذكر «مشروع السنونو» أم ذكر ميزانية غرفة التسجيل الثانية؟ أجب بواحدة فقط: «مشروع السنونو» أو «الميزانية».",
  /** n4 is planted before n5 (fractions 0.7 vs 0.9). */
  expected: "السنونو",
} as const

/**
 * ~35k chars: segments repeated with varying framing, needles planted at
 * ~10%/30%/50%/70%/90% document positions. Deterministic — no RNG.
 */
export function buildLongDocument(targetChars = 35_000): string {
  const parts: string[] = []
  let i = 0
  while (parts.join("\n\n").length < targetChars) {
    const seg = SEGMENTS[i % SEGMENTS.length]
    parts.push(`فقرة ${i + 1}: ${seg}`)
    i += 1
  }
  const doc = parts
  const at = (frac: number) => Math.min(doc.length - 1, Math.max(0, Math.round(frac * doc.length)))
  // Insert in descending position order so earlier indices stay valid.
  const placements: Array<[number, string]> = [
    [at(0.9), NEEDLES[4].text],
    [at(0.7), NEEDLES[3].text],
    [at(0.5), NEEDLES[2].text],
    [at(0.3), NEEDLES[1].text],
    [at(0.1), NEEDLES[0].text],
  ]
  for (const [idx, text] of placements) {
    doc.splice(idx, 0, text)
  }
  return doc.join("\n\n")
}

// ─── Discovery + research fixtures ───────────────────────────────────────────

export const DISCOVERY_TOPIC =
  "مستقبل ريادة الأعمال التقنية في الخليج: من الفكرة إلى التوسع الإقليمي"

export interface ResearchSnippet {
  id: string
  text: string
}

export const RESEARCH_SNIPPETS: readonly ResearchSnippet[] = [
  {
    id: "S1",
    text: "تشير تقارير قطاع الاستثمار الجريء في المنطقة إلى تحول رؤوس الأموال نحو الشركات الناشئة في التقنية المالية والخدمات اللوجستية، مع تراجع نسبي في تمويل تطبيقات التواصل.",
  },
  {
    id: "S2",
    text: "أطلقت عدة حكومات خليجية برامج إقامة لرواد الأعمال وتسهيلات لتأسيس الشركات خلال أيام بدلاً من أسابيع، في سباق واضح على استقطاب المؤسسين الإقليميين.",
  },
  {
    id: "S3",
    text: "يواجه المؤسسون تحدياً متكرراً في التوظيف التقني: المواهب المحلية المتخصصة نادرة، والاستقدام مكلف، مما يدفع كثيراً من الشركات إلى فرق موزعة بين ثلاث دول أو أكثر.",
  },
  {
    id: "S4",
    text: "رغم وفرة التمويل التأسيسي، تبقى جولات النمو المتأخرة (السلسلة ب وما بعدها) نادرة إقليمياً، ويضطر كثير من المؤسسين إلى البحث عنها خارج المنطقة أو تأجيل التوسع.",
  },
] as const
