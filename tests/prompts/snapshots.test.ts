/**
 * Phase 0 — Prompt-builder snapshot tests.
 *
 * Purpose: prove the prompt-builder refactor (P0.5) is byte-equivalent
 * to the previous inline code. Fixed inputs in → fixed strings out.
 *
 * If a future edit changes the prompt body, the test fails and forces
 * the author to:
 *   (a) bump the corresponding VERSION constant in the builder, AND
 *   (b) update the snapshot file with `vitest -u`.
 *
 * That coupling is what makes ai_runs.prompt_version trustworthy:
 * a snapshot drift without a VERSION bump cannot ship.
 */

import { describe, expect, it } from "vitest"
import {
  buildOriginalThinkingPrompt,
  ORIGINAL_THINKING_PROMPT_VERSION,
} from "@/lib/ai/prompts/original-thinking"
import {
  buildHybridTopicsPrompt,
  HYBRID_TOPICS_PROMPT_VERSION,
} from "@/lib/ai/prompts/hybrid-topics"
import {
  buildDiscoveryArchetypesPrompt,
  DISCOVERY_ARCHETYPES_PROMPT_VERSION,
} from "@/lib/ai/prompts/discovery-archetypes"
import {
  buildDiscoveryVerifyPrompt,
  DISCOVERY_VERIFY_PROMPT_VERSION,
} from "@/lib/ai/prompts/discovery-verify"
import {
  buildStudioPackagePrompt,
  STUDIO_PACKAGE_PROMPT_VERSION,
} from "@/lib/ai/prompts/studio-package"
// Phase 2.0 Batch 1 — newly-extracted builders.
import {
  buildTranscriptQuotesPrompt,
  TRANSCRIPT_QUOTES_PROMPT_VERSION,
} from "@/lib/ai/prompts/transcript-quotes"
import {
  buildStudioAnalysisPrompt,
  STUDIO_ANALYSIS_PROMPT_VERSION,
} from "@/lib/ai/prompts/studio-analysis"
import {
  buildBestIntroPrompt,
  BEST_INTRO_PROMPT_VERSION,
} from "@/lib/ai/prompts/best-intro"
import {
  buildEditSuggestionsPrompt,
  EDIT_SUGGESTIONS_PROMPT_VERSION,
} from "@/lib/ai/prompts/edit-suggestions"
// Phase 2.0 Batch 2 — newly-extracted builders.
import {
  buildGuestIntelligencePrompt,
  GUEST_INTELLIGENCE_PROMPT_VERSION,
} from "@/lib/ai/prompts/guest-intelligence"
import {
  PREP_SYSTEM_BASE,
  PREP_EXEC_SUMMARY_SYSTEM,
  PREP_EXEC_SUMMARY_PROMPT_VERSION,
  PREP_KNOWLEDGE_BANK_SYSTEM,
  PREP_KNOWLEDGE_BANK_PROMPT_VERSION,
  buildPrepEpisodeFlowSystem,
  PREP_EPISODE_FLOW_PROMPT_VERSION,
  buildPrepQuestionSystemSystem,
  PREP_QUESTION_SYSTEM_PROMPT_VERSION,
  PREP_VIRAL_MOMENTS_PROMPT_VERSION,
  PREP_VIRAL_MOMENTS_SYSTEM,
} from "@/lib/ai/prompts/preparation-sections"
import {
  CARD_ENRICHMENT_SYSTEM,
  CARD_ENRICHMENT_PROMPT_VERSION,
  buildCardEnrichmentUser,
  CARD_MATERIALS_SYSTEM,
  CARD_MATERIALS_PROMPT_VERSION,
  buildCardMaterialsUser,
} from "@/lib/ai/prompts/interview-cards"
import {
  buildYoutubePackFullPrompt,
  YOUTUBE_PACK_FULL_PROMPT_VERSION,
  buildYoutubePackSectionPrompt,
  YOUTUBE_PACK_SECTION_PROMPT_VERSION,
} from "@/lib/ai/prompts/youtube-pack"
import {
  buildSponsorshipAnalysisPrompt,
  SPONSORSHIP_ANALYSIS_PROMPT_VERSION,
  buildSponsorshipProposalPrompt,
  SPONSORSHIP_PROPOSAL_PROMPT_VERSION,
} from "@/lib/ai/prompts/sponsorship"
import {
  buildGuestExtractPrompt,
  GUEST_EXTRACT_PROMPT_VERSION,
  buildGuestDetectionBatchPrompt,
  GUEST_DETECTION_BATCH_PROMPT_VERSION,
} from "@/lib/ai/prompts/guest-extract"
import {
  buildGuestApplicationAnalysisPrompt,
  GUEST_APPLICATION_ANALYSIS_PROMPT_VERSION,
  buildGuestApplicationConceptPrompt,
  GUEST_APPLICATION_CONCEPT_PROMPT_VERSION,
  buildGuestApplicationResponsesPrompt,
  GUEST_APPLICATION_RESPONSES_PROMPT_VERSION,
} from "@/lib/ai/prompts/guest-application"
import {
  CANDIDATE_ANALYSIS_SYSTEM,
  CANDIDATE_ANALYSIS_PROMPT_VERSION,
  buildCandidateAnalysisUser,
} from "@/lib/ai/prompts/candidate-analysis"
import {
  buildCandidateOutreachSystem,
  buildCandidateOutreachUser,
  CANDIDATE_OUTREACH_PROMPT_VERSION,
} from "@/lib/ai/prompts/candidate-outreach"
import type { GuestApplication, GuestApplicationAnalysis, SponsorshipLead, SponsorshipAnalysis } from "@/types/database"

// ─── Original Thinking ──────────────────────────────────────────────

describe("buildOriginalThinkingPrompt", () => {
  it("produces a stable snapshot for a fixed input (Arabic, no Kuwait bias)", () => {
    const lenses = [
      {
        key: "betrayal_of_self",
        name_ar: "خيانة الذات",
        name_en: "Betrayal of Self",
        description: "The slow erosion that happens when someone trades a piece of who they are for safety.",
        question_kinds: ["When did you first know you were performing?", "What part of you did you mute?"],
        avoid: ["Generic 'be authentic' self-help"],
      },
      {
        key: "unspoken_grief",
        name_ar: "الحزن غير المعلن",
        name_en: "Unspoken Grief",
        description: "Loss that doesn't fit a recognized name.",
        question_kinds: ["What loss did you carry alone?"],
        avoid: ["Conventional bereavement narratives"],
      },
    ]
    const built = buildOriginalThinkingPrompt({
      language: "ar",
      count: 6,
      lenses,
      excludedTitles: ["كيف تنجح في الحياة", "5 أسرار للسعادة"],
      allowKuwaitBias: false,
    })
    expect(built.version).toBe(ORIGINAL_THINKING_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })

  it("flips the Kuwait directive when allowKuwaitBias is true", () => {
    const built = buildOriginalThinkingPrompt({
      language: "ar",
      count: 3,
      lenses: [],
      excludedTitles: [],
      allowKuwaitBias: true,
    })
    expect(built.system).toContain("Kuwait-specific framing IS welcome on this run.")
    expect(built.system).not.toContain("Do NOT use Kuwait-specific framing")
  })
})

// ─── Hybrid Topics ──────────────────────────────────────────────────

describe("buildHybridTopicsPrompt", () => {
  it("produces a stable snapshot for a fixed editorial input", () => {
    const built = buildHybridTopicsPrompt({
      language: "ar",
      count: 10,
      allowKuwaitBias: false,
      originalTopics: [
        {
          id: "orig-001",
          title: "حين يصبح النجاح غريباً عن صاحبه",
          lens: "betrayal_of_self",
          conflict: "بعد سنوات من المطاردة، يجد البطل أن النجاح كان قناعاً.",
          emotional_hook: "في اللحظة التي وصل، شعر بأن البيت ليس بيته.",
        },
      ],
      marketClusters: [
        {
          label: "أبوة جديدة في عالم متغير",
          language: "ar",
          signal_count: 42,
          dominant_emotions: ["fear", "longing"],
          median_view_signal: 50000,
          source_breakdown: { youtube: 30, podcast: 12 },
          narrative_hooks: ["كيف تربي أبناءك في زمن الشاشات", "أبي لم يرني أبداً"],
        },
      ],
      workedReport: {
        generated_at: "2026-05-22T00:00:00.000Z",
        strong_topic_domains: [{ key: "philosophy", mean_score: 0.78, sample_size: 5, median_views: 120000 }],
        weak_topic_domains: [{ key: "money_career", mean_score: 0.31, sample_size: 4, median_views: 8000 }],
        top_episodes: [],
        weak_episodes: [],
        strong_episode_types: [],
        weak_episode_types: [],
        strong_guests: [],
        recommendations: [],
      },
      tasteHints: [
        { dimension: "theme", key: "loss", weight: 0.72 },
        { dimension: "source", key: "manipulative_clickbait", weight: -0.55 },
      ],
      excludedTitles: ["كيف تصبح مليونيراً"],
      lenses: [
        {
          key: "betrayal_of_self",
          name_ar: "خيانة الذات",
          name_en: "Betrayal of Self",
          description: "The slow erosion.",
          question_kinds: ["Q"],
          avoid: ["A"],
        },
      ],
    })
    expect(built.version).toBe(HYBRID_TOPICS_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })

  it("renders the foundational-path message when market clusters are empty", () => {
    const built = buildHybridTopicsPrompt({
      language: "ar",
      count: 3,
      allowKuwaitBias: false,
      originalTopics: [],
      marketClusters: [],
      workedReport: {
        generated_at: "2026-05-22T00:00:00.000Z",
        strong_topic_domains: [],
        weak_topic_domains: [],
        top_episodes: [],
        weak_episodes: [],
        strong_episode_types: [],
        weak_episode_types: [],
        strong_guests: [],
        recommendations: [],
      },
      tasteHints: [],
      excludedTitles: [],
      lenses: [],
    })
    expect(built.user).toContain("foundational path — market clusters unavailable")
  })
})

// ─── Discovery Archetypes ───────────────────────────────────────────

describe("buildDiscoveryArchetypesPrompt", () => {
  it("produces a stable snapshot with seed + editorial context", () => {
    const built = buildDiscoveryArchetypesPrompt({
      count: 8,
      seedPrompt: "نريد ضيوفاً عاشوا تحولات صادقة في علاقتهم بالدين.",
      editorialContext:
        "خط بودكاست ليس بودكاست اتجاهات سطحي. خط يقدم محتوى عميقاً ذا قيمة دائمة.",
    })
    expect(built.version).toBe(DISCOVERY_ARCHETYPES_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })

  it("omits null seed prompt and editorial context cleanly", () => {
    const built = buildDiscoveryArchetypesPrompt({ count: 5 })
    expect(built.user).toBe("أنتج 5 نماذج بشرية. JSON فقط.")
  })
})

// ─── Discovery Verify ───────────────────────────────────────────────

describe("buildDiscoveryVerifyPrompt", () => {
  it("produces a stable snapshot for a fixed candidate", () => {
    const built = buildDiscoveryVerifyPrompt({
      archetype: {
        id: "quiet_expert",
        name: "خبير هادئ ذو حضور صادق",
        description: "شخص يعرف موضوعه بعمق دون أن يصرخ بمؤهلاته.",
        target_signals: ["هدوء", "خبرة عميقة"],
        expected_traits: ["تواضع", "صدق"],
      },
      proposedName: "د. سالم العنزي",
      proposedRole: "باحث في الأنثروبولوجيا",
      proposedCountry: "الكويت",
      evidenceUrls: [
        {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=abc",
          title: "محاضرة عن الأنثروبولوجيا في الخليج",
          snippet: "تأملات هادئة في علاقة الإنسان بالمكان.",
          fetched_at: "2026-05-01T00:00:00Z",
        },
      ],
    })
    expect(built.version).toBe(DISCOVERY_VERIFY_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })

  it("handles missing evidence gracefully", () => {
    const built = buildDiscoveryVerifyPrompt({
      archetype: {
        id: "x",
        name: "y",
        description: "z",
        target_signals: [],
        expected_traits: [],
      },
      evidenceUrls: [],
    })
    expect(built.user).toContain("(لا توجد أدلة)")
    expect(built.user).toContain("الاسم: غير معروف")
  })
})

// ─── Studio Package ─────────────────────────────────────────────────

describe("buildStudioPackagePrompt", () => {
  it("produces a stable snapshot for a fixed episode", () => {
    const built = buildStudioPackagePrompt({
      videoTitle: "قصة الأسير السابق ناصر سالمين",
      channelTitle: "خط بودكاست",
      intelligenceBlock: "\n\n[intelligence: turning_points=4, themes=3]",
      preparedText: "بدأ الحوار بسؤال عن الهوية...",
    })
    expect(built.version).toBe(STUDIO_PACKAGE_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
})

// ─── Phase 2.0 Batch 1 — Transcript Quotes ──────────────────────────

describe("buildTranscriptQuotesPrompt", () => {
  it("produces a stable snapshot for a fixed transcript + count", () => {
    const built = buildTranscriptQuotesPrompt({
      transcript:
        "بدأت الحلقة بسؤال عن الهوية. قال الضيف: لم أكن أعرف من أنا قبل أن أفقد كل شيء. ثم أضاف أن الخسارة كانت معلمه الأكبر.",
      episodeTitle: "قصة فقدان وعودة",
      guestName: "خالد العنزي",
      count: 10,
    })
    expect(built.version).toBe(TRANSCRIPT_QUOTES_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
    expect(built.input.count).toBe(10)
    expect(built.input.transcriptTruncated).toBe(false)
  })

  it("marks transcriptTruncated when transcript exceeds 12 000 chars", () => {
    const long = "ا".repeat(15_000)
    const built = buildTranscriptQuotesPrompt({
      transcript: long,
      episodeTitle: "حلقة طويلة",
      guestName: "ضيف",
      count: 5,
    })
    expect(built.input.transcriptTruncated).toBe(true)
    expect(built.input.transcriptChars).toBe(12_000)
  })
})

// ─── Phase 2.0 Batch 1 — Studio Analysis ────────────────────────────

describe("buildStudioAnalysisPrompt", () => {
  it("produces a stable snapshot for a fixed prepared transcript + stats", () => {
    const built = buildStudioAnalysisPrompt({
      preparedTranscript: "نص الحلقة المُحضَّر للتحليل.",
      stats: {
        title: "حلقة عن التحول",
        description: "وصف الحلقة الحالي.",
        publishDate: "2026-05-01",
        duration: "01:12:34",
        viewCount: "12345",
        likeCount: "234",
        commentCount: "45",
      },
    })
    expect(built.version).toBe(STUDIO_ANALYSIS_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
    expect(built.input.hasDescription).toBe(true)
  })

  it("flips hasDescription when description is empty", () => {
    const built = buildStudioAnalysisPrompt({
      preparedTranscript: "نص قصير.",
      stats: {
        title: "بدون وصف",
        description: "",
        publishDate: "2026-05-01",
        duration: "00:30:00",
        viewCount: "100",
        likeCount: "1",
        commentCount: "0",
      },
    })
    expect(built.input.hasDescription).toBe(false)
    expect(built.user).toContain("(لا يوجد وصف)")
  })
})

// ─── Phase 2.0 Batch 1 — Best Intro ─────────────────────────────────

describe("buildBestIntroPrompt", () => {
  it("produces a stable snapshot when duration is known", () => {
    const built = buildBestIntroPrompt({
      preparedTranscript: "نص الحلقة المُحضَّر.",
      videoTitle: "العنوان",
      durationSeconds: 3600,
    })
    expect(built.version).toBe(BEST_INTRO_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
    expect(built.input.durationSeconds).toBe(3600)
  })

  it("omits duration line + flips the system rule when duration is null", () => {
    const built = buildBestIntroPrompt({
      preparedTranscript: "نص.",
      videoTitle: "بدون مدة",
      durationSeconds: null,
    })
    expect(built.system).toContain("قدّر الأوقات تقريبياً من موقع النص")
    expect(built.user).not.toContain("المدة: ~")
  })
})

// ─── Phase 2.0 Batch 1 — Edit Suggestions ───────────────────────────

describe("buildEditSuggestionsPrompt", () => {
  it("produces a stable snapshot when duration is known", () => {
    const built = buildEditSuggestionsPrompt({
      preparedTranscript: "نص الحلقة المُحضَّر.",
      videoTitle: "العنوان",
      durationSeconds: 3600,
    })
    expect(built.version).toBe(EDIT_SUGGESTIONS_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })

  it("flips the duration-bound rule when duration is null", () => {
    const built = buildEditSuggestionsPrompt({
      preparedTranscript: "نص.",
      videoTitle: "بدون مدة",
      durationSeconds: null,
    })
    expect(built.system).toContain(
      "قدّر الأوقات تقريبياً بناءً على موقع النص في الحلقة",
    )
    expect(built.user).not.toContain("المدة الكاملة: ~")
  })
})

// ═══════════════════════════════════════════════════════════════════
// Phase 2.0 Batch 2 — new builders
// ═══════════════════════════════════════════════════════════════════

describe("buildGuestIntelligencePrompt (B2)", () => {
  it("produces a stable snapshot with intelligence block present", () => {
    const built = buildGuestIntelligencePrompt({
      preparedTranscript: "نص تجريبي.",
      videoTitle: "حلقة عن الإيمان",
      intelligenceBlock: "\n\n[intel: themes=2]",
      hasIntelligence: true,
    })
    expect(built.version).toBe(GUEST_INTELLIGENCE_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("flips the intelligence-hint line when hasIntelligence=false", () => {
    const built = buildGuestIntelligencePrompt({
      preparedTranscript: "نص.",
      videoTitle: "بدون فهم مسبق",
      intelligenceBlock: "",
      hasIntelligence: false,
    })
    expect(built.system).not.toContain("⚠️ لديك فهم شامل مسبق")
  })
})

describe("preparation-sections builders (B2)", () => {
  it("PREP_SYSTEM_BASE matches snapshot", () => {
    expect(PREP_SYSTEM_BASE).toMatchSnapshot()
  })
  it("exec-summary system matches snapshot", () => {
    expect(PREP_EXEC_SUMMARY_PROMPT_VERSION).toBe("prep-exec-summary-v1.0")
    expect(PREP_EXEC_SUMMARY_SYSTEM).toMatchSnapshot()
  })
  it("knowledge-bank system matches snapshot", () => {
    expect(PREP_KNOWLEDGE_BANK_PROMPT_VERSION).toBe("prep-knowledge-bank-v1.0")
    expect(PREP_KNOWLEDGE_BANK_SYSTEM).toMatchSnapshot()
  })
  it("episode-flow system varies with duration", () => {
    const s60 = buildPrepEpisodeFlowSystem(60)
    const s90 = buildPrepEpisodeFlowSystem(90)
    expect(PREP_EPISODE_FLOW_PROMPT_VERSION).toBe("prep-episode-flow-v1.0")
    expect(s60).toMatchSnapshot()
    expect(s90).toContain("لديك مدة تقريبية: 90 دقيقة")
  })
  it("question-system embeds boldness + flowSummary", () => {
    const s = buildPrepQuestionSystemSystem(4, "blk-a: [0-10] intro — open")
    expect(PREP_QUESTION_SYSTEM_PROMPT_VERSION).toBe("prep-question-system-v1.0")
    expect(s).toMatchSnapshot()
    expect(s).toContain("مستوى الجرأة = 4/5")
    expect(s).toContain("blk-a: [0-10] intro — open")
  })
  it("viral-moments system matches snapshot", () => {
    expect(PREP_VIRAL_MOMENTS_PROMPT_VERSION).toBe("prep-viral-moments-v1.0")
    expect(PREP_VIRAL_MOMENTS_SYSTEM).toMatchSnapshot()
  })
})

describe("interview-cards builders (B2)", () => {
  it("card-enrichment system matches snapshot", () => {
    expect(CARD_ENRICHMENT_PROMPT_VERSION).toBe("card-enrichment-v1.0")
    expect(CARD_ENRICHMENT_SYSTEM).toMatchSnapshot()
  })
  it("card-enrichment user builder matches snapshot", () => {
    const user = buildCardEnrichmentUser({
      prepContext: "السياق",
      sectionLabel: "افتتاح",
      bucket: "opening",
      shortTitle: "أول لقاء",
      spokenKuwaitiOriginal: "شلونك اليوم؟",
      whyThisMatters: "كسر الجليد",
      ifGuestAvoids: "ابدأ بسؤال أخف",
    })
    expect(user).toMatchSnapshot()
  })
  it("card-materials system + user match snapshots", () => {
    expect(CARD_MATERIALS_PROMPT_VERSION).toBe("card-materials-v1.0")
    expect(CARD_MATERIALS_SYSTEM).toMatchSnapshot()
    expect(buildCardMaterialsUser("بحث", "بطاقات")).toMatchSnapshot()
  })
})

describe("youtube-pack builders (B2)", () => {
  it("full-pack snapshot", () => {
    const built = buildYoutubePackFullPrompt({
      transcript: "نص الحلقة الكامل.",
      episodeTitle: "حلقة",
      guestName: "ضيف",
    })
    expect(built.version).toBe(YOUTUBE_PACK_FULL_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("section snapshot (titles)", () => {
    const built = buildYoutubePackSectionPrompt({
      transcript: "نص.",
      episodeTitle: "حلقة",
      guestName: "ضيف",
      sectionType: "titles",
    })
    expect(built.version).toBe(YOUTUBE_PACK_SECTION_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("section system varies with sectionType", () => {
    const titles = buildYoutubePackSectionPrompt({
      transcript: "نص.", episodeTitle: "حلقة", guestName: "ضيف", sectionType: "titles",
    })
    const hashtags = buildYoutubePackSectionPrompt({
      transcript: "نص.", episodeTitle: "حلقة", guestName: "ضيف", sectionType: "hashtags",
    })
    expect(titles.system).not.toBe(hashtags.system)
  })
})

describe("sponsorship builders (B2)", () => {
  const fixtureLead: SponsorshipLead = {
    id: "L-1",
    company_name: "شركة س",
    industry: "تقنية",
    contact_name: "س. م.",
    job_title: "مدير شراكات",
    email: "x@y.com",
    phone: "+965",
    collaboration_types: ["episode_sponsor"],
    collaboration_other: null,
    main_goal: "زيادة الوعي",
    target_audience: "شباب",
    preferred_timeline: null,
    budget_range: "5k-10k",
    additional_info: null,
  } as unknown as SponsorshipLead

  it("analysis snapshot", () => {
    const built = buildSponsorshipAnalysisPrompt({ lead: fixtureLead })
    expect(built.version).toBe(SPONSORSHIP_ANALYSIS_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("proposal snapshot (formal, no analysis)", () => {
    const built = buildSponsorshipProposalPrompt({
      lead: fixtureLead,
      analysis: null,
      tone: "formal",
    })
    expect(built.version).toBe(SPONSORSHIP_PROPOSAL_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("proposal system flips tone label", () => {
    const formal = buildSponsorshipProposalPrompt({ lead: fixtureLead, analysis: null, tone: "formal" })
    const warm = buildSponsorshipProposalPrompt({ lead: fixtureLead, analysis: null, tone: "warm" })
    expect(formal.system).toContain("رسمي ومهني")
    expect(warm.system).toContain("ودّي ودافئ مع احترافية")
  })
})

describe("guest-extract builders (B2)", () => {
  it("single-episode snapshot", () => {
    const built = buildGuestExtractPrompt({
      transcript: "نص الحلقة.",
      videoTitle: "حلقة 12",
    })
    expect(built.version).toBe(GUEST_EXTRACT_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("detection-batch snapshot", () => {
    const built = buildGuestDetectionBatchPrompt({
      episodesPayload: [{ episode_id: "e1", title: "T1" }],
      chunkIndex: 0,
      totalChunks: 1,
    })
    expect(built.version).toBe(GUEST_DETECTION_BATCH_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
  })
})

describe("guest-application builders (B2)", () => {
  const fixtureApp: GuestApplication = {
    id: "A-1",
    name: "ع. م.",
    country: "الكويت",
    can_travel_to_kuwait: null,
    previous_podcast: false,
    previous_podcast_info: null,
    filming_concern: "no",
    story_idea: "قصة تحول",
    beyond_job_title: "إنسان يكتب",
    life_changing_moment: "لحظة سفر",
    hope_people_understand: "الصدق",
    unasked_question: "ما السؤال الذي لم يسأل",
    why_khat: "العمق",
    prefer_dialogue_or_story: "hybrid",
    topics_to_avoid: null,
  } as unknown as GuestApplication

  it("analysis snapshot", () => {
    const built = buildGuestApplicationAnalysisPrompt({ application: fixtureApp })
    expect(built.version).toBe(GUEST_APPLICATION_ANALYSIS_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
  it("concept snapshot (with analysis)", () => {
    const fixtureAnalysis = {
      fit_score: 80, recommendation: "accept", fit_summary: "ملخص",
      strongest_angle: "زاوية", audience_value: "قيمة",
      strengths: ["a"], concerns: ["b"], suggested_direction: "اتجاه",
    } as unknown as GuestApplicationAnalysis
    const built = buildGuestApplicationConceptPrompt({ application: fixtureApp, analysis: fixtureAnalysis })
    expect(built.version).toBe(GUEST_APPLICATION_CONCEPT_PROMPT_VERSION)
    expect(built.user).toMatchSnapshot()
  })
  it("responses snapshot (no analysis)", () => {
    const built = buildGuestApplicationResponsesPrompt({ application: fixtureApp, analysis: null })
    expect(built.version).toBe(GUEST_APPLICATION_RESPONSES_PROMPT_VERSION)
    expect(built.system).toMatchSnapshot()
    expect(built.user).toMatchSnapshot()
  })
})

describe("candidate-analysis builder (B2)", () => {
  it("system + user snapshots", () => {
    expect(CANDIDATE_ANALYSIS_PROMPT_VERSION).toBe("candidate-analysis-v1.0")
    expect(CANDIDATE_ANALYSIS_SYSTEM).toMatchSnapshot()
    const fakeCandidate = {
      full_name: "خ. ع.",
      display_name: null,
      category: "تقني",
      city: "الكويت",
      country: "الكويت",
      bio: "نبذة",
      notes_internal: null,
      source_note: null,
    } as unknown as Parameters<typeof buildCandidateAnalysisUser>[0]
    expect(
      buildCandidateAnalysisUser(fakeCandidate, [
        { platform: "twitter", url: "https://x.com/x" },
      ]),
    ).toMatchSnapshot()
  })
})

describe("candidate-outreach builder (B2)", () => {
  it("system snapshot (email + formal + medium)", () => {
    expect(CANDIDATE_OUTREACH_PROMPT_VERSION).toBe("candidate-outreach-v1.0")
    expect(buildCandidateOutreachSystem("email", "formal", "medium")).toMatchSnapshot()
  })
  it("system varies with channel (whatsapp drops subject line rule)", () => {
    const email = buildCandidateOutreachSystem("email", "formal", "medium")
    const whatsapp = buildCandidateOutreachSystem("whatsapp", "formal", "medium")
    expect(email).toContain("ابدأ بسطر موضوع")
    expect(whatsapp).toContain("لا تكتب سطر موضوع")
  })
  it("user snapshot uses ai_summary when present", () => {
    const fakeCandidate = {
      full_name: "خ.",
      display_name: null,
      category: "كاتب",
      bio: "نبذة",
      ai_summary: "تحليل مسبق",
      ai_reason_to_invite: "سبب",
      ai_topics_json: ["موضوع 1", "موضوع 2"],
    } as unknown as Parameters<typeof buildCandidateOutreachUser>[0]
    expect(buildCandidateOutreachUser(fakeCandidate, [], "ملاحظة فريق")).toMatchSnapshot()
  })
})
