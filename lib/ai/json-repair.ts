/**
 * Shared LLM-JSON repair toolbox.
 *
 * One home for the string-level recovery helpers that used to be
 * duplicated (with different strengths) across the khat-map hardened
 * Gemini helper and the preparation research pipeline:
 *
 *   - `sanitizeJsonResponse`   — aggressive cleanup of complete-but-dirty
 *     JSON: fences, smart quotes, control chars, comments, surrounding
 *     prose, trailing commas.
 *   - `extractLargestJsonBlock` — carve the biggest balanced `{...}` /
 *     `[...]` block out of a prose wrapper.
 *   - `repairTruncatedJson`    — truncation-aware repair: trims dangling
 *     `"key":` fragments and orphan values, then closes the open
 *     bracket stack. Returns parseable text or null.
 *   - `isObviouslyTruncated`   — cheap heuristic for "this buffer was
 *     cut off mid-stream".
 *
 * Pure string functions. No SDKs, no I/O — safe to use from any caller
 * (OpenAI, Gemini, tests).
 */

// ─── Sanitization ────────────────────────────────────────────────────

/**
 * Aggressive cleanup of an LLM response. Returns null when no plausible
 * JSON root can be recovered after cleaning.
 *
 * Operations (in order): strip markdown fences → normalize smart quotes
 * → strip control chars (except \t \n \r) → strip comments outside
 * strings → trim leading prose → trim trailing prose (depth-aware) →
 * remove trailing commas.
 */
export function sanitizeJsonResponse(raw: string): string | null {
  if (!raw) return null
  let s = raw

  // Strip fences — look for the FIRST fenced block anywhere.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fence) s = fence[1]

  // Normalize smart quotes. Double-quote variants first, then single.
  s = s
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛‹›]/g, "'")

  // Strip control characters except \t \n \r — JSON doesn't allow raw
  // control chars inside strings.
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

  // Strip // and /* */ comments outside quoted strings.
  s = stripCommentsOutsideStrings(s)

  // Trim leading prose.
  const firstStructural = s.search(/[{[]/)
  if (firstStructural < 0) return null
  s = s.slice(firstStructural)

  // Trim trailing prose — last position where depth returns to 0.
  const depthZeroEnd = findLastTopLevelClose(s)
  if (depthZeroEnd > 0) s = s.slice(0, depthZeroEnd + 1)

  // Remove trailing commas before `}` or `]`. Repeat once for nesting.
  s = s.replace(/,(\s*[}\]])/g, "$1").replace(/,(\s*[}\]])/g, "$1")

  // Sanity: still has an opening structural char and a closing one.
  if (!/^[\s]*[{[]/.test(s) || !/[}\]][\s]*$/.test(s)) return null

  return s
}

function stripCommentsOutsideStrings(s: string): string {
  let out = ""
  let inString = false
  let stringChar: '"' | "'" | null = null
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      out += ch
      escape = false
      continue
    }
    if (inString) {
      if (ch === "\\") {
        escape = true
        out += ch
        continue
      }
      if (ch === stringChar) {
        inString = false
        stringChar = null
      }
      out += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch as '"' | "'"
      out += ch
      continue
    }
    if (ch === "/" && s[i + 1] === "/") {
      const nl = s.indexOf("\n", i + 2)
      if (nl < 0) return out
      i = nl - 1
      continue
    }
    if (ch === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2)
      if (end < 0) return out
      i = end + 1
      continue
    }
    out += ch
  }
  return out
}

function findLastTopLevelClose(s: string): number {
  const stack: Array<"{" | "["> = []
  let inString = false
  let escape = false
  let last = -1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === "\\") {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{" || ch === "[") {
      stack.push(ch)
    } else if (ch === "}" || ch === "]") {
      const opener = stack[stack.length - 1]
      if ((ch === "}" && opener === "{") || (ch === "]" && opener === "[")) {
        stack.pop()
      }
      if (stack.length === 0) last = i
    }
  }
  return last
}

// ─── Largest-block extraction ────────────────────────────────────────

/**
 * Walk the raw response and return the text spanning the largest
 * balanced top-level `{...}` or `[...]` block. Used when sanitize
 * couldn't identify a clean root but parseable JSON exists somewhere
 * in the buffer (e.g. inside a prose wrapper).
 */
export function extractLargestJsonBlock(raw: string): string | null {
  if (!raw) return null
  const candidates: Array<{ start: number; end: number; length: number }> = []

  for (let open = 0; open < raw.length; open++) {
    const ch = raw[open]
    if (ch !== "{" && ch !== "[") continue
    const close = findBalancedClose(raw, open)
    if (close < 0) continue
    candidates.push({ start: open, end: close, length: close - open + 1 })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.length - a.length)
  return raw.slice(candidates[0].start, candidates[0].end + 1)
}

function findBalancedClose(s: string, start: number): number {
  const opener = s[start]
  if (opener !== "{" && opener !== "[") return -1
  const expectedClose = opener === "{" ? "}" : "]"
  const stack: string[] = [opener]
  let inString = false
  let escape = false
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === "\\") {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{" || ch === "[") stack.push(ch)
    else if (ch === "}" || ch === "]") {
      const top = stack[stack.length - 1]
      if ((ch === "}" && top === "{") || (ch === "]" && top === "[")) {
        stack.pop()
      }
      if (stack.length === 0) {
        return ch === expectedClose ? i : -1
      }
    }
  }
  return -1
}

// ─── Truncation-aware repair ─────────────────────────────────────────

/**
 * Best-effort repair of truncated JSON: strip fences/prose, then trim
 * dangling `"key":value` fragments and orphan values from the tail and
 * close the remaining open-bracket stack. Returns text that is
 * guaranteed to `JSON.parse`, or `null` when no plausible JSON root can
 * be recovered.
 *
 * Intentionally conservative — only fixes shapes actually observed in
 * LLM output. Anything weirder returns null so the caller can fall
 * through to its next recovery stage.
 */
export function repairTruncatedJson(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fence) s = fence[1].trim()

  const firstBrace = s.search(/[{[]/)
  if (firstBrace > 0) s = s.slice(firstBrace)

  const depthZeroEnd = findLastTopLevelClose(s)
  if (depthZeroEnd >= 0) s = s.slice(0, depthZeroEnd + 1)

  const tryParse = (candidate: string): string | null => {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      return null
    }
  }

  const stripTrailingCommas = (input: string): string =>
    input.replace(/,(\s*[}\]])/g, "$1")

  // The string may already be valid after fence removal.
  const fast = tryParse(stripTrailingCommas(s))
  if (fast) return fast

  /**
   * Walk the string and return (a) whether it ends inside a string
   * literal, (b) the ordered stack of unclosed structural tokens,
   * (c) the index of the last char NOT inside an unterminated string.
   */
  const analyze = (
    input: string,
  ): {
    inString: boolean
    stack: Array<"{" | "[">
    safeEnd: number
  } => {
    const stack: Array<"{" | "["> = []
    let inString = false
    let escape = false
    let safeEnd = 0
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
      if (escape) {
        escape = false
        if (!inString) safeEnd = i + 1
        continue
      }
      if (ch === "\\") {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        if (!inString) safeEnd = i + 1
        continue
      }
      if (inString) continue
      if (ch === "{") stack.push("{")
      else if (ch === "[") stack.push("[")
      else if (ch === "}") {
        if (stack[stack.length - 1] === "{") stack.pop()
      } else if (ch === "]") {
        if (stack[stack.length - 1] === "[") stack.pop()
      }
      safeEnd = i + 1
    }
    return { inString, stack, safeEnd }
  }

  /**
   * Trim a candidate prefix at the last safely-closable structural
   * boundary, then append closers for the remaining open stack.
   */
  const attemptRepair = (input: string): string | null => {
    const { inString, safeEnd } = analyze(input)
    let work = inString ? input.slice(0, safeEnd) : input

    const trimTail = (v: string): string => {
      let out = v.replace(/[,\s]+$/, "")
      for (let iter = 0; iter < 4; iter++) {
        // Key:value fragment like `,"foo": "bar` or `,"foo":`
        const kv = out.match(
          /,\s*"[^"\\]*"\s*:\s*(?:"[^"\\]*"|-?\d+(?:\.\d+)?|true|false|null|)\s*$/,
        )
        if (kv && kv.index !== undefined) {
          out = out.slice(0, kv.index).replace(/[,\s]+$/, "")
          continue
        }
        // Orphan value after a comma: `,"foo"` or `,123`.
        const orph = out.match(
          /,\s*(?:"[^"\\]*"|-?\d+(?:\.\d+)?|true|false|null)\s*$/,
        )
        if (orph && orph.index !== undefined) {
          out = out.slice(0, orph.index).replace(/[,\s]+$/, "")
          continue
        }
        // Open-colon with no value: `"foo":`
        const openColon = out.match(/"\s*[^"]*"\s*:\s*$/)
        if (openColon && openColon.index !== undefined) {
          out = out.slice(0, openColon.index).replace(/[,\s]+$/, "")
          continue
        }
        break
      }
      return out
    }

    work = trimTail(work)
    const { stack } = analyze(work)
    for (let i = stack.length - 1; i >= 0; i--) {
      work += stack[i] === "{" ? "}" : "]"
    }
    return tryParse(stripTrailingCommas(work))
  }

  const repaired = attemptRepair(stripTrailingCommas(s))
  if (repaired) return repaired

  // Last-ditch: iteratively back off one structural token at a time.
  let tail = stripTrailingCommas(s)
  for (let attempt = 0; attempt < 5; attempt++) {
    const cut = Math.max(tail.lastIndexOf("},"), tail.lastIndexOf("],"))
    if (cut < 0) break
    tail = tail.slice(0, cut + 1)
    const r = attemptRepair(tail)
    if (r) return r
  }
  return null
}

// ─── Heuristics ──────────────────────────────────────────────────────

/**
 * Cheap "was this buffer cut off mid-stream?" check. Closing `}` or `]`
 * are the only clean endings.
 */
export function isObviouslyTruncated(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  const last = trimmed[trimmed.length - 1]
  if (last === "}" || last === "]") return false
  return true
}
