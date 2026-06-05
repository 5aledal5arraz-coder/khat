/**
 * Khat Brain — Transcript-quotes prompt builder.
 *
 * Extracted from `lib/ai/transcript.ts::generateQuotesFromTranscript` in
 * Phase 2.0 Batch 1. Byte-equivalent to the previous inline prompt; the
 * call site now uses this builder + VERSION constant so
 * `ai_runs.prompt_version` becomes meaningful for this feature.
 *
 * Do NOT edit the prompt body without bumping VERSION. The snapshot
 * test in `tests/prompts/snapshots.test.ts` enforces this contract.
 */

export const TRANSCRIPT_QUOTES_PROMPT_VERSION = "transcript-quotes-v1.0"

/** Token-safe truncation cap. Mirrors the value used in the legacy call site. */
const TRUNCATION_CHARS = 12_000

export interface TranscriptQuotesPromptInput {
  transcript: string
  episodeTitle: string
  guestName: string
  count: number
}

export interface BuiltTranscriptQuotesPrompt {
  system: string
  user: string
  version: string
  /** Structured ai_runs.input_snapshot payload — what the builder was asked to do. */
  input: Record<string, unknown>
}

export function buildTranscriptQuotesPrompt(
  input: TranscriptQuotesPromptInput,
): BuiltTranscriptQuotesPrompt {
  const truncated = input.transcript.slice(0, TRUNCATION_CHARS)

  const system = `أنت محرر اقتباسات لبودكاست خط — بودكاست عربي يتميز بالحدة الفكرية والصدق الإنساني.

مهمتك: استخرج ${input.count} اقتباسات تستحق المشاركة كصور اقتباس أو تغريدات.

## معايير الاقتباس:
- مكتمل المعنى بدون سياق — يُفهم وحده
- يُثير شعوراً: دهشة، إلهام، تأمل، أو تحدي لفكرة شائعة
- جملة أو جملتين (أقل من 150 حرف)
- ليس وصفياً ("تحدثنا عن...") وليس حكمة مبتذلة ("الحياة صعبة")
- حدد المتحدث: "guest" أو "host" أو null
- أضف تصنيفاً موضوعياً (كلمة أو كلمتين)

أجب بتنسيق JSON فقط:
{
  "quotes": [{"text": "...", "theme": "...", "speaker": "guest"}]
}`

  const user = `عنوان الحلقة: ${input.episodeTitle}
اسم الضيف: ${input.guestName}

نص الحلقة:
${truncated}`

  return {
    system,
    user,
    version: TRANSCRIPT_QUOTES_PROMPT_VERSION,
    input: {
      episodeTitle: input.episodeTitle,
      guestName: input.guestName,
      count: input.count,
      transcriptChars: truncated.length,
      transcriptTruncated: input.transcript.length > TRUNCATION_CHARS,
    },
  }
}
