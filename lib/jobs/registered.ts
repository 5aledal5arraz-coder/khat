/**
 * Single import target that pulls in every handler module for its
 * side-effect registration. The worker entry imports this file before
 * starting the claim loop. Add new handler imports here as features
 * land.
 */

import "./handlers/demo"
import "./handlers/youtube-performance"
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
