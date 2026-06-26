"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Save,
  FileText,
  Loader2,
  Check,
  Link2,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import type { MediaKitConfig, AnalyticsConfig } from "@/types/media-kit"
import { defaultMediaKitConfig } from "@/types/media-kit"
import { formatDate } from "@/lib/shared/formatters"

function generatePartnershipPDF(
  config: MediaKitConfig,
  analytics: AnalyticsConfig,
  companyName: string,
  contactPerson: string,
  date: string
) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`
    return n.toLocaleString()
  }

  const totalReach =
    analytics.youtube.followers +
    analytics.instagram.followers +
    analytics.tiktok.followers +
    analytics.x.followers

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>عرض شراكة - ${esc(companyName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@200;300;400;500;600;700&display=swap');

    :root {
      --black: #0a0a0a;
      --charcoal: #141414;
      --dark: #1a1a1a;
      --surface: #1e1e1e;
      --surface-2: #252525;
      --border: #2a2a2a;
      --border-light: #333;
      --gold: #c9a84c;
      --gold-light: #d4b363;
      --gold-dim: #8b7a3e;
      --gold-glow: rgba(201, 168, 76, 0.08);
      --gold-glow-2: rgba(201, 168, 76, 0.15);
      --text: #e8e4dd;
      --text-secondary: #9a9590;
      --text-dim: #6b6560;
      --white: #f5f2ed;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
      size: A4;
      margin: 0;
    }

    body {
      font-family: 'IBM Plex Sans Arabic', -apple-system, sans-serif;
      background: var(--black);
      color: var(--text);
      line-height: 1.8;
      direction: rtl;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* ═══ Page System ═══ */
    .page {
      width: 100%;
      min-height: 100vh;
      position: relative;
      overflow: hidden;
      background: var(--black);
    }
    .page-break { page-break-before: always; }

    /* Page footer bar */
    .page-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 60px;
      border-top: 1px solid var(--border);
    }
    .page-footer-brand {
      font-size: 10px;
      font-weight: 500;
      color: var(--gold-dim);
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .page-footer-line {
      height: 1px;
      flex: 1;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
      margin: 0 20px;
    }
    .page-footer-page {
      font-size: 10px;
      color: var(--text-dim);
      letter-spacing: 1px;
    }

    /* ═══ COVER ═══ */
    .cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 100vh;
      padding: 80px 60px;
      position: relative;
      background:
        radial-gradient(ellipse 60% 50% at 50% 45%, var(--gold-glow) 0%, transparent 70%),
        radial-gradient(ellipse 80% 40% at 50% 100%, rgba(201, 168, 76, 0.04) 0%, transparent 60%),
        var(--black);
    }
    /* Subtle corner accents */
    .cover::before {
      content: '';
      position: absolute;
      top: 40px;
      right: 40px;
      width: 80px;
      height: 80px;
      border-top: 1px solid var(--gold-dim);
      border-right: 1px solid var(--gold-dim);
      opacity: 0.4;
    }
    .cover::after {
      content: '';
      position: absolute;
      bottom: 60px;
      left: 40px;
      width: 80px;
      height: 80px;
      border-bottom: 1px solid var(--gold-dim);
      border-left: 1px solid var(--gold-dim);
      opacity: 0.4;
    }

    /* Khat brand mark — CSS replica of <KhatLogo> (indigo squircle, white خط,
       orange diamond). Brand colors are fixed/theme-independent; a soft gold
       halo keeps it at home on the dark luxury cover. */
    .cover-logo {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 90px;
      height: 90px;
      border-radius: 25px;
      margin-bottom: 40px;
      overflow: hidden;
      background: linear-gradient(160deg, #45367f 0%, #3a2d70 55%, #2f2560 100%);
      box-shadow: 0 0 60px rgba(201, 168, 76, 0.12), 0 6px 18px -5px rgba(58, 45, 112, 0.6);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .cover-logo .wm {
      color: #fff;
      font-weight: 700;
      font-size: 41px;
      line-height: 1;
      margin-top: 5px;
    }
    .cover-logo .dia {
      position: absolute;
      width: 14px;
      height: 14px;
      top: 18px;
      inset-inline-start: 31px;
      background: #ee6a2c;
      border-radius: 3px;
      transform: rotate(45deg);
      box-shadow: 0 0 10px rgba(238, 106, 44, 0.5);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .cover-brand {
      font-size: 52px;
      font-weight: 700;
      color: var(--white);
      letter-spacing: -1px;
    }
    .cover-brand-en {
      font-size: 16px;
      font-weight: 300;
      color: var(--gold);
      margin-top: 8px;
      letter-spacing: 10px;
      text-transform: uppercase;
      direction: ltr;
    }
    .cover-divider {
      width: 1px;
      height: 60px;
      background: linear-gradient(180deg, transparent, var(--gold), transparent);
      margin: 48px auto;
    }
    .cover-type {
      font-size: 22px;
      font-weight: 300;
      color: var(--gold);
      letter-spacing: 6px;
    }
    .cover-type-en {
      font-size: 11px;
      font-weight: 300;
      color: var(--text-dim);
      margin-top: 8px;
      letter-spacing: 8px;
      text-transform: uppercase;
      direction: ltr;
    }
    .cover-prepared {
      margin-top: 64px;
      font-size: 11px;
      font-weight: 400;
      color: var(--text-dim);
      letter-spacing: 4px;
      text-transform: uppercase;
    }
    .cover-company {
      font-size: 32px;
      font-weight: 600;
      color: var(--white);
      margin-top: 12px;
    }
    .cover-contact {
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: 6px;
    }
    .cover-date {
      margin-top: 40px;
      font-size: 12px;
      color: var(--text-dim);
      letter-spacing: 2px;
    }

    /* ═══ SECTION DIVIDER PAGE ═══ */
    .divider-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 100vh;
      padding: 80px;
      position: relative;
      background:
        radial-gradient(ellipse 50% 30% at 50% 50%, var(--gold-glow) 0%, transparent 70%),
        var(--black);
    }
    .divider-number {
      font-size: 80px;
      font-weight: 200;
      color: var(--gold);
      line-height: 1;
      opacity: 0.3;
    }
    .divider-title {
      font-size: 36px;
      font-weight: 600;
      color: var(--white);
      margin-top: 16px;
    }
    .divider-title-en {
      font-size: 14px;
      font-weight: 300;
      color: var(--text-dim);
      margin-top: 12px;
      letter-spacing: 6px;
      text-transform: uppercase;
      direction: ltr;
    }
    .divider-line {
      width: 40px;
      height: 1px;
      background: var(--gold);
      margin: 32px auto 0;
    }

    /* ═══ CONTENT SECTIONS ═══ */
    .content {
      padding: 80px 72px 100px;
      min-height: 100vh;
      position: relative;
      background: var(--black);
    }

    .section-label {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 48px;
    }
    .section-label-line {
      width: 32px;
      height: 1px;
      background: var(--gold);
    }
    .section-label-text {
      font-size: 11px;
      font-weight: 500;
      color: var(--gold);
      letter-spacing: 5px;
      text-transform: uppercase;
    }

    /* Bilingual text blocks */
    .text-block {
      margin-bottom: 48px;
    }
    .text-block-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--gold);
      margin-bottom: 20px;
      letter-spacing: 1px;
    }
    .text-ar {
      font-size: 16px;
      line-height: 2.1;
      color: var(--text);
      font-weight: 300;
      margin-bottom: 28px;
      max-width: 560px;
    }
    .text-en-block {
      direction: ltr;
      text-align: left;
      padding: 24px 28px;
      background: var(--surface);
      border-radius: 2px;
      border-right: 2px solid var(--gold-dim);
      border-left: none;
      max-width: 560px;
    }
    .text-en {
      font-size: 14px;
      line-height: 1.9;
      color: var(--text-secondary);
      font-weight: 300;
    }

    /* ═══ VALUES ═══ */
    .values-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
      margin-top: 32px;
    }
    .value-item {
      background: var(--charcoal);
      padding: 32px 20px;
      text-align: center;
    }
    .value-item-ar {
      font-size: 16px;
      font-weight: 500;
      color: var(--gold-light);
      margin-bottom: 8px;
    }
    .value-item-en {
      font-size: 11px;
      font-weight: 300;
      color: var(--text-dim);
      letter-spacing: 2px;
      text-transform: uppercase;
      direction: ltr;
    }

    /* ═══ STATS ═══ */
    .stats-hero {
      text-align: center;
      margin-bottom: 56px;
      padding: 48px 0;
    }
    .stats-hero-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-dim);
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .stats-hero-number {
      font-size: 72px;
      font-weight: 700;
      color: var(--gold);
      line-height: 1;
      letter-spacing: -2px;
    }
    .stats-hero-sub {
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: 12px;
      font-weight: 300;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
    }
    .stat-card {
      background: var(--charcoal);
      padding: 40px 24px;
      text-align: center;
      position: relative;
    }
    .stat-icon {
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 20px;
      display: block;
    }
    .stat-platform {
      font-size: 10px;
      font-weight: 500;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 16px;
    }
    .stat-number {
      font-size: 36px;
      font-weight: 700;
      color: var(--white);
      line-height: 1;
      letter-spacing: -1px;
    }
    .stat-label {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 10px;
      font-weight: 300;
    }
    .stat-bar {
      margin-top: 20px;
      height: 2px;
      background: var(--border);
      border-radius: 1px;
      overflow: hidden;
    }
    .stat-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--gold-dim), var(--gold));
      border-radius: 1px;
    }

    /* ═══ COLLABORATION ═══ */
    .collab-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 40px;
    }
    .collab-card {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 36px 28px;
      position: relative;
      transition: all 0.2s;
    }
    .collab-card::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 40px;
      height: 1px;
      background: var(--gold);
    }
    .collab-number {
      font-size: 48px;
      font-weight: 200;
      color: var(--gold);
      opacity: 0.2;
      line-height: 1;
      margin-bottom: 12px;
    }
    .collab-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--white);
      margin-bottom: 4px;
    }
    .collab-title-en {
      font-size: 11px;
      font-weight: 300;
      color: var(--gold-dim);
      letter-spacing: 2px;
      text-transform: uppercase;
      direction: ltr;
      text-align: right;
      margin-bottom: 16px;
    }
    .collab-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.9;
      font-weight: 300;
    }

    /* ═══ CONTACT ═══ */
    .contact-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 100vh;
      padding: 80px 72px;
      position: relative;
      background:
        radial-gradient(ellipse 50% 30% at 50% 60%, var(--gold-glow) 0%, transparent 70%),
        var(--black);
    }
    .contact-heading {
      text-align: center;
      margin-bottom: 64px;
    }
    .contact-heading-ar {
      font-size: 36px;
      font-weight: 600;
      color: var(--white);
    }
    .contact-heading-en {
      font-size: 13px;
      font-weight: 300;
      color: var(--text-dim);
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-top: 12px;
      direction: ltr;
    }
    .contact-heading-line {
      width: 40px;
      height: 1px;
      background: var(--gold);
      margin: 24px auto 0;
    }

    .contact-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
      max-width: 520px;
      margin: 0 auto;
    }
    .contact-item {
      background: var(--charcoal);
      padding: 28px 24px;
      text-align: center;
    }
    .contact-label {
      font-size: 10px;
      font-weight: 500;
      color: var(--gold-dim);
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 10px;
    }
    .contact-value {
      font-size: 15px;
      color: var(--text);
      font-weight: 400;
      direction: ltr;
    }

    .contact-footer {
      text-align: center;
      margin-top: 80px;
      padding-top: 40px;
      border-top: 1px solid var(--border);
    }
    .contact-footer-brand {
      font-size: 13px;
      font-weight: 500;
      color: var(--gold);
      letter-spacing: 6px;
    }
    .contact-footer-url {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 8px;
      letter-spacing: 2px;
      direction: ltr;
    }
    .contact-footer-confidential {
      font-size: 10px;
      color: var(--text-dim);
      margin-top: 24px;
      opacity: 0.5;
      letter-spacing: 1px;
    }

    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .page { page-break-inside: avoid; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>

  <!-- ═══════════════════════════════════════
       PAGE 1: COVER
       ═══════════════════════════════════════ -->
  <div class="cover page">
    <div class="cover-logo"><span class="wm">خط</span><span class="dia"></span></div>
    <div class="cover-brand">بودكاست خط</div>
    <div class="cover-brand-en">KHAT PODCAST</div>
    <div class="cover-divider"></div>
    <div class="cover-type">عرض شراكة</div>
    <div class="cover-type-en">PARTNERSHIP PROPOSAL</div>
    <div class="cover-prepared">أُعدّ لـ &nbsp;/&nbsp; PREPARED FOR</div>
    <div class="cover-company">${esc(companyName)}</div>
    ${contactPerson ? `<div class="cover-contact">${esc(contactPerson)}</div>` : ""}
    <div class="cover-date">${esc(date)}</div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 2: ABOUT — DIVIDER
       ═══════════════════════════════════════ -->
  <div class="divider-page page page-break">
    <div class="divider-number">01</div>
    <div class="divider-title">عن خط</div>
    <div class="divider-title-en">ABOUT KHAT</div>
    <div class="divider-line"></div>
    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">02</div>
    </div>
  </div>

  <!-- PAGE 3: ABOUT — CONTENT -->
  <div class="content page page-break">
    <div class="section-label">
      <div class="section-label-line"></div>
      <div class="section-label-text">عن خط · ABOUT KHAT</div>
    </div>

    <div class="text-block">
      <div class="text-ar">${esc(config.podcastDescription_ar)}</div>
      <div class="text-en-block">
        <div class="text-en">${esc(config.podcastDescription_en)}</div>
      </div>
    </div>

    <div class="text-block">
      <div class="text-block-title">أسلوب التقديم &nbsp;/&nbsp; PRESENTATION</div>
      <div class="text-ar">${esc(config.hostDescription_ar)}</div>
      <div class="text-en-block">
        <div class="text-en">${esc(config.hostDescription_en)}</div>
      </div>
    </div>

    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">03</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 4: VISION — DIVIDER
       ═══════════════════════════════════════ -->
  <div class="divider-page page page-break">
    <div class="divider-number">02</div>
    <div class="divider-title">الرؤية والقيم</div>
    <div class="divider-title-en">VISION &amp; VALUES</div>
    <div class="divider-line"></div>
    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">04</div>
    </div>
  </div>

  <!-- PAGE 5: VISION — CONTENT -->
  <div class="content page page-break">
    <div class="section-label">
      <div class="section-label-line"></div>
      <div class="section-label-text">الرؤية · VISION</div>
    </div>

    <div class="text-block">
      <div class="text-ar">${esc(config.vision_ar)}</div>
      <div class="text-en-block">
        <div class="text-en">${esc(config.vision_en)}</div>
      </div>
    </div>

    <div class="text-block-title" style="margin-bottom: 24px;">القيم &nbsp;/&nbsp; VALUES</div>
    <div class="values-grid">
      ${(config.values_ar || "").split("·").map((v, i) => {
        const enValues = (config.values_en || "").split("·")
        return `<div class="value-item">
          <div class="value-item-ar">${esc(v.trim())}</div>
          <div class="value-item-en">${esc((enValues[i] || "").trim())}</div>
        </div>`
      }).join("")}
    </div>

    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">05</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 6: AUDIENCE — DIVIDER
       ═══════════════════════════════════════ -->
  <div class="divider-page page page-break">
    <div class="divider-number">03</div>
    <div class="divider-title">الجمهور والوصول</div>
    <div class="divider-title-en">AUDIENCE &amp; REACH</div>
    <div class="divider-line"></div>
    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">06</div>
    </div>
  </div>

  <!-- PAGE 7: AUDIENCE — CONTENT -->
  <div class="content page page-break">
    <div class="section-label">
      <div class="section-label-line"></div>
      <div class="section-label-text">الجمهور · AUDIENCE</div>
    </div>

    <div class="text-block">
      <div class="text-ar">${esc(config.audienceDescription_ar)}</div>
      <div class="text-en-block">
        <div class="text-en">${esc(config.audienceDescription_en)}</div>
      </div>
    </div>

    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">07</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 8: STATISTICS
       ═══════════════════════════════════════ -->
  <div class="content page page-break" style="display:flex;flex-direction:column;justify-content:center;">
    <div class="section-label">
      <div class="section-label-line"></div>
      <div class="section-label-text">الأرقام · STATISTICS</div>
    </div>

    <div class="stats-hero">
      <div class="stats-hero-label">إجمالي الوصول &nbsp;/&nbsp; TOTAL REACH</div>
      <div class="stats-hero-number">${formatNumber(totalReach)}</div>
      <div class="stats-hero-sub">عبر جميع المنصات &nbsp;/&nbsp; Across all platforms</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-platform">YOUTUBE</div>
        <div class="stat-number">${formatNumber(analytics.youtube.followers)}</div>
        <div class="stat-label">مشترك / Subscribers</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width: ${totalReach > 0 ? Math.round((analytics.youtube.followers / totalReach) * 100) : 25}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-platform">INSTAGRAM</div>
        <div class="stat-number">${formatNumber(analytics.instagram.followers)}</div>
        <div class="stat-label">متابع / Followers</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width: ${totalReach > 0 ? Math.round((analytics.instagram.followers / totalReach) * 100) : 25}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-platform">TIKTOK</div>
        <div class="stat-number">${formatNumber(analytics.tiktok.followers)}</div>
        <div class="stat-label">متابع / Followers</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width: ${totalReach > 0 ? Math.round((analytics.tiktok.followers / totalReach) * 100) : 25}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-platform">X (TWITTER)</div>
        <div class="stat-number">${formatNumber(analytics.x.followers)}</div>
        <div class="stat-label">متابع / Followers</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width: ${totalReach > 0 ? Math.round((analytics.x.followers / totalReach) * 100) : 25}%"></div></div>
      </div>
    </div>

    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">08</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 9: PARTNERSHIP PHILOSOPHY — DIVIDER
       ═══════════════════════════════════════ -->
  <div class="divider-page page page-break">
    <div class="divider-number">04</div>
    <div class="divider-title">فلسفة الشراكة</div>
    <div class="divider-title-en">PARTNERSHIP PHILOSOPHY</div>
    <div class="divider-line"></div>
    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">09</div>
    </div>
  </div>

  <!-- PAGE 10: PARTNERSHIP PHILOSOPHY — CONTENT -->
  <div class="content page page-break">
    <div class="section-label">
      <div class="section-label-line"></div>
      <div class="section-label-text">فلسفة الشراكة · PHILOSOPHY</div>
    </div>

    <div class="text-block">
      <div class="text-ar">${esc(config.partnershipPhilosophy_ar)}</div>
      <div class="text-en-block">
        <div class="text-en">${esc(config.partnershipPhilosophy_en)}</div>
      </div>
    </div>

    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">10</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 11: COLLABORATION OPTIONS
       ═══════════════════════════════════════ -->
  <div class="content page page-break">
    <div class="section-label">
      <div class="section-label-line"></div>
      <div class="section-label-text">خيارات التعاون · COLLABORATION</div>
    </div>

    <div class="collab-grid">
      <div class="collab-card">
        <div class="collab-number">01</div>
        <div class="collab-title">شراكة حلقة</div>
        <div class="collab-title-en">EPISODE PARTNERSHIP</div>
        <div class="collab-desc">ظهور العلامة التجارية كشريك لحلقة واحدة مع ذكر في المقدمة والوصف والمنصات.</div>
      </div>
      <div class="collab-card">
        <div class="collab-number">02</div>
        <div class="collab-title">شراكة موسم</div>
        <div class="collab-title-en">SEASON PARTNERSHIP</div>
        <div class="collab-desc">شراكة ممتدة على مدار موسم كامل مع حضور مستمر وتكامل أعمق مع المحتوى.</div>
      </div>
      <div class="collab-card">
        <div class="collab-number">03</div>
        <div class="collab-title">حلقة تعاونية</div>
        <div class="collab-title-en">COLLABORATIVE EPISODE</div>
        <div class="collab-desc">إنتاج حلقة مشتركة يكون فيها الشريك جزءًا من القصة والمحتوى بشكل عضوي.</div>
      </div>
      <div class="collab-card">
        <div class="collab-number">04</div>
        <div class="collab-title">شراكة مخصصة</div>
        <div class="collab-title-en">CUSTOM PARTNERSHIP</div>
        <div class="collab-desc">تصميم شراكة فريدة تناسب أهداف العلامة التجارية وتتماشى مع هوية خط.</div>
      </div>
    </div>

    <div class="page-footer">
      <div class="page-footer-brand">KHAT PODCAST</div>
      <div class="page-footer-line"></div>
      <div class="page-footer-page">11</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════
       PAGE 12: CONTACT
       ═══════════════════════════════════════ -->
  <div class="contact-page page page-break">
    <div class="contact-heading">
      <div class="contact-heading-ar">لنبدأ الحوار</div>
      <div class="contact-heading-en">LET'S START THE CONVERSATION</div>
      <div class="contact-heading-line"></div>
    </div>

    <div class="contact-grid">
      ${config.contactEmail ? `<div class="contact-item"><div class="contact-label">EMAIL</div><div class="contact-value">${esc(config.contactEmail)}</div></div>` : ""}
      ${config.contactPhone ? `<div class="contact-item"><div class="contact-label">PHONE</div><div class="contact-value">${esc(config.contactPhone)}</div></div>` : ""}
      ${config.socialLinks.youtube ? `<div class="contact-item"><div class="contact-label">YOUTUBE</div><div class="contact-value">${esc(config.socialLinks.youtube)}</div></div>` : ""}
      ${config.socialLinks.instagram ? `<div class="contact-item"><div class="contact-label">INSTAGRAM</div><div class="contact-value">${esc(config.socialLinks.instagram)}</div></div>` : ""}
      ${config.socialLinks.tiktok ? `<div class="contact-item"><div class="contact-label">TIKTOK</div><div class="contact-value">${esc(config.socialLinks.tiktok)}</div></div>` : ""}
      ${config.socialLinks.x ? `<div class="contact-item"><div class="contact-label">X (TWITTER)</div><div class="contact-value">${esc(config.socialLinks.x)}</div></div>` : ""}
    </div>

    <div class="contact-footer">
      <div class="contact-footer-brand">KHAT PODCAST</div>
      <div class="contact-footer-url">khatpodcast.com</div>
      <div class="contact-footer-confidential">هذا المستند سري وأُعدّ خصيصًا لـ ${esc(companyName)} &nbsp;·&nbsp; CONFIDENTIAL</div>
    </div>
  </div>

</body>
</html>`

  const printWindow = window.open("", "_blank")
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
  }
}

export default function MediaKitPage() {
  const searchParams = useSearchParams()
  const [config, setConfig] = useState<MediaKitConfig>(defaultMediaKitConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // PDF generator state — pre-fill from URL params (from submissions page)
  const [companyName, setCompanyName] = useState(searchParams.get("company") || "")
  const [contactPerson, setContactPerson] = useState(searchParams.get("contact") || "")
  const [pdfDate, setPdfDate] = useState(formatDate(new Date()))
  const [generating, setGenerating] = useState(false)

  // Share link state
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareSlug, setShareSlug] = useState<string | null>(null)
  const [sharePassword, setSharePassword] = useState("")
  const [shareHasPassword, setShareHasPassword] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareShowPassword, setShareShowPassword] = useState(false)

  useEffect(() => {
    fetch("/api/admin/media-kit")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch("/api/admin/media-kit/share")
      .then((r) => r.json())
      .then((data) => {
        setShareEnabled(data.enabled)
        setShareSlug(data.slug || null)
        setShareHasPassword(data.hasPassword)
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch("/api/admin/media-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error("Error saving media kit config:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (!companyName.trim()) return
    setGenerating(true)
    try {
      const [mediaKitRes, analyticsRes] = await Promise.all([
        fetch("/api/admin/media-kit"),
        fetch("/api/admin/analytics"),
      ])
      const mediaKit = (await mediaKitRes.json()) as MediaKitConfig
      const analytics = (await analyticsRes.json()) as AnalyticsConfig
      generatePartnershipPDF(mediaKit, analytics, companyName.trim(), contactPerson.trim(), pdfDate)
    } catch (error) {
      console.error("Error generating PDF:", error)
    } finally {
      setGenerating(false)
    }
  }

  const updateField = (field: keyof MediaKitConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  const updateSocialLink = (platform: keyof MediaKitConfig["socialLinks"], value: string) => {
    setConfig((prev) => ({
      ...prev,
      socialLinks: { ...prev.socialLinks, [platform]: value },
    }))
  }

  const handleShareSave = async () => {
    if (!sharePassword.trim() && !shareHasPassword) return
    setShareSaving(true)
    try {
      const body: { enabled: boolean; password?: string } = { enabled: shareEnabled }
      if (sharePassword.trim()) body.password = sharePassword
      const res = await fetch("/api/admin/media-kit/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setShareSlug(data.slug)
      setShareHasPassword(data.hasPassword)
      setShareEnabled(data.enabled)
      setSharePassword("")
    } catch (error) {
      console.error("Error saving share config:", error)
    } finally {
      setShareSaving(false)
    }
  }

  const handleCopyLink = () => {
    if (!shareSlug) return
    const url = `${window.location.origin}/media-kit/${shareSlug}`
    navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">ملف الشراكة</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          إعداد محتوى ملف الشراكة وإنشاء عروض مخصصة للشركات
        </p>
      </div>

      {/* PDF Generator Card */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-[15px] font-semibold">إنشاء عرض شراكة</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              اسم الشركة *
            </label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="مثال: شركة ABC"
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              اسم المسؤول (اختياري)
            </label>
            <Input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="مثال: أحمد محمد"
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              التاريخ
            </label>
            <Input
              value={pdfDate}
              onChange={(e) => setPdfDate(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!companyName.trim() || generating}
          className="mt-4 gap-2 rounded-xl"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          إنشاء ملف الشراكة
        </Button>
      </div>

      {/* Share Link Card */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">رابط المشاركة</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {shareEnabled ? "مفعّل" : "معطّل"}
            </span>
            <Switch
              checked={shareEnabled}
              onCheckedChange={setShareEnabled}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              كلمة المرور {shareHasPassword && "(اتركها فارغة للإبقاء على الحالية)"}
            </label>
            <div className="relative">
              <Input
                type={shareShowPassword ? "text" : "password"}
                value={sharePassword}
                onChange={(e) => setSharePassword(e.target.value)}
                placeholder={shareHasPassword ? "••••••••" : "أدخل كلمة مرور"}
                className="rounded-xl pe-10"
              />
              <button
                type="button"
                onClick={() => setShareShowPassword(!shareShowPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {shareShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            onClick={handleShareSave}
            disabled={shareSaving || (!sharePassword.trim() && !shareHasPassword)}
            className="gap-2 rounded-xl"
            variant="outline"
          >
            {shareSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ إعدادات المشاركة
          </Button>

          {shareSlug && shareHasPassword && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/30 bg-white/[0.02] px-4 py-3">
              <code className="flex-1 truncate text-xs text-muted-foreground" dir="ltr">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/media-kit/${shareSlug}`
                  : `/media-kit/${shareSlug}`}
              </code>
              <button
                onClick={handleCopyLink}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                {shareCopied ? (
                  <Check className="h-4 w-4 text-green-700" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between rounded-xl border border-border/30 bg-card/50 px-5 py-3.5 backdrop-blur-sm">
        <p className="text-sm text-muted-foreground">
          عدّل المحتوى أدناه ثم اضغط حفظ. التغييرات ستنعكس على العروض الجديدة.
        </p>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 rounded-xl"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? "تم الحفظ" : "حفظ"}
        </Button>
      </div>

      {/* Template Editor Sections */}
      <div className="space-y-6">
        {/* Section 1: About */}
        <EditorSection number="١" title="عن خط" titleEn="About Khat">
          <BilingualField
            label="وصف البودكاست"
            labelEn="Podcast Description"
            valueAr={config.podcastDescription_ar}
            valueEn={config.podcastDescription_en}
            onChangeAr={(v) => updateField("podcastDescription_ar", v)}
            onChangeEn={(v) => updateField("podcastDescription_en", v)}
          />
          <BilingualField
            label="أسلوب التقديم"
            labelEn="Presentation Style"
            valueAr={config.hostDescription_ar}
            valueEn={config.hostDescription_en}
            onChangeAr={(v) => updateField("hostDescription_ar", v)}
            onChangeEn={(v) => updateField("hostDescription_en", v)}
          />
        </EditorSection>

        {/* Section 2: Vision & Values */}
        <EditorSection number="٢" title="الرؤية والقيم" titleEn="Vision & Values">
          <BilingualField
            label="الرؤية"
            labelEn="Vision"
            valueAr={config.vision_ar}
            valueEn={config.vision_en}
            onChangeAr={(v) => updateField("vision_ar", v)}
            onChangeEn={(v) => updateField("vision_en", v)}
          />
          <BilingualField
            label="القيم"
            labelEn="Values"
            valueAr={config.values_ar}
            valueEn={config.values_en}
            onChangeAr={(v) => updateField("values_ar", v)}
            onChangeEn={(v) => updateField("values_en", v)}
            rows={2}
          />
        </EditorSection>

        {/* Section 3: Audience */}
        <EditorSection number="٣" title="الجمهور" titleEn="Audience">
          <BilingualField
            label="وصف الجمهور"
            labelEn="Audience Description"
            valueAr={config.audienceDescription_ar}
            valueEn={config.audienceDescription_en}
            onChangeAr={(v) => updateField("audienceDescription_ar", v)}
            onChangeEn={(v) => updateField("audienceDescription_en", v)}
          />
        </EditorSection>

        {/* Section 4: Partnership Philosophy */}
        <EditorSection number="٤" title="فلسفة الشراكة" titleEn="Partnership Philosophy">
          <BilingualField
            label="فلسفة الشراكة"
            labelEn="Partnership Philosophy"
            valueAr={config.partnershipPhilosophy_ar}
            valueEn={config.partnershipPhilosophy_en}
            onChangeAr={(v) => updateField("partnershipPhilosophy_ar", v)}
            onChangeEn={(v) => updateField("partnershipPhilosophy_en", v)}
          />
        </EditorSection>

        {/* Section 5: Contact */}
        <EditorSection number="٥" title="التواصل" titleEn="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                البريد الإلكتروني
              </label>
              <Input
                value={config.contactEmail}
                onChange={(e) => updateField("contactEmail", e.target.value)}
                placeholder="hello@khatpodcast.com"
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                الهاتف
              </label>
              <Input
                value={config.contactPhone}
                onChange={(e) => updateField("contactPhone", e.target.value)}
                placeholder="+965 ..."
                className="rounded-xl"
                dir="ltr"
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                YouTube
              </label>
              <Input
                value={config.socialLinks.youtube || ""}
                onChange={(e) => updateSocialLink("youtube", e.target.value)}
                placeholder="@khatpodcast"
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Instagram
              </label>
              <Input
                value={config.socialLinks.instagram || ""}
                onChange={(e) => updateSocialLink("instagram", e.target.value)}
                placeholder="@khatpodcast"
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                TikTok
              </label>
              <Input
                value={config.socialLinks.tiktok || ""}
                onChange={(e) => updateSocialLink("tiktok", e.target.value)}
                placeholder="@khatpodcast"
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                X (Twitter)
              </label>
              <Input
                value={config.socialLinks.x || ""}
                onChange={(e) => updateSocialLink("x", e.target.value)}
                placeholder="@khatpodcast"
                className="rounded-xl"
                dir="ltr"
              />
            </div>
          </div>
        </EditorSection>
      </div>
    </div>
  )
}

/* ─── Sub-Components ─── */

function EditorSection({
  number,
  title,
  titleEn,
  children,
}: {
  number: string
  title: string
  titleEn: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-border/20 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {number}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{titleEn}</p>
        </div>
      </div>
      <div className="space-y-6 p-6">{children}</div>
    </div>
  )
}

function BilingualField({
  label,
  labelEn,
  valueAr,
  valueEn,
  onChangeAr,
  onChangeEn,
  rows = 4,
}: {
  label: string
  labelEn: string
  valueAr: string
  valueEn: string
  onChangeAr: (v: string) => void
  onChangeEn: (v: string) => void
  rows?: number
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {label} (عربي)
        </label>
        <textarea
          value={valueAr}
          onChange={(e) => onChangeAr(e.target.value)}
          rows={rows}
          dir="rtl"
          className="w-full resize-none rounded-xl border border-border/30 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {labelEn} (English)
        </label>
        <textarea
          value={valueEn}
          onChange={(e) => onChangeEn(e.target.value)}
          rows={rows}
          dir="ltr"
          className="w-full resize-none rounded-xl border border-border/30 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
      </div>
    </div>
  )
}
