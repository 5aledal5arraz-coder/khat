/**
 * Khat Brain — mandatory grounding contract for research-grade AI tasks.
 *
 * WHY this exists: the `research` task kind runs on `gpt-5.6-terra`, which
 * scores −0.22 on AA-Omniscience (Artificial Analysis, read 2026-07-25) — an
 * index from −100..+100 that penalises hallucination and does NOT penalise
 * abstention. Below zero means the model states more wrong facts than right
 * ones when it answers from memory. So for these tasks a plausible-looking
 * uncited answer is not a bonus, it's the failure mode.
 *
 * The contract, enforced by the router (the single chokepoint, same as the
 * JSON-repair ladder — so every research generator inherits it):
 *
 *   1. A task kind flagged `requiresGrounding` in the registry MUST declare a
 *      contract on the request. Omitting it throws BEFORE any spend, rather
 *      than quietly running ungrounded.
 *   2. Mode "required" carries the ids of the retrieved corpus. The router
 *      injects `MANDATORY_GROUNDING_DIRECTIVE` into the prompt and then
 *      VERIFIES the output: every citation must resolve to a real corpus id,
 *      and at least one must be present. Prompt wording alone is a request;
 *      the programmatic check is what makes it a rule.
 *   3. Mode "exempt" is for calls that are not product output — the model
 *      benchmark's fixture suite, graded programmatically against planted
 *      facts. It requires a written reason and is stamped into
 *      `ai_runs.input_snapshot`, so an exemption is auditable rather than a
 *      silent boolean bypass.
 *
 * Failures here are always LOUD: a pre-flight throw, or an `ai_runs` row
 * closed as failed with `error_class = "ungrounded_output"`. Never a
 * best-effort pass-through.
 */

/**
 * Grounding declaration attached to an `AiTaskRequest`.
 *
 * `sourceIds` are the caller's OWN ids for the retrieved corpus (the numbers
 * it printed next to each source in the prompt) — trusted, not model-fed.
 */
export type GroundingContract =
  | { mode: "required"; sourceIds: Array<number | string> }
  | { mode: "exempt"; reason: string }

/**
 * Thrown before the provider call when the contract is missing or unusable.
 * Pre-flight by design: an ungrounded research call should cost nothing.
 */
export class GroundingContractError extends Error {
  readonly taskKind: string
  constructor(taskKind: string, detail: string) {
    super(`AI Router: عقد التأريض مطلوب لمهمة "${taskKind}" — ${detail}`)
    this.name = "GroundingContractError"
    this.taskKind = taskKind
  }
}

/** `error_class` written to ai_runs when the output fails verification. */
export const UNGROUNDED_ERROR_CLASS = "ungrounded_output"

/**
 * Router-injected system clause. Single source of truth for the wording, so
 * a generator can't weaken it in its own prompt. Deliberately tells the model
 * that abstention is the correct answer when the corpus is silent — that is
 * exactly the behaviour AA-Omniscience rewards and terra defaults against.
 */
export const MANDATORY_GROUNDING_DIRECTIVE = [
  "قاعدة تأريض إلزامية (تعلو على أي تعليمات أخرى في هذه المحادثة):",
  "1. اعتمد حصراً على المصادر المرفقة في هذه الرسالة. معرفتك الداخلية ليست مصدراً،",
  "   ولا يجوز أن تكون أساساً لأي مخرج مهما بدت لك صحيحة.",
  "2. كل عنصر تُخرجه يجب أن يحمل حقل \"source_ids\" غير فارغ يشير إلى أرقام مصادر",
  "   موجودة فعلاً في المرفقات. الأرقام غير الموجودة تُبطل المخرج بالكامل.",
  "3. إذا لم تجد في المصادر ما يدعم فكرة ما، احذفها. الامتناع صحيح؛ التخمين خطأ.",
  "4. لا تخترع رابطاً ولا تاريخاً ولا اقتباساً ولا رقم مصدر.",
].join("\n")

/** Keys whose values carry citations. Matches the codebase convention. */
const CITATION_KEYS = new Set(["source_ids", "source_id"])

/**
 * Collect every citation in a parsed output, wherever it sits in the tree.
 * Shape-agnostic on purpose: the router validates claims, quotes, interviews,
 * and whatever a future research generator returns, without knowing any of
 * their schemas. Values are normalised to strings so `1` and `"1"` match.
 */
export function collectCitedSourceIds(parsed: unknown): string[] {
  const found: string[] = []
  const seen = new Set<unknown>()

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return
    // Guard against cyclic structures (parsed JSON can't be cyclic, but the
    // helper is exported and cheap to make safe).
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (CITATION_KEYS.has(key)) {
        const raw = Array.isArray(value) ? value : [value]
        for (const v of raw) {
          if (typeof v === "number" || typeof v === "string") {
            found.push(String(v).trim())
          }
        }
        continue
      }
      walk(value)
    }
  }

  walk(parsed)
  return found
}

export interface GroundingVerdict {
  ok: boolean
  /** Arabic explanation, set only when `ok` is false. */
  reason?: string
  citedCount: number
  /** Citations that don't resolve to a corpus id — i.e. fabricated. */
  unknownIds: string[]
}

/**
 * Verify a parsed research output against the declared corpus.
 *
 * Two ways to fail, both meaning "this text is not backed by what we
 * retrieved": zero citations at all, or a citation pointing at a source id
 * that was never in the corpus.
 */
export function verifyGroundedOutput(
  parsed: unknown,
  sourceIds: Array<number | string>,
): GroundingVerdict {
  const allowed = new Set(sourceIds.map((id) => String(id).trim()))
  const cited = collectCitedSourceIds(parsed)
  const unknownIds = [...new Set(cited.filter((id) => !allowed.has(id)))]

  if (cited.length === 0) {
    return {
      ok: false,
      citedCount: 0,
      unknownIds,
      reason:
        "المخرج لا يستشهد بأي مصدر من المصادر المسترجَعة — نموذج الأبحاث لا يُقبل منه ردّ من معرفته الداخلية.",
    }
  }
  if (unknownIds.length > 0) {
    return {
      ok: false,
      citedCount: cited.length,
      unknownIds,
      reason:
        `المخرج استشهد بأرقام مصادر غير موجودة في المصادر المسترجَعة (${unknownIds
          .slice(0, 10)
          .join(", ")}) — استشهاد ملفّق.`,
    }
  }
  return { ok: true, citedCount: cited.length, unknownIds: [] }
}

/**
 * Pre-flight validation of the declared contract. Throws
 * `GroundingContractError` when a grounding-required task kind arrives
 * without a usable corpus.
 */
export function assertGroundingContract(
  taskKind: string,
  contract: GroundingContract | undefined,
): GroundingContract {
  if (!contract) {
    throw new GroundingContractError(
      taskKind,
      "لم يُمرَّر أي عقد تأريض (grounding). مرّر المصادر المسترجَعة، أو أعلن إعفاءً صريحاً بسبب مكتوب.",
    )
  }
  if (contract.mode === "exempt") {
    if (!contract.reason.trim()) {
      throw new GroundingContractError(
        taskKind,
        "الإعفاء من التأريض يتطلب سبباً مكتوباً (reason).",
      )
    }
    return contract
  }
  if (contract.sourceIds.length === 0) {
    throw new GroundingContractError(
      taskKind,
      "قائمة المصادر فارغة — لا يجوز تشغيل مهمة أبحاث بلا مصادر مسترجَعة.",
    )
  }
  return contract
}
