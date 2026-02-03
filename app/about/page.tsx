import { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Youtube, Twitter, Instagram, Mail } from "lucide-react"

export const metadata: Metadata = {
  title: "عن خط",
  description: "تعرف على بودكاست خط ورسالتنا",
}

const stats = [
  { label: "حلقة", value: "50+" },
  { label: "ضيف", value: "40+" },
  { label: "مستمع", value: "100K+" },
  { label: "موسم", value: "3" },
]

const socialLinks = [
  { name: "YouTube", href: "https://youtube.com/@khat", icon: Youtube },
  { name: "Twitter", href: "https://twitter.com/khat", icon: Twitter },
  { name: "Instagram", href: "https://instagram.com/khat", icon: Instagram },
  { name: "البريد", href: "mailto:hello@khat.fm", icon: Mail },
]

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold">
            <span className="text-primary">خط</span> — حيث تُروى القصص
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            بودكاست عربي يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات
            عميقة مع ضيوف ملهمين من مختلف المجالات.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mission */}
        <div className="mb-12 rounded-xl bg-secondary/50 p-6">
          <h2 className="mb-4 text-xl font-bold">رسالتنا</h2>
          <div className="space-y-4 text-muted-foreground">
            <p>
              نؤمن في خط بأن كل إنسان يحمل قصة تستحق أن تُروى. نسعى لخلق مساحة
              آمنة للحوار العميق والصادق، حيث يمكن للضيوف مشاركة تجاربهم الحقيقية
              بدون أقنعة.
            </p>
            <p>
              هدفنا ليس فقط الترفيه، بل تقديم محتوى يُلهم ويُثري حياة المستمعين.
              نريد أن نساعد الناس على فهم أنفسهم والآخرين بشكل أعمق.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="mb-12">
          <h2 className="mb-6 text-xl font-bold">قيمنا</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4 text-center">
                <span className="text-3xl">🎯</span>
                <h3 className="mt-2 font-semibold">الأصالة</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  محادثات حقيقية بدون تصنع
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <span className="text-3xl">🌱</span>
                <h3 className="mt-2 font-semibold">النمو</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  محتوى يساعد على التطور
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <span className="text-3xl">🤝</span>
                <h3 className="mt-2 font-semibold">المجتمع</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  بناء مجتمع متصل ومتفاعل
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Connect */}
        <div className="text-center">
          <h2 className="mb-4 text-xl font-bold">تواصل معنا</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="gap-2">
                  <link.icon className="h-4 w-4" />
                  {link.name}
                </Button>
              </a>
            ))}
          </div>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/sponsor">
              <Button>كن راعياً</Button>
            </Link>
            <Link href="/guest">
              <Button variant="outline">كن ضيفاً</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
