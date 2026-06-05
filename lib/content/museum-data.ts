export interface MuseumEpisode {
  id: string
  title: string
  guestName: string
  number: string
  quote: string
  description: string
  imageUrl: string
  youtubeUrl: string
  transcript: string
}

export interface MuseumThinker {
  id: string
  name: string
  title: string
  description: string
  imageUrl: string
}

export const MUSEUM_EPISODES: MuseumEpisode[] = [
  {
    id: "ZPeBeS87EeI",
    number: "المعرض ٠١٦",
    title: "الرجل الذي صنع النصر قبل صلاح الدين",
    guestName: "فيصل المحيني",
    quote:
      "من لا يقرأ التاريخ لا يجد التعامل مع الواقع بتاتاً.",
    description:
      "رحلة ملحمية في سيرة نور الدين زنكي، القائد الذي مهّد الطريق لصلاح الدين وحرّر إمارة الرها وأسّس دار العدل، في ثلاث ساعات من الغوص في أعماق التاريخ الإسلامي.",
    imageUrl: "https://img.youtube.com/vi/ZPeBeS87EeI/maxresdefault.jpg",
    youtubeUrl: "https://www.youtube.com/watch?v=ZPeBeS87EeI",
    transcript: "",
  },
  {
    id: "knyKlUZIwYQ",
    number: "المعرض ٠١٨",
    title: "نظرة على عقلية رائد الأعمال",
    guestName: "جاسم الزراعي",
    quote:
      "النجاح ليس له صيغة واحدة، كل شخص لديه طريقة مختلفة.",
    description:
      "جاسم الزراعي يروي قصته من دراسة العمارة في أريزونا إلى ريادة الأعمال في الكويت، ويكشف عن فلسفته في بناء العلاقات والمرونة والتعلم المستمر.",
    imageUrl: "https://img.youtube.com/vi/knyKlUZIwYQ/maxresdefault.jpg",
    youtubeUrl: "https://www.youtube.com/watch?v=knyKlUZIwYQ",
    transcript: "",
  },
  {
    id: "oNyFz82BVzY",
    number: "المعرض ٠١٩",
    title: "قصة لجوء الخطاط السوري حسام مطر",
    guestName: "حسام مطر",
    quote:
      "الشغف والإرادة يمكن أن يفتحا كل الأبواب المغلقة.",
    description:
      "حسام مطر، الخطاط السوري الحائز على جوائز دولية، يروي رحلته من سوريا إلى السويد — من شغف الخط العربي منذ الطفولة إلى الفوز بالميدالية الذهبية، ثم اللجوء وإعادة بناء حياته من الصفر.",
    imageUrl: "https://img.youtube.com/vi/oNyFz82BVzY/maxresdefault.jpg",
    youtubeUrl: "https://www.youtube.com/watch?v=oNyFz82BVzY",
    transcript: "",
  },
]

export const MUSEUM_THINKERS: MuseumThinker[] = [
  {
    id: "g-faisal",
    name: "فيصل المحيني",
    title: "باحث في التاريخ الإسلامي",
    description:
      "يروي قصص الحضارة الإسلامية بعمق وتحليل، ويعيد إحياء شخصيات غيّرت مجرى التاريخ.",
    imageUrl: "https://img.youtube.com/vi/ZPeBeS87EeI/maxresdefault.jpg",
  },
  {
    id: "g-jasem",
    name: "جاسم الزراعي",
    title: "رائد أعمال كويتي",
    description:
      "يحوّل التجارب والإخفاقات إلى دروس حقيقية في ريادة الأعمال وبناء المشاريع.",
    imageUrl: "https://img.youtube.com/vi/knyKlUZIwYQ/maxresdefault.jpg",
  },
]

/** Real quotes from KHAT podcast episodes */
export const MUSEUM_QUOTES: string[] = [
  "من لا يقرأ التاريخ لا يجد التعامل مع الواقع بتاتاً.",
  "النجاح ليس له صيغة واحدة، كل شخص لديه طريقة مختلفة.",
  "الشغف والإرادة يمكن أن يفتحا كل الأبواب المغلقة.",
]
