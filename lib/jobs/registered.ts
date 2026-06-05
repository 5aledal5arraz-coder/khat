/**
 * Single import target that pulls in every handler module for its
 * side-effect registration. The worker entry imports this file before
 * starting the claim loop. Add new handler imports here as features
 * land.
 */

import "./handlers/demo"
import "./handlers/youtube-performance"
import "./handlers/discovery"
import "./handlers/discovery-v2"
import "./handlers/market-intelligence"
import "./handlers/market-scoring"
import "./handlers/original-thinking"
// Phase 2.1 (P2.1.b) — stale-running ai_runs sweeper.
import "./handlers/ai-runs-sweeper"
