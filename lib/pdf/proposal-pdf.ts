/**
 * Branded partnership-proposal PDF.
 *
 * Same approach the media-kit uses: build a self-contained, print-ready HTML
 * document, open it in a new window, and trigger the browser's "Save as PDF".
 * No PDF library, no server round-trip. The document is Khat-branded (light
 * Apple-editorial identity: indigo + orange), RTL, A4, IBM Plex Sans Arabic.
 *
 * Content is sourced from the curated offer when present (the operator's edited
 * artifact), else the AI proposal — so what you send the partner is exactly
 * what's been reviewed.
 */

import type {
  SponsorshipLead,
  SponsorshipProposal,
  PartnershipOffer,
  ProposedPackage,
} from "@/types/database"

export interface ProposalPdfInput {
  lead: SponsorshipLead
  proposal: SponsorshipProposal | null
  offer: PartnershipOffer | null
  reference: string
}

function esc(v: unknown): string {
  const s = v == null ? "" : String(v)
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Turn a free-text block into escaped <p> paragraphs (blank-line separated). */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="para">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

function packageCard(p: ProposedPackage): string {
  const deliverables = (p.deliverables || [])
    .filter(Boolean)
    .map((d) => `<li>${esc(d)}</li>`)
    .join("")
  return `
    <div class="pkg">
      <div class="pkg-head">
        <span class="pkg-name">${esc(p.name)}</span>
        ${p.price_range ? `<span class="pkg-price">${esc(p.price_range)}</span>` : ""}
      </div>
      ${p.description ? `<p class="pkg-desc">${esc(p.description)}</p>` : ""}
      ${deliverables ? `<ul class="pkg-list">${deliverables}</ul>` : ""}
    </div>`
}

function todayArabic(): string {
  try {
    return new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" }).format(new Date())
  } catch {
    return ""
  }
}

export function buildProposalHtml(input: ProposalPdfInput): string {
  const { lead, proposal, offer, reference } = input

  const title = offer?.title || proposal?.subject || `عرض شراكة — بودكاست خط × ${lead.company_name}`
  const intro = offer?.intro || proposal?.introduction || proposal?.greeting || ""
  // Curated offer body wins; else the AI letter; else assemble from sections.
  const bodyText =
    offer?.body ||
    proposal?.full_draft ||
    [proposal?.greeting, proposal?.introduction, proposal?.value_proposition].filter(Boolean).join("\n\n")
  const packages = (offer?.packages?.length ? offer.packages : proposal?.proposed_packages) || []
  const validity = offer?.validity_note || proposal?.next_steps || ""
  const closing = proposal?.closing || ""
  const contactEmail = offer?.contact_email || "partners@khatpodcast.com"

  const packagesBlock = packages.length
    ? `<section class="section">
         <h2 class="h2"><span class="bar"></span>باقات الشراكة المقترحة</h2>
         <div class="pkgs">${packages.map(packageCard).join("")}</div>
       </section>`
    : ""

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
  :root{
    --indigo:hsl(252 48% 40%);
    --indigo-soft:hsl(252 48% 96%);
    --orange:hsl(22 90% 53%);
    --ink:hsl(252 40% 11%);
    --muted:hsl(250 12% 46%);
    --line:hsl(250 20% 90%);
  }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  @page{size:A4;margin:0;}
  html,body{margin:0;padding:0;}
  body{font-family:'IBM Plex Sans Arabic',-apple-system,sans-serif;color:var(--ink);background:#fff;line-height:1.85;font-size:13.5px;}
  .page{width:210mm;min-height:297mm;padding:22mm 20mm 18mm;margin:0 auto;position:relative;page-break-after:always;}
  .page:last-child{page-break-after:auto;}

  /* Cover */
  .cover{display:flex;flex-direction:column;}
  .brandrow{display:flex;align-items:center;gap:12px;}
  .logo{width:54px;height:54px;border-radius:14px;object-fit:cover;border:1px solid var(--line);}
  .wordmark{font-size:20px;font-weight:700;color:var(--indigo);}
  .wordmark small{display:block;font-size:11px;font-weight:500;color:var(--muted);letter-spacing:.5px;}
  .cover-mid{margin-top:34mm;}
  .eyebrow{display:inline-block;background:var(--indigo-soft);color:var(--indigo);font-weight:600;font-size:12px;padding:5px 12px;border-radius:999px;}
  .cover-title{font-size:30px;font-weight:700;line-height:1.4;margin:14px 0 6px;}
  .cover-company{font-size:17px;color:var(--muted);font-weight:500;}
  .cover-accent{width:64px;height:4px;background:var(--orange);border-radius:2px;margin:22px 0;}
  .meta{display:flex;gap:28px;flex-wrap:wrap;margin-top:6px;}
  .meta div .l{font-size:11px;color:var(--muted);}
  .meta div .v{font-size:14px;font-weight:600;}
  .meta .ref{font-family:ui-monospace,monospace;letter-spacing:1px;color:var(--indigo);direction:ltr;}
  .cover-foot{margin-top:auto;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:12px;}

  /* Content */
  .section{margin-bottom:22px;}
  .h2{font-size:16px;font-weight:700;display:flex;align-items:center;gap:9px;margin:0 0 12px;}
  .bar{width:5px;height:18px;background:var(--orange);border-radius:3px;display:inline-block;}
  .para{margin:0 0 11px;color:var(--ink);}
  .lead-intro{font-size:15px;color:var(--indigo);font-weight:500;margin-bottom:16px;}

  .pkgs{display:flex;flex-direction:column;gap:12px;}
  .pkg{border:1px solid var(--line);border-radius:14px;padding:15px 17px;background:linear-gradient(180deg,#fff, hsl(252 48% 99%));}
  .pkg-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:9px;}
  .pkg-name{font-size:15px;font-weight:700;color:var(--indigo);}
  .pkg-price{font-size:13px;font-weight:600;color:var(--orange);white-space:nowrap;}
  .pkg-desc{margin:0 0 8px;color:var(--muted);font-size:13px;}
  .pkg-list{margin:0;padding-inline-start:18px;}
  .pkg-list li{margin-bottom:4px;}

  .callout{background:var(--indigo-soft);border-radius:14px;padding:15px 18px;font-size:13px;}
  .about{border:1px solid var(--line);border-radius:14px;padding:15px 18px;color:var(--muted);font-size:12.5px;}
  .footer{margin-top:26px;border-top:1px solid var(--line);padding-top:14px;display:flex;justify-content:space-between;align-items:center;color:var(--muted);font-size:12px;}
  .footer .em{color:var(--indigo);font-weight:600;}
  a{color:var(--indigo);text-decoration:none;}
</style>
</head>
<body>
  <!-- Cover -->
  <div class="page cover">
    <div class="brandrow">
      <img src="/logo.png" class="logo" alt="خط"/>
      <div class="wordmark">بودكاست خط<small>khatpodcast.com</small></div>
    </div>
    <div class="cover-mid">
      <span class="eyebrow">عرض شراكة</span>
      <div class="cover-title">${esc(title)}</div>
      <div class="cover-company">${esc(lead.company_name)} · ${esc(lead.industry)}</div>
      <div class="cover-accent"></div>
      <div class="meta">
        <div><div class="l">إلى</div><div class="v">${esc(lead.contact_name)}${lead.job_title ? ` — ${esc(lead.job_title)}` : ""}</div></div>
        <div><div class="l">التاريخ</div><div class="v">${esc(todayArabic())}</div></div>
        <div><div class="l">المرجع</div><div class="v ref">${esc(reference)}</div></div>
      </div>
    </div>
    <div class="cover-foot">محتوى عربي ثقافي عميق · حضورٌ داخل محتوى موثوق، لا فاصل إعلاني</div>
  </div>

  <!-- Body -->
  <div class="page">
    ${intro ? `<p class="lead-intro">${esc(intro)}</p>` : ""}
    <section class="section">
      <h2 class="h2"><span class="bar"></span>المقترح</h2>
      ${paragraphs(bodyText || "—")}
    </section>

    ${packagesBlock}

    ${validity ? `<section class="section"><h2 class="h2"><span class="bar"></span>الخطوات التالية</h2><div class="callout">${paragraphs(validity)}</div></section>` : ""}

    ${closing ? `<p class="para">${esc(closing)}</p>` : ""}

    <div class="footer">
      <div>بودكاست <span class="em">خط</span> · ${esc(reference)}</div>
      <div><a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a></div>
    </div>
  </div>
</body>
</html>`
}

/**
 * Open the branded proposal in a print window. Client-only — guards against SSR.
 * Returns false if the popup was blocked.
 */
export function generateProposalPdf(input: ProposalPdfInput): boolean {
  if (typeof window === "undefined") return false
  const win = window.open("", "_blank", "width=900,height=1200")
  if (!win) return false
  win.document.open()
  win.document.write(buildProposalHtml(input))
  win.document.close()
  // Give the webfont + logo a beat to load, then invoke print.
  win.setTimeout(() => {
    win.focus()
    win.print()
  }, 600)
  return true
}
