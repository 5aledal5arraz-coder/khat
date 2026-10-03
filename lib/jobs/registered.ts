/**
 * Single import target that pulls in every handler module for its
 * side-effect registration. The worker entry imports this file before
 * starting the claim loop. Add new handler imports here as features
 * land.
 */

import "./handlers/demo"
import "./handlers/youtube-performance"
// Weekly YouTube audience snapshot refresh (last 28 days, OAuth Analytics API).
import "./handlers/youtube-audience"
// v1 discovery engine retired — v2 (./handlers/discovery-v2) is the only engine.
import "./handlers/discovery-v2"
import "./handlers/market-intelligence"
import "./handlers/market-scoring"
import "./handlers/original-thinking"
// Phase 2.1 (P2.1.b) — stale-running ai_runs sweeper.
import "./handlers/ai-runs-sweeper"
// Newsletter campaign delivery (resumable, fault-tolerant).
import "./handlers/newsletter-send"
// Partnership CRM — daily overdue/due-soon task reminder digest.
import "./handlers/partner-task-reminder"
// Market intelligence — daily performance → source-trust feedback sweep.
import "./handlers/market-source-feedback"
// Model-upgrade benchmarks (evidence-based model adoption).
import "./handlers/model-benchmark"
// Studio Wave 2 — raw-episode time map (whisper timestamps + ffmpeg breaks).
import "./handlers/episode-map"
// Studio 3-phase journey (Phase 2) — edit review (whisper edited audio + pure verdict).
import "./handlers/episode-review"
// Guest candidates — profile analysis + outreach-draft generation moved off the
// nginx 120s request path (the outreach handler also PERSISTS the draft).
import "./handlers/candidate-analyze"
import "./handlers/candidate-outreach"
// Episode conversation sections — transcript-length AI generation (~132s
// measured), likewise moved off the nginx 120s request path.
import "./handlers/episode-conversation"
// Public submissions (guest / sponsor) — notification mail off the request path,
// so a Resend outage leaves a retryable job instead of a swallowed catch.
import "./handlers/submission-notify"
// Slow AI off the request path (2026-09-28): Preparation V2 generation for
// convert / bulk convert / regenerate — five AI passes, ~6 min.
import "./handlers/prep-generate-v2"
// Hybrid topic generation (2.5–9 min) — was a Server Action behind nginx 120s.
import "./handlers/season-hybrid"
// Studio full-text transcription (Whisper, chunked, minutes) — was inline in
// transcript/whisper, transcript/youtube-audio and generate-stream.
import "./handlers/studio-transcribe"
// Guided season wizard engines (batch / completion / slot / guest-first).
import "./handlers/season-batch"
// Podcast Universe M1 — channel verify / crawls / Luna guest extraction /
// person resolve / weekly incremental sync (docs/podcast-universe-plan-v1.md §B11).
import "./handlers/podcast-universe"
