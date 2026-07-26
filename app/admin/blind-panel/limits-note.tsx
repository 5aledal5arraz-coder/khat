/**
 * The limits, written into the instrument itself.
 *
 * This component exists because a caveat in a report is a caveat nobody reads
 * at the moment it matters. Khaled has to see, WHILE choosing, that (a) the
 * automated suite never measured taste, so these 20 choices are not a
 * tie-breaker on top of a quality score — they are the only reading of it,
 * and (b) 20 pairs is a coarse instrument and a near-even split means exactly
 * nothing.
 *
 * Rendered on the judging screen and again on the results screen. Repetition
 * is intended: the second time it is the thing that stops an 11–9 from being
 * read as a win.
 */

export function LimitsNote({ variant }: { variant: "judging" | "result" }) {
  return (
    <section
      aria-label="حدود القياس"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4"
    >
      <h2 className="mb-2 text-[13px] font-semibold text-amber-700">
        حدود هذا القياس — اقرأها وأنت تحكم
      </h2>
      <ul className="space-y-1.5 text-[13px] leading-relaxed text-foreground/85">
        <li>
          القياسات الحتمية في «مقارنة الموديلات» تقيس{" "}
          <strong className="font-semibold">الالتزام والأمانة</strong> — استخراج
          الحقائق المزروعة، الاستشهاد بالمصادر، ثبات الشكل، الكلفة والزمن. هي{" "}
          <strong className="font-semibold">لا تقيس الجمال ولا الصوت</strong>. لذلك
          هذي اللوحة ليست ترجيحًا فوق درجة جودة — هي القراءة الوحيدة للجودة
          التحريرية.
        </li>
        <li>
          عشرون زوجًا أداة خشنة. مجال الثقة ٩٥٪ عند ٢٠ زوجًا هو{" "}
          <strong className="font-semibold tabular-nums" dir="ltr">
            ±21.9
          </strong>{" "}
          نقطة — يعني نتيجة{" "}
          <strong className="font-semibold tabular-nums" dir="ltr">
            11–9
          </strong>{" "}
          تعني <strong className="font-semibold">لا فرق يمكن قياسه</strong>، مو فوز
          بسيط.
        </li>
        <li>
          الحَكَم النموذجي يُشغَّل هنا{" "}
          <strong className="font-semibold">ليُقاس هو</strong>، ووزنه في القرار{" "}
          <strong className="font-semibold">صفر</strong>. رأيه مخفي عنك حتى تخلص —
          لو شفته قبل، صار القياس «هل تتأثر برأيه» مو «هل يتفق معك».
        </li>
        {variant === "judging" ? (
          <li>
            احكم على النص نفسه فقط. ترتيب A و B عشوائي في كل زوج، والمصدر مخفي —
            ما فيه جانب ثابت.
          </li>
        ) : (
          <li>
            هذي النتيجة تخص{" "}
            <strong className="font-semibold">عناوين وأوصاف الحلقات</strong> فقط —
            أعلى مخرَج قيمةً، وهو ما رُكِّزت عليه الأزواج عمدًا. ما تنسحب على
            استخراج، ولا بحث، ولا اكتشاف ضيوف.
          </li>
        )}
      </ul>
    </section>
  )
}
