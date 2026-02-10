"use client"

import type { MediaKitConfig, AnalyticsConfig } from "@/types/ads"

function formatNumber(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`
  return n.toLocaleString()
}

export function MediaKitView({
  mediaKit,
  analytics,
}: {
  mediaKit: MediaKitConfig
  analytics: AnalyticsConfig
}) {
  const totalReach =
    analytics.youtube.followers +
    analytics.instagram.followers +
    analytics.tiktok.followers +
    analytics.x.followers

  const valuesAr = (mediaKit.values_ar || "").split("·").map((v) => v.trim())
  const valuesEn = (mediaKit.values_en || "").split("·").map((v) => v.trim())

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#0a0a0a] text-[#e8e4dd]"
      style={{ fontFamily: "'IBM Plex Sans Arabic', -apple-system, sans-serif" }}
    >
      {/* Cover */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-8 py-20 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_45%,rgba(201,168,76,0.08)_0%,transparent_70%)]" />
        <div className="pointer-events-none absolute right-10 top-10 h-20 w-20 border-r border-t border-[#8b7a3e]/40" />
        <div className="pointer-events-none absolute bottom-16 left-10 h-20 w-20 border-b border-l border-[#8b7a3e]/40" />

        <div className="relative z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="KHAT"
            className="mx-auto mb-10 h-[90px] w-[90px] rounded-[22px] border border-[#333] shadow-[0_0_60px_rgba(201,168,76,0.12)]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          <h1 className="text-[52px] font-bold leading-tight text-[#f5f2ed]">بودكاست خط</h1>
          <p className="mt-2 text-base font-light tracking-[10px] text-[#c9a84c]" dir="ltr">
            KHAT PODCAST
          </p>
          <div className="mx-auto my-12 h-[60px] w-px bg-gradient-to-b from-transparent via-[#c9a84c] to-transparent" />
          <p className="text-[22px] font-light tracking-[6px] text-[#c9a84c]">ملف الشراكة</p>
          <p className="mt-2 text-[11px] font-light tracking-[8px] uppercase text-[#6b6560]" dir="ltr">
            PARTNERSHIP PROFILE
          </p>
        </div>
      </section>

      {/* About */}
      <SectionDivider number="01" titleAr="عن خط" titleEn="ABOUT KHAT" />
      <ContentSection labelAr="عن خط" labelEn="ABOUT KHAT">
        <BilingualBlock ar={mediaKit.podcastDescription_ar} en={mediaKit.podcastDescription_en} />
        <BilingualBlock
          titleAr="أسلوب التقديم"
          titleEn="PRESENTATION"
          ar={mediaKit.hostDescription_ar}
          en={mediaKit.hostDescription_en}
        />
      </ContentSection>

      {/* Vision & Values */}
      <SectionDivider number="02" titleAr="الرؤية والقيم" titleEn="VISION & VALUES" />
      <ContentSection labelAr="الرؤية" labelEn="VISION">
        <BilingualBlock ar={mediaKit.vision_ar} en={mediaKit.vision_en} />
        <div>
          <h4 className="mb-6 text-[13px] font-semibold tracking-[1px] text-[#c9a84c]">
            القيم &nbsp;/&nbsp; VALUES
          </h4>
          <div className="grid grid-cols-2 gap-px border border-[#2a2a2a] bg-[#2a2a2a] sm:grid-cols-4">
            {valuesAr.map((v, i) => (
              <div key={i} className="bg-[#141414] px-5 py-8 text-center">
                <div className="mb-2 text-base font-medium text-[#d4b363]">{v}</div>
                <div className="text-[11px] font-light uppercase tracking-[2px] text-[#6b6560]" dir="ltr">
                  {valuesEn[i] || ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ContentSection>

      {/* Audience */}
      <SectionDivider number="03" titleAr="الجمهور والوصول" titleEn="AUDIENCE & REACH" />
      <ContentSection labelAr="الجمهور" labelEn="AUDIENCE">
        <BilingualBlock ar={mediaKit.audienceDescription_ar} en={mediaKit.audienceDescription_en} />
      </ContentSection>

      {/* Statistics */}
      <section className="flex min-h-screen flex-col justify-center bg-[#0a0a0a] px-8 py-20 sm:px-[72px]">
        <SectionLabel labelAr="الأرقام" labelEn="STATISTICS" />

        <div className="mb-14 py-12 text-center">
          <div className="mb-4 text-[11px] font-medium uppercase tracking-[6px] text-[#6b6560]">
            إجمالي الوصول &nbsp;/&nbsp; TOTAL REACH
          </div>
          <div className="text-[72px] font-bold leading-none tracking-[-2px] text-[#c9a84c]">
            {formatNumber(totalReach)}
          </div>
          <div className="mt-3 text-sm font-light text-[#9a9590]">
            عبر جميع المنصات &nbsp;/&nbsp; Across all platforms
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border border-[#2a2a2a] bg-[#2a2a2a] sm:grid-cols-4">
          {([
            { key: "youtube" as const, label: "YOUTUBE", sub: "مشترك / Subscribers" },
            { key: "instagram" as const, label: "INSTAGRAM", sub: "متابع / Followers" },
            { key: "tiktok" as const, label: "TIKTOK", sub: "متابع / Followers" },
            { key: "x" as const, label: "X (TWITTER)", sub: "متابع / Followers" },
          ]).map((p) => (
            <div key={p.key} className="bg-[#141414] px-6 py-10 text-center">
              <div className="mb-4 text-[10px] font-medium uppercase tracking-[3px] text-[#6b6560]">
                {p.label}
              </div>
              <div className="text-4xl font-bold leading-none tracking-[-1px] text-[#f5f2ed]">
                {formatNumber(analytics[p.key].followers)}
              </div>
              <div className="mt-2.5 text-[11px] font-light text-[#6b6560]">{p.sub}</div>
              <div className="mt-5 h-0.5 overflow-hidden rounded-sm bg-[#2a2a2a]">
                <div
                  className="h-full rounded-sm bg-gradient-to-r from-[#8b7a3e] to-[#c9a84c]"
                  style={{
                    width: `${totalReach > 0 ? Math.round((analytics[p.key].followers / totalReach) * 100) : 25}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Partnership Philosophy */}
      <SectionDivider number="04" titleAr="فلسفة الشراكة" titleEn="PARTNERSHIP PHILOSOPHY" />
      <ContentSection labelAr="فلسفة الشراكة" labelEn="PHILOSOPHY">
        <BilingualBlock ar={mediaKit.partnershipPhilosophy_ar} en={mediaKit.partnershipPhilosophy_en} />
      </ContentSection>

      {/* Collaboration Options */}
      <ContentSection labelAr="خيارات التعاون" labelEn="COLLABORATION">
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {[
            { n: "01", ar: "شراكة حلقة", en: "EPISODE PARTNERSHIP", desc: "ظهور العلامة التجارية كشريك لحلقة واحدة مع ذكر في المقدمة والوصف والمنصات." },
            { n: "02", ar: "شراكة موسم", en: "SEASON PARTNERSHIP", desc: "شراكة ممتدة على مدار موسم كامل مع حضور مستمر وتكامل أعمق مع المحتوى." },
            { n: "03", ar: "حلقة تعاونية", en: "COLLABORATIVE EPISODE", desc: "إنتاج حلقة مشتركة يكون فيها الشريك جزءًا من القصة والمحتوى بشكل عضوي." },
            { n: "04", ar: "شراكة مخصصة", en: "CUSTOM PARTNERSHIP", desc: "تصميم شراكة فريدة تناسب أهداف العلامة التجارية وتتماشى مع هوية خط." },
          ].map((c) => (
            <div key={c.n} className="relative border border-[#2a2a2a] bg-[#1e1e1e] p-7 pt-9">
              <div className="absolute right-0 top-0 h-px w-10 bg-[#c9a84c]" />
              <div className="mb-3 text-5xl font-extralight leading-none text-[#c9a84c]/20">{c.n}</div>
              <h4 className="mb-1 text-lg font-semibold text-[#f5f2ed]">{c.ar}</h4>
              <p className="mb-4 text-right text-[11px] font-light uppercase tracking-[2px] text-[#8b7a3e]" dir="ltr">
                {c.en}
              </p>
              <p className="text-[13px] font-light leading-relaxed text-[#9a9590]">{c.desc}</p>
            </div>
          ))}
        </div>
      </ContentSection>

      {/* Contact */}
      <section className="relative flex min-h-screen flex-col justify-center bg-[#0a0a0a] px-8 py-20 sm:px-[72px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_30%_at_50%_60%,rgba(201,168,76,0.08)_0%,transparent_70%)]" />
        <div className="relative z-10">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-semibold text-[#f5f2ed]">لنبدأ الحوار</h2>
            <p className="mt-3 text-[13px] font-light uppercase tracking-[6px] text-[#6b6560]" dir="ltr">
              LET&apos;S START THE CONVERSATION
            </p>
            <div className="mx-auto mt-6 h-px w-10 bg-[#c9a84c]" />
          </div>

          <div className="mx-auto grid max-w-[520px] grid-cols-2 gap-px border border-[#2a2a2a] bg-[#2a2a2a]">
            {mediaKit.contactEmail && (
              <ContactItem label="EMAIL" value={mediaKit.contactEmail} />
            )}
            {mediaKit.contactPhone && (
              <ContactItem label="PHONE" value={mediaKit.contactPhone} />
            )}
            {mediaKit.socialLinks.youtube && (
              <ContactItem label="YOUTUBE" value={mediaKit.socialLinks.youtube} />
            )}
            {mediaKit.socialLinks.instagram && (
              <ContactItem label="INSTAGRAM" value={mediaKit.socialLinks.instagram} />
            )}
            {mediaKit.socialLinks.tiktok && (
              <ContactItem label="TIKTOK" value={mediaKit.socialLinks.tiktok} />
            )}
            {mediaKit.socialLinks.x && (
              <ContactItem label="X (TWITTER)" value={mediaKit.socialLinks.x} />
            )}
          </div>

          <div className="mt-20 border-t border-[#2a2a2a] pt-10 text-center">
            <div className="text-[13px] font-medium tracking-[6px] text-[#c9a84c]">KHAT PODCAST</div>
            <div className="mt-2 text-xs tracking-[2px] text-[#6b6560]" dir="ltr">khatpodcast.com</div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ─── Sub-components ─── */

function SectionDivider({ number, titleAr, titleEn }: { number: string; titleAr: string; titleEn: string }) {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-8 py-20 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_30%_at_50%_50%,rgba(201,168,76,0.08)_0%,transparent_70%)]" />
      <div className="relative z-10">
        <div className="text-[80px] font-extralight leading-none text-[#c9a84c]/30">{number}</div>
        <h2 className="mt-4 text-4xl font-semibold text-[#f5f2ed]">{titleAr}</h2>
        <p className="mt-3 text-sm font-light uppercase tracking-[6px] text-[#6b6560]" dir="ltr">
          {titleEn}
        </p>
        <div className="mx-auto mt-8 h-px w-10 bg-[#c9a84c]" />
      </div>
    </section>
  )
}

function SectionLabel({ labelAr, labelEn }: { labelAr: string; labelEn: string }) {
  return (
    <div className="mb-12 inline-flex items-center gap-3">
      <div className="h-px w-8 bg-[#c9a84c]" />
      <span className="text-[11px] font-medium uppercase tracking-[5px] text-[#c9a84c]">
        {labelAr} · {labelEn}
      </span>
    </div>
  )
}

function ContentSection({
  labelAr,
  labelEn,
  children,
}: {
  labelAr: string
  labelEn: string
  children: React.ReactNode
}) {
  return (
    <section className="min-h-screen bg-[#0a0a0a] px-8 py-20 sm:px-[72px]">
      <SectionLabel labelAr={labelAr} labelEn={labelEn} />
      <div className="space-y-12">{children}</div>
    </section>
  )
}

function BilingualBlock({
  titleAr,
  titleEn,
  ar,
  en,
}: {
  titleAr?: string
  titleEn?: string
  ar: string
  en: string
}) {
  return (
    <div>
      {titleAr && (
        <h4 className="mb-5 text-[13px] font-semibold tracking-[1px] text-[#c9a84c]">
          {titleAr} &nbsp;/&nbsp; {titleEn}
        </h4>
      )}
      <p className="mb-7 max-w-[560px] text-base font-light leading-[2.1] text-[#e8e4dd]">{ar}</p>
      <div className="max-w-[560px] rounded-sm border-r-0 border-l-2 border-l-[#8b7a3e] bg-[#1e1e1e] px-7 py-6" dir="ltr">
        <p className="text-sm font-light leading-[1.9] text-[#9a9590]">{en}</p>
      </div>
    </div>
  )
}

function ContactItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141414] px-6 py-7 text-center">
      <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[3px] text-[#8b7a3e]">
        {label}
      </div>
      <div className="text-[15px] text-[#e8e4dd]" dir="ltr">
        {value}
      </div>
    </div>
  )
}
