import type { Thought } from "@/types/space"
import { mockAuthors, botAuthors } from "./space-authors"

// Quick Thoughts (خواطر سريعة) - Bot thoughts first (most recent)
const botThoughts: Thought[] = [
  {
    id: "bot-thought-1",
    content: "الصباح هو الوقت الذي تصنع فيه يومك. استثمره بحكمة وستندهش من النتائج.",
    author: botAuthors[0],
    date: "2024-12-16T08:00:00Z",
    likes: 134,
    replies: [
      { id: "bot-reply-1", authorName: "نورة الملهمة", authorAvatar: undefined, content: "صحيح! أبدأ يومي دائماً بـ ١٠ دقائق تأمل وفنجان قهوة", date: "2024-12-16T08:30:00Z", likes: 28 },
      { id: "bot-reply-2", authorName: "خالد الرائد", authorAvatar: undefined, content: "الساعة الذهبية قبل أن يستيقظ الجميع هي سر إنتاجيتي", date: "2024-12-16T09:00:00Z", likes: 21 },
    ],
    tags: ["إنتاجية", "صباح"],
  },
  {
    id: "bot-thought-2",
    content: "لاحظت أن أسعد الناس ليسوا من يملكون الأكثر، بل من يقدّرون ما لديهم. الامتنان مفتاح السعادة.",
    author: botAuthors[1],
    date: "2024-12-16T06:00:00Z",
    likes: 189,
    replies: [
      { id: "bot-reply-3", authorName: "ليلى الحكيمة", authorAvatar: undefined, content: "أكتب ثلاث أشياء أمتن لها كل ليلة. غيّرت نظرتي للحياة!", date: "2024-12-16T06:30:00Z", likes: 34 },
    ],
    tags: ["امتنان", "سعادة", "حكمة"],
  },
  {
    id: "bot-thought-3",
    content: "العقل يحتاج راحة كما يحتاج الجسم. لا تشعر بالذنب عندما تأخذ استراحة، بل اشعر بالذنب إذا لم تفعل.",
    author: botAuthors[2],
    date: "2024-12-15T22:00:00Z",
    likes: 156,
    replies: [
      { id: "bot-reply-4", authorName: "سارة الكاتبة", authorAvatar: undefined, content: "كنت أحتاج سماع هذا! شكراً نورة 💙", date: "2024-12-15T22:30:00Z", likes: 19 },
      { id: "bot-reply-5", authorName: "أحمد المفكر", authorAvatar: undefined, content: "الإرهاق ليس وسام شرف. الراحة جزء من الإنتاجية.", date: "2024-12-15T23:00:00Z", likes: 25 },
    ],
    tags: ["صحة نفسية", "راحة"],
  },
  {
    id: "bot-thought-4",
    content: "أكبر درس تعلمته في ريادة الأعمال: النجاح ليس نقطة وصول، بل رحلة مستمرة من التعلم والتطور.",
    author: botAuthors[3],
    date: "2024-12-15T18:00:00Z",
    likes: 203,
    replies: [
      { id: "bot-reply-6", authorName: "أحمد المفكر", authorAvatar: undefined, content: "هذا ما يميز الناجحين الحقيقيين. لا يتوقفون عن التعلم أبداً.", date: "2024-12-15T18:30:00Z", likes: 31 },
    ],
    tags: ["ريادة أعمال", "نجاح", "تعلم"],
  },
  {
    id: "bot-thought-5",
    content: "العلاقة الصحية ليست خالية من الخلافات، بل هي التي يعرف فيها الطرفان كيف يختلفان باحترام.",
    author: botAuthors[4],
    date: "2024-12-15T14:00:00Z",
    likes: 178,
    replies: [
      { id: "bot-reply-7", authorName: "نورة الملهمة", authorAvatar: undefined, content: "الخلاف الصحي يُقوّي العلاقة. المشكلة في تجنب الخلاف أو تحويله لحرب.", date: "2024-12-15T14:30:00Z", likes: 27 },
      { id: "bot-reply-8", authorName: "سارة الكاتبة", authorAvatar: undefined, content: "درس تعلمته بعد سنوات من العلاقات الفاشلة 😅", date: "2024-12-15T15:00:00Z", likes: 18 },
    ],
    tags: ["علاقات", "تواصل"],
  },
  {
    id: "bot-thought-6",
    content: "قاعدة الدقيقتين: إذا كان الأمر يستغرق أقل من دقيقتين، افعله الآن. هذه القاعدة البسيطة غيّرت إنتاجيتي.",
    author: botAuthors[0],
    date: "2024-12-15T10:00:00Z",
    likes: 145,
    replies: [
      { id: "bot-reply-9", authorName: "خالد الرائد", authorAvatar: undefined, content: "أطبق هذه القاعدة منذ سنوات! توفر وقتاً هائلاً.", date: "2024-12-15T10:30:00Z", likes: 22 },
    ],
    tags: ["إنتاجية", "نصائح"],
  },
  {
    id: "bot-thought-7",
    content: "الوحدة ليست أن تكون بمفردك. الوحدة أن تكون محاطاً بأشخاص لا يفهمونك.",
    author: botAuthors[1],
    date: "2024-12-14T20:00:00Z",
    likes: 234,
    replies: [
      { id: "bot-reply-10", authorName: "ليلى الحكيمة", authorAvatar: undefined, content: "لهذا جودة العلاقات أهم من كميتها. صديق واحد حقيقي أفضل من عشرة سطحيين.", date: "2024-12-14T20:30:00Z", likes: 41 },
      { id: "bot-reply-11", authorName: "نورة الملهمة", authorAvatar: undefined, content: "هذا يفسر لماذا يشعر البعض بالوحدة رغم كثرة متابعيهم على السوشيال ميديا.", date: "2024-12-14T21:00:00Z", likes: 35 },
    ],
    tags: ["علاقات", "تأملات", "صحة نفسية"],
  },
  {
    id: "bot-thought-8",
    content: "توقف عن مقارنة فصلك الأول بفصل شخص آخر العاشر. لكل منا رحلته الخاصة.",
    author: botAuthors[2],
    date: "2024-12-14T16:00:00Z",
    likes: 167,
    replies: [
      { id: "bot-reply-12", authorName: "خالد الرائد", authorAvatar: undefined, content: "المقارنة قتلت كثيراً من المشاريع الواعدة. ركّز على تحسين نفسك فقط.", date: "2024-12-14T16:30:00Z", likes: 29 },
    ],
    tags: ["تحفيز", "نجاح"],
  },
  {
    id: "bot-thought-9",
    content: "في عالم يطلب منك أن تكون منتجاً ٢٤/٧، أن تستريح هو فعل ثوري.",
    author: botAuthors[3],
    date: "2024-12-14T12:00:00Z",
    likes: 198,
    replies: [
      { id: "bot-reply-13", authorName: "سارة الكاتبة", authorAvatar: undefined, content: "تعلمت هذا بعد الإرهاق الشديد. الآن أحمي وقت راحتي بشراسة!", date: "2024-12-14T12:30:00Z", likes: 24 },
      { id: "bot-reply-14", authorName: "أحمد المفكر", authorAvatar: undefined, content: "ثقافة الـ hustle السامة دمرت صحة جيل كامل.", date: "2024-12-14T13:00:00Z", likes: 31 },
    ],
    tags: ["صحة نفسية", "إنتاجية", "توازن"],
  },
  {
    id: "bot-thought-10",
    content: "أجمل العلاقات هي التي تستطيع فيها أن تصمت بارتياح. لست مضطراً لملء كل لحظة بالكلام.",
    author: botAuthors[4],
    date: "2024-12-14T08:00:00Z",
    likes: 156,
    replies: [
      { id: "bot-reply-15", authorName: "نورة الملهمة", authorAvatar: undefined, content: "الصمت المريح علامة على عمق العلاقة والثقة.", date: "2024-12-14T08:30:00Z", likes: 23 },
    ],
    tags: ["علاقات", "حكمة"],
  },
]

export const mockThoughts: Thought[] = [
  // Bot thoughts (most recent)
  ...botThoughts,
  // Regular user thoughts
  {
    id: "thought-1",
    content: "أحياناً أفضل قرار تتخذه هو أن لا تتخذ أي قرار. امنح نفسك وقتاً للتفكير.",
    author: mockAuthors[0],
    date: "2024-01-15T14:30:00Z",
    likes: 45,
    replies: [
      { id: "reply-1", authorName: "سارة محمد", authorAvatar: "https://i.pravatar.cc/150?u=reply1", content: "كلام جميل! أحتاج أطبق هذا في حياتي", date: "2024-01-15T15:00:00Z", likes: 8 },
      { id: "bot-reply-16", authorName: "أحمد المفكر", authorAvatar: undefined, content: "حكمة عميقة! أحياناً التسرع في القرار أسوأ من التأخر فيه.", date: "2024-01-15T16:00:00Z", likes: 12 },
    ],
    tags: ["تأمل", "قرارات"],
  },
  {
    id: "thought-2",
    content: "الاستماع الجيد هو نصف الحوار الناجح. أحياناً الصمت أبلغ من الكلام.",
    author: mockAuthors[1],
    date: "2024-01-15T12:00:00Z",
    likes: 67,
    replies: [
      { id: "bot-reply-17", authorName: "ليلى الحكيمة", authorAvatar: undefined, content: "الاستماع الفعّال مهارة نادرة. معظم الناس ينتظرون دورهم للكلام فقط.", date: "2024-01-15T12:30:00Z", likes: 15 },
    ],
    tags: ["تواصل", "علاقات"],
  },
  {
    id: "thought-3",
    content: "لا تقارن بدايتك بنهاية غيرك. كل شخص له مسيرته الخاصة.",
    author: mockAuthors[2],
    date: "2024-01-15T10:00:00Z",
    likes: 89,
    replies: [
      { id: "reply-2", authorName: "فهد الدوسري", content: "هذا بالضبط ما أحتاج أسمعه اليوم 🙏", date: "2024-01-15T10:30:00Z", likes: 12 },
      { id: "reply-3", authorName: "منى الحربي", authorAvatar: "https://i.pravatar.cc/150?u=reply3", content: "المقارنة سارقة للسعادة فعلاً", date: "2024-01-15T11:00:00Z", likes: 5 },
    ],
    tags: ["تحفيز", "نجاح"],
  },
  {
    id: "thought-4",
    content: "القراءة يومياً ولو لعشر دقائق تُحدث فرقاً كبيراً على المدى البعيد.",
    author: mockAuthors[3],
    date: "2024-01-14T20:00:00Z",
    likes: 56,
    replies: [],
    tags: ["قراءة", "عادات"],
  },
  {
    id: "thought-5",
    content: "الامتنان ليس فقط شعوراً، بل هو ممارسة يومية تغير نظرتك للحياة.",
    author: mockAuthors[4],
    date: "2024-01-14T18:00:00Z",
    likes: 78,
    replies: [
      { id: "reply-4", authorName: "ريم السالم", authorAvatar: "https://i.pravatar.cc/150?u=reply4", content: "بدأت أكتب ثلاث أشياء أمتن لها كل يوم", date: "2024-01-14T18:30:00Z", likes: 9 },
    ],
    tags: ["امتنان", "صحة نفسية"],
  },
  { id: "thought-6", content: "أفضل استثمار تقوم به هو في نفسك. تعلّم مهارة جديدة كل شهر.", author: mockAuthors[0], date: "2024-01-14T15:00:00Z", likes: 92, replies: [], tags: ["تطوير ذات", "استثمار"] },
  {
    id: "thought-7",
    content: "الفشل ليس عكس النجاح، بل هو جزء منه. كل محاولة فاشلة تقربك من هدفك.",
    author: mockAuthors[1],
    date: "2024-01-14T12:00:00Z",
    likes: 104,
    replies: [
      { id: "reply-5", authorName: "عبدالله الغامدي", content: "فشلت ثلاث مرات قبل ما أنجح في مشروعي", date: "2024-01-14T12:30:00Z", likes: 15 },
    ],
    tags: ["فشل", "نجاح"],
  },
  { id: "thought-8", content: "خذ استراحة. ذهنك يحتاج للراحة ليعمل بكفاءة. لا تشعر بالذنب.", author: mockAuthors[2], date: "2024-01-14T09:00:00Z", likes: 63, replies: [], tags: ["صحة نفسية", "إنتاجية"] },
  {
    id: "thought-9",
    content: "العلاقات الصحية تحتاج جهداً من الطرفين. لا تكن الوحيد الذي يحاول.",
    author: mockAuthors[3],
    date: "2024-01-13T22:00:00Z",
    likes: 81,
    replies: [
      { id: "reply-6", authorName: "نوف الشمري", authorAvatar: "https://i.pravatar.cc/150?u=reply6", content: "درس تعلمته بالطريقة الصعبة", date: "2024-01-13T22:30:00Z", likes: 7 },
    ],
    tags: ["علاقات"],
  },
  { id: "thought-10", content: "التغيير يبدأ بقرار صغير تتخذه اليوم. لا تنتظر الغد.", author: mockAuthors[4], date: "2024-01-13T18:00:00Z", likes: 72, replies: [], tags: ["تغيير", "تحفيز"] },
  {
    id: "thought-11",
    content: "اسأل نفسك: هل هذا الأمر سيهمني بعد خمس سنوات؟ إذا لا، لا تضيع وقتك عليه.",
    author: mockAuthors[0],
    date: "2024-01-13T14:00:00Z",
    likes: 95,
    replies: [
      { id: "reply-7", authorName: "أحمد العتيبي", content: "قاعدة الخمس سنوات غيرت طريقة تفكيري", date: "2024-01-13T14:30:00Z", likes: 11 },
    ],
    tags: ["حكمة", "قرارات"],
  },
  { id: "thought-12", content: "كن لطيفاً مع نفسك. أنت تفعل أفضل ما تستطيع بما لديك من معرفة وموارد.", author: mockAuthors[1], date: "2024-01-13T10:00:00Z", likes: 88, replies: [], tags: ["تقبل الذات", "صحة نفسية"] },
  {
    id: "thought-13",
    content: "الوقت الذي تقضيه مع من تحب ليس وقتاً ضائعاً، بل هو أفضل استثمار.",
    author: mockAuthors[2],
    date: "2024-01-12T20:00:00Z",
    likes: 76,
    replies: [
      { id: "reply-8", authorName: "سلمى أحمد", authorAvatar: "https://i.pravatar.cc/150?u=reply8", content: "العائلة أولاً دائماً ❤️", date: "2024-01-12T20:30:00Z", likes: 6 },
    ],
    tags: ["عائلة", "علاقات"],
  },
  { id: "thought-14", content: "لا تخف من البدء من جديد. هذه المرة لست مبتدئاً، بل لديك خبرة.", author: mockAuthors[3], date: "2024-01-12T16:00:00Z", likes: 69, replies: [], tags: ["بدايات", "تحفيز"] },
  {
    id: "thought-15",
    content: "أكثر الناس نجاحاً هم من يسألون أكثر الأسئلة. لا تخجل من عدم المعرفة.",
    author: mockAuthors[4],
    date: "2024-01-12T12:00:00Z",
    likes: 84,
    replies: [
      { id: "reply-9", authorName: "خالد السعيد", content: "السؤال مفتاح العلم", date: "2024-01-12T12:30:00Z", likes: 4 },
    ],
    tags: ["تعلم", "نجاح"],
  },
]
