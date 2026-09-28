/**
 * A failed discovery run says WHY in the operator's words (2026-09-28).
 * Prod run for episode 93c83176 failed on two 180s propose timeouts and the
 * page answered «جرّب موضوعاً أوسع أو خفّف الفلاتر» — wrong advice for a
 * timeout. That advice now belongs to the genuine zero-names case only.
 */
import { describe, it, expect } from "vitest"
import {
  proposeErrorKind,
  resolveV2RunErrorKind,
  v2RunFailureMessage,
  type V2RunErrorKind,
} from "@/lib/discovery-v2/run-failure"
import {
  buildEpisodeDiscoveryTopic,
  displayDiscoveryTopic,
  topicDomainLabel,
} from "@/lib/discovery-v2/topic"

const BROADER = "جرّب موضوعاً أوسع"

describe("propose failure → kind", () => {
  it("the router's timed_out status is a timeout", () => {
    expect(proposeErrorKind("timed_out", "anything")).toBe("propose_timeout")
  })
  it("the router's own timeout text is a timeout even on a plain failed status", () => {
    expect(proposeErrorKind("failed", "Provider timeout after 180000ms")).toBe("propose_timeout")
  })
  it("any other failure is propose_failed", () => {
    expect(proposeErrorKind("failed", "502 Bad Gateway")).toBe("propose_failed")
    expect(proposeErrorKind("failed", null)).toBe("propose_failed")
  })
})

describe("persisted run → kind (older runs have no kind)", () => {
  it("a stored kind wins", () => {
    expect(resolveV2RunErrorKind("propose_failed", "Provider timeout after 180000ms")).toBe("propose_failed")
  })
  it("the 2026-09-28 prod run (no kind, raw timeout text) reads as a timeout", () => {
    expect(resolveV2RunErrorKind(undefined, "Provider timeout after 180000ms")).toBe("propose_timeout")
  })
  it("the pipeline's zero-names sentinel reads as no_names", () => {
    expect(resolveV2RunErrorKind(null, "no names proposed")).toBe("no_names")
  })
  it("an unknown kind string or an unknown error falls back to error", () => {
    expect(resolveV2RunErrorKind("bogus", "wikidata down")).toBe("error")
    expect(resolveV2RunErrorKind(null, null)).toBe("error")
  })
})

describe("the operator copy", () => {
  it("a timeout says the propose ran out of time and to retry — never «جرّب موضوعاً أوسع»", () => {
    const m = v2RunFailureMessage("propose_timeout")
    expect(m).toBe("انتهت مهلة اقتراح الأسماء — أعد المحاولة.")
    expect(m).not.toContain(BROADER)
  })
  it("«جرّب موضوعاً أوسع» appears for the genuine zero-names case ONLY", () => {
    const kinds: V2RunErrorKind[] = ["propose_timeout", "propose_failed", "no_names", "error"]
    const withAdvice = kinds.filter((k) => v2RunFailureMessage(k).includes(BROADER))
    expect(withAdvice).toEqual(["no_names"])
  })
})

describe("episode topic — the domain enum never leaks into the run title", () => {
  it("money_career goes in as its Arabic label", () => {
    const t = buildEpisodeDiscoveryTopic(
      { title: "المال يتذكّر ما نسيته العائلة", topicDomain: "money_career", hook: "خطّاف" },
      "ضيف الحلقة",
    )
    expect(t).toBe("المال يتذكّر ما نسيته العائلة — مال ومسار — خطّاف")
    expect(t).not.toMatch(/[a-z_]{4,}/)
  })
  it("'none' and unknown keys are dropped, not printed", () => {
    expect(buildEpisodeDiscoveryTopic({ title: "ع", topicDomain: "none" }, "x")).toBe("ع")
    expect(buildEpisodeDiscoveryTopic({ title: "ع", topicDomain: "not_a_domain" }, "x")).toBe("ع")
    expect(topicDomainLabel(null)).toBeNull()
  })
  it("empty parts fall back", () => {
    expect(buildEpisodeDiscoveryTopic({}, "ضيف الحلقة")).toBe("ضيف الحلقة")
  })
  it("a stored pre-fix title is displayed with the label", () => {
    expect(displayDiscoveryTopic("المال يتذكّر ما نسيته العائلة — money_career — خطّاف")).toBe(
      "المال يتذكّر ما نسيته العائلة — مال ومسار — خطّاف",
    )
    // a free-text topic is untouched
    expect(displayDiscoveryTopic("الغزو العراقي للكويت")).toBe("الغزو العراقي للكويت")
  })
})
