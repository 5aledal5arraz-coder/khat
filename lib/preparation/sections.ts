/**
 * Reading `sections_status`, in one place.
 *
 * `sections_status` is keyed by `PreparationSectionKey`, which includes
 * `research` — so it holds TEN entries while a preparation has NINE generated
 * sections. Every consumer that reports progress has to know that, and on
 * 2026-08-13 one of them did not: the studio badge counted every `ready` in the
 * object and printed the total over nine. A row with research ready, eight
 * sections ready and `question_system` in `error` scored «٩/٩ قسم جاهز» while
 * «الأسئلة» was empty in the database — the extra success cancelled the
 * failure exactly.
 *
 * No database import here on purpose: this is imported by a client component.
 */

import {
  EDITORIAL_SECTION_KEYS,
  type EditorialSectionKey,
  type PreparationSectionsStatus,
} from "@/types/preparation"

/** How many of the NINE generated sections are ready. Never counts research. */
export function countReadySections(status: PreparationSectionsStatus): number {
  return EDITORIAL_SECTION_KEYS.filter((k) => status[k]?.status === "ready").length
}

/**
 * The sections that failed, in the identity file's own order.
 *
 * Returned as keys rather than a count so the screen can name them: nine
 * section cards each carry their own «خطأ» chip, and a bare number leaves the
 * host to hunt for which one.
 */
export function failedSectionKeys(
  status: PreparationSectionsStatus,
): EditorialSectionKey[] {
  return EDITORIAL_SECTION_KEYS.filter((k) => status[k]?.status === "error")
}

/** True when every one of the nine is ready — the only honest "complete". */
export function allSectionsReady(status: PreparationSectionsStatus): boolean {
  return countReadySections(status) === EDITORIAL_SECTION_KEYS.length
}
