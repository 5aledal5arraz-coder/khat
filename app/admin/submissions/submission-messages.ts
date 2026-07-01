/**
 * Submission outreach copy — the Arabic acceptance / rejection / sponsor
 * response / sponsor decline templates, plus the relative-time helper. Pulled
 * out of submissions-tabs.tsx so this content is editable + unit-testable
 * without touching the 3k-line UI component. Pure functions: (name, tone) → text.
 */

import { formatDate } from "@/lib/shared/formatters"

export type MessageTone = "formal" | "warm"

/** Relative Arabic time label ("اليوم" / "أمس" / "منذ N أيام"), falling back to a full date. */
export function timeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "اليوم"
  if (diffDays === 1) return "أمس"
  if (diffDays < 7) return `منذ ${diffDays} أيام`
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسابيع`
  return formatDate(dateString)
}

export function generateAcceptanceMessage(name: string, tone: MessageTone): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا لاهتمامك بالظهور في بودكاست خط.

بعد مراجعة طلبك، نودّ أن نخبرك أن قصتك والأفكار التي شاركتها لفتت انتباهنا بشكل حقيقي.
نؤمن أنك تستطيع إضافة حوار ذي معنى للمساحة التي نبنيها.

يسعدنا استضافتك كضيف في خط.

البودكاست مبني على حوار هادئ وعميق وليس مقابلة تقليدية، فلا حاجة لتحضير مسبق أو إجابات محفوظة — فقط كن على طبيعتك.

في الخطوة القادمة، سنتواصل معك لاختيار موعد تسجيل مناسب ومشاركة جميع التفاصيل المتعلقة بالحلقة والمكان وعملية التسجيل.

نتطلّع للقائك وسماع قصتك.

فريق بودكاست خط`
  }

  return `أهلًا ${name} 👋

وصلنا طلبك — وبصراحة، قصتك لفتت انتباهنا جدًا.

نحب نستضيفك في خط 🎙️

ما تحتاج تجهّز شيء مسبقًا. خط قائم على حوار طبيعي وحقيقي — بس تعال على طبيعتك.

بنتواصل معك قريب نرتّب موعد التسجيل ونشاركك كل التفاصيل.

متحمسين نشوفك ونسمع قصتك.

فريق خط`
}

export function generateRejectionMessage(name: string, tone: MessageTone): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا جزيلاً لاهتمامك بالظهور في بودكاست خط ولتخصيصك الوقت لمشاركة قصتك معنا.

نراجع بعناية كل طلب يصلنا. في الوقت الحالي، لن نتمكن من المضي قدمًا في استضافتك في حلقة قادمة. هذا لا يعكس قيمة تجربتك، بل يتعلق بالاتجاه والمواضيع التي نخطط لها حاليًا في حواراتنا القادمة.

نقدّر حقًا جهدك وانفتاحك في الكتابة إلينا، ونشكرك على تفكيرك في أن تكون جزءًا من خط.

نتمنى لك كل التوفيق ونأمل أن تتقاطع دروبنا في المستقبل.

فريق بودكاست خط`
  }

  return `أهلًا ${name}،

شكرًا من قلب إنك تواصلت مع خط — نقدّر جدًا إنك شاركتنا قصتك.

بعد مراجعة دقيقة، ما بنقدر نمضي قدام بالاستضافة حاليًا. الموضوع ما له علاقة فيك أو بتجربتك — بل بالمواضيع المحددة اللي نشتغل عليها الحين.

نقدّر اهتمامك بشكل حقيقي، ومن يدري — يمكن دروبنا تتقاطع في المستقبل.

نتمنى لك كل التوفيق.

فريق خط`
}

export function generateSponsorResponseMessage(name: string, tone: MessageTone): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا لاهتمامكم بالشراكة مع بودكاست خط.

راجعنا طلبكم بعناية، ويسعدنا إبلاغكم أننا مهتمون بالتعاون معكم.

سنعمل على إعداد مقترح شراكة يناسب أهدافكم وسنشاركه معكم قريبًا.

في حال وجود أي استفسارات، لا تترددوا بالتواصل معنا.

فريق بودكاست خط`
  }

  return `أهلًا ${name} 👋

شكرًا على اهتمامكم بخط — وصلنا طلبكم وراجعناه.

الصراحة، نشوف إن في فرصة حلوة نتعاون مع بعض 🤝

بنجهّز لكم مقترح شراكة يناسب أهدافكم ونرسله قريب.

لو عندكم أي سؤال، كلّمونا مباشرة.

فريق خط`
}

export function generateSponsorDeclineMessage(name: string, tone: MessageTone): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا جزيلاً لاهتمامكم بالشراكة مع بودكاست خط ولتخصيصكم الوقت لإرسال طلبكم.

بعد مراجعة دقيقة، لن نتمكن حاليًا من المضي في هذه الشراكة. يتعلق الأمر باتجاهنا الحالي وخطط المحتوى القادمة.

نقدّر اهتمامكم ونتمنى أن تتاح لنا فرصة للتعاون في المستقبل.

فريق بودكاست خط`
  }

  return `أهلًا ${name}،

شكرًا إنكم تواصلتم مع خط — نقدّر اهتمامكم بشكل حقيقي.

حاليًا، ما بنقدر نمضي بالشراكة — الموضوع مرتبط بخططنا الحالية وليس بجودة عرضكم.

نتمنى إن دروبنا تتقاطع في المستقبل، وما نقفل الباب أبد.

فريق خط`
}
