/**
 * Review follow-up (noura/rashid) to defect #5: once embeddings take a
 * rate-limit permit, an ENFORCED block (e.g. > 10 concurrent light-tier calls)
 * throws RateLimitError. The wizard and guest-first engines embedded each card
 * with a bare Promise.all — one blocked embed rejected the whole batch AFTER
 * the paid generation call. Now each card's embed degrades to an empty vector:
 * no similarity / corpus adjustment for that card, the batch survives.
 */
import { describe, it, expect } from "vitest"
import { embedEachOrEmpty, scanNegatives } from "@/lib/khat-map/v2/embedding-pipeline"
import { RateLimitError } from "@/lib/ai-router/rate-limit"
import { corpusProximity } from "@/lib/corpus/novelty"

describe("embedEachOrEmpty — enforce mode, > 10 concurrent", () => {
  it("cards over the concurrency limit get [] instead of failing the batch", async () => {
    let inFlight = 0
    const LIMIT = 10
    const embed = async () => {
      inFlight++
      try {
        if (inFlight > LIMIT) {
          throw new RateLimitError("blocked_concurrency", `light-tier concurrency limit reached (${inFlight}/${LIMIT})`)
        }
        await new Promise((r) => setTimeout(r, 5))
        return [0.1, 0.2, 0.3]
      } finally {
        inFlight--
      }
    }
    const texts = Array.from({ length: 14 }, (_, i) => `t${i}`)
    const out = await embedEachOrEmpty({ embed }, texts)
    expect(out).toHaveLength(14)
    expect(out.filter((v) => v.length === 3)).toHaveLength(10)
    expect(out.filter((v) => v.length === 0)).toHaveLength(4)
  })

  it("an empty vector is inert downstream (no block, no corpus pull)", () => {
    const neg = [{ embedding: [0.1, 0.2, 0.3], title_ar: "x" }] as never
    expect(scanNegatives([], neg).verdict).toBe("ok")
    expect(corpusProximity([], { saturated: [], whiteSpace: [] } as never)).toEqual({ saturation: 0, whitespace: 0 })
  })
})
