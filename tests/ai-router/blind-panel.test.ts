/**
 * Blind judgment panel — the arithmetic and the blinding.
 *
 * Two things are worth pinning here and nothing else is:
 *   1. The numbers. They decide a model adoption, and the ±21.9 that gets
 *      printed on screen has to actually be 21.9.
 *   2. The blinding. `toPublicView` is the ONLY thing standing between the
 *      judge and the answer sheet; if it ever leaks a source while
 *      un-revealed, the whole instrument silently becomes worthless while
 *      continuing to produce confident-looking output.
 */

import { describe, expect, it } from "vitest"
import {
  binomialCoefficient,
  binomialPmfHalf,
  signTestP,
  marginOfErrorPct,
  tallyPanel,
  judgeAgreement,
  verdictToSource,
  toPublicView,
  parseSession,
  PANEL_PAIR_COUNT,
  CLEAR_DIFFERENCE_AT,
  NO_DIFFERENCE_AT_OR_BELOW,
  BLIND_PANEL_VERSION,
  type PanelPairResult,
  type PanelSource,
  type PanelVerdict,
  type BlindPanelSession,
} from "@/lib/ai-router/blind-panel"

// ─── Binomial primitives ─────────────────────────────────────────────────────

describe("binomial primitives", () => {
  it("C(20,10) is exact — no floating drift from the divide-as-you-go loop", () => {
    expect(binomialCoefficient(20, 10)).toBe(184756)
    expect(binomialCoefficient(20, 0)).toBe(1)
    expect(binomialCoefficient(20, 20)).toBe(1)
    expect(binomialCoefficient(5, 2)).toBe(10)
  })

  it("out-of-range k is 0, not NaN", () => {
    expect(binomialCoefficient(20, 21)).toBe(0)
    expect(binomialCoefficient(20, -1)).toBe(0)
  })

  it("the pmf over 0..n sums to 1", () => {
    let sum = 0
    for (let k = 0; k <= 20; k++) sum += binomialPmfHalf(20, k)
    expect(sum).toBeCloseTo(1, 12)
  })
})

describe("signTestP", () => {
  // Reference values for the two-sided sign test at p=0.5, n=20.
  it.each([
    [20, 0, 0.0000019],
    [16, 4, 0.011819],
    [15, 5, 0.041389],
    [14, 6, 0.115318],
    [13, 7, 0.263177],
    [12, 8, 0.50344],
    [10, 10, 1],
  ])("%i–%i → p ≈ %f", (a, b, expected) => {
    expect(signTestP(a, b)).toBeCloseTo(expected, 5)
  })

  it("is symmetric — which side leads cannot change the p-value", () => {
    expect(signTestP(14, 6)).toBeCloseTo(signTestP(6, 14), 12)
  })

  it("never exceeds 1 (the doubled tail double-counts the centre)", () => {
    for (let a = 0; a <= 20; a++) expect(signTestP(a, 20 - a)).toBeLessThanOrEqual(1)
  })

  it("an empty panel is p=1, not NaN", () => {
    expect(signTestP(0, 0)).toBe(1)
  })
})

describe("marginOfErrorPct", () => {
  /**
   * THE number printed on the panel. Rashid's design specified ±21.9 points
   * at 20 pairs and the UI states it as a literal, so the code that computes
   * it has to agree with the string a reader sees.
   */
  it("is ±21.9 points at 20 pairs — the figure the UI prints", () => {
    expect(marginOfErrorPct(PANEL_PAIR_COUNT)).toBeCloseTo(21.9, 1)
  })

  it("shrinks with the square root of n, so doubling to 40 buys only ~4.4 points", () => {
    const at20 = marginOfErrorPct(20)
    const at40 = marginOfErrorPct(40)
    expect(at20 - at40).toBeCloseTo(6.4, 1)
    expect(at40).toBeCloseTo(15.5, 1)
  })

  it("is 0 at n=0 rather than Infinity", () => {
    expect(marginOfErrorPct(0)).toBe(0)
  })
})

// ─── Verdict mapping ─────────────────────────────────────────────────────────

describe("verdictToSource", () => {
  it("maps a verdict through the pair's own shuffle", () => {
    expect(verdictToSource("a", "current")).toBe("current")
    expect(verdictToSource("b", "current")).toBe("candidate")
    expect(verdictToSource("a", "candidate")).toBe("candidate")
    expect(verdictToSource("b", "candidate")).toBe("current")
  })

  it("a tie favours neither side", () => {
    expect(verdictToSource("tie", "current")).toBeNull()
    expect(verdictToSource("tie", "candidate")).toBeNull()
  })
})

// ─── Tally + the pre-registered rule ─────────────────────────────────────────

/** Build a panel where `current` wins `cur`, `candidate` wins `cand`, rest tie. */
function panel(cur: number, cand: number, ties = 0): PanelPairResult[] {
  const out: PanelPairResult[] = []
  // Alternate which source sits in slot A so the mapping is genuinely
  // exercised rather than being the identity.
  const push = (winner: PanelSource | null) => {
    const aSource: PanelSource = out.length % 2 === 0 ? "current" : "candidate"
    let verdict: PanelVerdict
    if (winner === null) verdict = "tie"
    else verdict = winner === aSource ? "a" : "b"
    out.push({ aSource, verdict })
  }
  for (let i = 0; i < cur; i++) push("current")
  for (let i = 0; i < cand; i++) push("candidate")
  for (let i = 0; i < ties; i++) push(null)
  return out
}

describe("tallyPanel — counting", () => {
  it("counts through each pair's shuffle, not by slot", () => {
    const t = tallyPanel(panel(13, 7))
    expect(t.currentWins).toBe(13)
    expect(t.candidateWins).toBe(7)
    expect(t.leader).toBe("current")
    expect(t.leaderCount).toBe(13)
  })

  it("an exact 10–10 has no leader", () => {
    expect(tallyPanel(panel(10, 10)).leader).toBeNull()
  })

  it("ties are counted but belong to nobody", () => {
    const t = tallyPanel(panel(9, 8, 3))
    expect(t.ties).toBe(3)
    expect(t.currentWins + t.candidateWins + t.ties).toBe(20)
    expect(t.signTestN).toBe(17)
  })
})

describe("tallyPanel — the pre-registered stopping rule", () => {
  it("≥14 of 20 is a clear difference", () => {
    expect(tallyPanel(panel(14, 6)).outcome).toBe("clear_difference")
    expect(tallyPanel(panel(20, 0)).outcome).toBe("clear_difference")
    expect(tallyPanel(panel(6, 14)).outcome).toBe("clear_difference")
  })

  it("≤12 of 20 is no detectable difference — keep current", () => {
    expect(tallyPanel(panel(12, 8)).outcome).toBe("no_difference")
    expect(tallyPanel(panel(10, 10)).outcome).toBe("no_difference")
    expect(tallyPanel(panel(11, 9)).outcome).toBe("no_difference")
  })

  it("13–7 is the single case that earns 20 more pairs", () => {
    expect(tallyPanel(panel(13, 7)).outcome).toBe("inconclusive")
    expect(tallyPanel(panel(7, 13)).outcome).toBe("inconclusive")
  })

  it("the thresholds are contiguous — no split falls through the rule", () => {
    expect(NO_DIFFERENCE_AT_OR_BELOW + 1).toBe(CLEAR_DIFFERENCE_AT - 1)
    for (let cur = 10; cur <= 20; cur++) {
      const outcome = tallyPanel(panel(cur, 20 - cur)).outcome
      expect(["clear_difference", "no_difference", "inconclusive"]).toContain(outcome)
    }
  })

  /**
   * Ties push toward "no difference" — the conservative direction. A 12–5
   * with 3 ties must NOT be promoted to a clear result by dropping the ties
   * and rescaling; that would turn "he could not tell them apart three times"
   * into evidence that he could.
   */
  it("ties cannot be rescaled away into a clear difference", () => {
    const t = tallyPanel(panel(12, 5, 3))
    expect(t.leaderCount).toBe(12)
    expect(t.outcome).toBe("no_difference")
  })

  it("an unfinished panel reports incomplete — the rule needs all 20", () => {
    const partial = panel(14, 5)
    partial.push({ aSource: "current", verdict: null })
    const t = tallyPanel(partial)
    expect(t.decided).toBe(19)
    expect(t.outcome).toBe("incomplete")
  })

  it("14–6 is 'clear' by the rule yet p≈0.115 — both are reported", () => {
    // Pinning the disagreement on purpose. It is real, the UI shows both
    // numbers, and a future 'simplification' that reports only one would be
    // choosing which answer to like.
    const t = tallyPanel(panel(14, 6))
    expect(t.outcome).toBe("clear_difference")
    expect(t.pValue).toBeGreaterThan(0.05)
  })

  it("reports the leader's share of ALL pairs, ties included in the base", () => {
    const t = tallyPanel(panel(12, 5, 3))
    expect(t.leaderSharePct).toBeCloseTo(60, 6)
    expect(t.marginPct).toBeCloseTo(21.9, 1)
  })
})

// ─── Judge agreement ─────────────────────────────────────────────────────────

describe("judgeAgreement", () => {
  const withJudge = (
    rows: Array<[PanelVerdict | null, PanelVerdict | null]>,
  ): PanelPairResult[] =>
    rows.map(([verdict, judgeVerdict]) => ({ aSource: "current", verdict, judgeVerdict }))

  it("counts exact matches, ties included", () => {
    const a = judgeAgreement(
      withJudge([
        ["a", "a"],
        ["b", "b"],
        ["tie", "tie"],
        ["a", "b"],
      ]),
    )
    expect(a.comparable).toBe(4)
    expect(a.agreed).toBe(3)
    expect(a.agreementPct).toBeCloseTo(75, 6)
  })

  it("skips pairs where either side has no verdict", () => {
    const a = judgeAgreement(
      withJudge([
        ["a", "a"],
        [null, "a"],
        ["b", null],
      ]),
    )
    expect(a.comparable).toBe(1)
    expect(a.agreementPct).toBe(100)
  })

  /**
   * The reason `chancePct` exists. A judge that answers "a" every time,
   * against a human who happens to say "a" 75% of the time, scores 75%
   * agreement while carrying no information at all. Chance agreement for
   * that pairing is also 75% — so the gap, not the raw number, is the signal.
   */
  it("exposes a constant judge as chance-level", () => {
    const a = judgeAgreement(
      withJudge([
        ["a", "a"],
        ["a", "a"],
        ["a", "a"],
        ["b", "a"],
      ]),
    )
    expect(a.agreementPct).toBeCloseTo(75, 6)
    expect(a.chancePct).toBeCloseTo(75, 6)
  })

  it("a perfectly matching judge beats chance", () => {
    const a = judgeAgreement(
      withJudge([
        ["a", "a"],
        ["b", "b"],
        ["a", "a"],
        ["b", "b"],
      ]),
    )
    expect(a.agreementPct).toBe(100)
    expect(a.chancePct).toBeCloseTo(50, 6)
  })

  it("nothing comparable → null, never 0% (which would read as disagreement)", () => {
    const a = judgeAgreement(withJudge([[null, null]]))
    expect(a.agreementPct).toBeNull()
    expect(a.chancePct).toBeNull()
  })
})

// ─── The blinding ────────────────────────────────────────────────────────────

function makeSession(over: Partial<BlindPanelSession> = {}): BlindPanelSession {
  return {
    version: BLIND_PANEL_VERSION,
    id: "session-1",
    createdAt: "2026-07-26T00:00:00.000Z",
    currentModel: "gpt-5.6-luna",
    candidateModel: "gemini-3.6-flash",
    judgeModel: "gpt-5.6-sol",
    promptVersion: "youtube-pack-section-v1.1",
    pairs: [
      {
        index: 1,
        episodeId: "ep-1",
        episodeTitle: "حلقة",
        section: "titles",
        aText: "نص أ",
        aSource: "candidate",
        bText: "نص ب",
        bSource: "current",
        judgeVerdict: "a",
      },
    ],
    verdicts: {},
    revealedAt: null,
    ...over,
  }
}

describe("toPublicView — the answer sheet must not travel with the exam", () => {
  it("withholds sources, model names and the judge while blind", () => {
    const view = toPublicView(makeSession())
    expect(view.revealed).toBe(false)
    expect(view.currentModel).toBeUndefined()
    expect(view.candidateModel).toBeUndefined()
    expect(view.judgeModel).toBeUndefined()
    expect(view.pairs[0].aSource).toBeUndefined()
    expect(view.pairs[0].bSource).toBeUndefined()
    expect(view.pairs[0].judgeVerdict).toBeUndefined()
  })

  it("leaks nothing through serialisation — the real leak surface", () => {
    // The component receives JSON over the RSC boundary, so the guarantee
    // that matters is about the serialised payload, not about which fields a
    // component chose to render.
    const json = JSON.stringify(toPublicView(makeSession()))
    expect(json).not.toContain("candidate")
    expect(json).not.toContain("current")
    expect(json).not.toContain("gemini")
    expect(json).not.toContain("gpt-5.6")
  })

  it("still carries everything needed to judge", () => {
    const view = toPublicView(makeSession())
    expect(view.pairs[0].aText).toBe("نص أ")
    expect(view.pairs[0].bText).toBe("نص ب")
    expect(view.pairs[0].episodeTitle).toBe("حلقة")
    expect(view.pairs[0].section).toBe("titles")
  })

  it("carries the human's own verdict back so choices survive a reload", () => {
    const view = toPublicView(makeSession({ verdicts: { "1": "b" } }))
    expect(view.pairs[0].verdict).toBe("b")
  })

  it("releases sources, models and the judge only after reveal", () => {
    const view = toPublicView(makeSession({ revealedAt: "2026-07-26T01:00:00.000Z" }))
    expect(view.revealed).toBe(true)
    expect(view.currentModel).toBe("gpt-5.6-luna")
    expect(view.candidateModel).toBe("gemini-3.6-flash")
    expect(view.pairs[0].aSource).toBe("candidate")
    expect(view.pairs[0].judgeVerdict).toBe("a")
  })
})

describe("parseSession", () => {
  it("round-trips a valid session", () => {
    const parsed = parseSession(JSON.parse(JSON.stringify(makeSession())))
    expect(parsed?.pairs).toHaveLength(1)
    expect(parsed?.pairs[0].aSource).toBe("candidate")
  })

  it("rejects a row from an older shape rather than half-reading it", () => {
    expect(parseSession({ ...makeSession(), version: 0 })).toBeNull()
  })

  it("rejects a pair missing its source — an unlabelled pair is uncountable", () => {
    const bad = makeSession()
    const pairs = JSON.parse(JSON.stringify(bad.pairs)) as Array<Record<string, unknown>>
    delete pairs[0].aSource
    expect(parseSession({ ...bad, pairs })).toBeNull()
  })

  it("drops junk verdicts instead of storing them", () => {
    const parsed = parseSession({ ...makeSession(), verdicts: { "1": "maybe", "2": "a" } })
    expect(parsed?.verdicts).toEqual({ "2": "a" })
  })

  it("treats a non-object / empty row as no session", () => {
    expect(parseSession(null)).toBeNull()
    expect(parseSession("nope")).toBeNull()
    expect(parseSession({ ...makeSession(), pairs: [] })).toBeNull()
  })
})
