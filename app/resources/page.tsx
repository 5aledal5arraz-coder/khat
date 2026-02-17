import { Metadata } from "next"
import { ResourcesClient, type Resource } from "./resources-client"

export const metadata: Metadata = {
  title: "الموارد",
  description: "كتب وروابط مذكورة في حلقات خط",
}

const mockResources: Resource[] = [
  {
    id: "1",
    title: "لغات الحب الخمس",
    author: "غاري تشابمان",
    type: "book",
    url: "https://example.com/book1",
    episodes: ["كيف نبني علاقات صحية ومستدامة؟"],
    topics: ["علاقات"],
  },
  {
    id: "2",
    title: "من الصفر إلى الواحد",
    author: "بيتر ثيل",
    type: "book",
    url: "https://example.com/book2",
    episodes: ["رحلة ريادة الأعمال"],
    topics: ["ريادة أعمال"],
  },
  {
    id: "3",
    title: "قوة الآن",
    author: "إيكهارت تول",
    type: "book",
    url: "https://example.com/book3",
    episodes: ["اكتشاف الذات", "التعامل مع القلق"],
    topics: ["تطوير ذات", "صحة نفسية"],
  },
  {
    id: "4",
    title: "العادات الذرية",
    author: "جيمس كلير",
    type: "book",
    url: "https://example.com/book4",
    episodes: ["بناء العادات الإيجابية"],
    topics: ["تطوير ذات"],
  },
  {
    id: "5",
    title: "مقال: فن الاستماع الفعال",
    author: "Harvard Business Review",
    type: "article",
    url: "https://example.com/article1",
    episodes: ["التواصل في العلاقات"],
    topics: ["علاقات", "تواصل"],
  },
  {
    id: "6",
    title: "فكر ببطء، قرر بسرعة",
    author: "دانيال كانمان",
    type: "book",
    url: "https://example.com/book5",
    episodes: ["اتخاذ القرارات"],
    topics: ["تفكير", "قرارات"],
  },
]

export default function ResourcesPage() {
  return <ResourcesClient resources={mockResources} />
}
