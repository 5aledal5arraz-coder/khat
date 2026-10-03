/**
 * Same-episode alias collapse (2026-10-03, prod: «دينا» + «الكوتش دينا عبد
 * المقصود» became two people in one episode). Pure, deterministic.
 *
 * Within ONE episode's validated guests, a SHORT name S is folded into a FULL
 * name F (S becomes an alias of F's person; only F gets an appearance) when ALL hold:
 *   • S's comparison-key words are a strict, in-order subset of F's;
 *   • no OTHER guest of the episode also contains S's words (no competing person);
 *   • the roles are compatible (S has no distinguishing role, or the same as F);
 *   • no conflicting gender or nationality signal.
 * Never across episodes — two episodes' «دينا» are never assumed the same.
 */
import { distinguishingRole } from "../identity"
import { normalizeNameKey } from "../normalize"
import type { ValidGuest } from "./validate"

export interface SameEpisodeAlias {
  alias: string
  /** The full display_name it was folded into. */
  of: string
  rule: "same_episode_alias"
}

function inOrderSubset(short: string[], full: string[]): boolean {
  if (short.length === 0 || short.length >= full.length) return false
  let i = 0
  for (const t of full) if (t === short[i]) i++
  return i === short.length
}

function compatible(s: ValidGuest, f: ValidGuest): boolean {
  const rs = distinguishingRole(s.role_text)
  const rf = distinguishingRole(f.role_text)
  if (rs && rs !== rf) return false
  if (s.gender_signal !== "unknown" && f.gender_signal !== "unknown" && s.gender_signal !== f.gender_signal) return false
  if (s.nationality_claim_code && f.nationality_claim_code && s.nationality_claim_code !== f.nationality_claim_code) return false
  return true
}

export function collapseSameEpisodeAliases(guests: ValidGuest[]): { guests: ValidGuest[]; aliases: SameEpisodeAlias[] } {
  const keys = guests.map((g) => normalizeNameKey(g.display_name).split(" ").filter(Boolean))
  const foldInto = new Map<number, number>()
  for (let s = 0; s < guests.length; s++) {
    const containers = guests.map((_, f) => f).filter((f) => f !== s && inOrderSubset(keys[s], keys[f]))
    if (containers.length !== 1) continue // none, or a competing person → keep both
    const f = containers[0]
    if (foldInto.has(f)) continue // F is itself being folded — no chains
    if (!compatible(guests[s], guests[f])) continue
    foldInto.set(s, f)
  }
  const aliases: SameEpisodeAlias[] = []
  const out: ValidGuest[] = []
  for (let i = 0; i < guests.length; i++) {
    if (foldInto.has(i)) {
      aliases.push({ alias: guests[i].display_name, of: guests[foldInto.get(i)!].display_name, rule: "same_episode_alias" })
      continue
    }
    const folded = [...foldInto.entries()].filter(([, f]) => f === i).map(([s]) => guests[s])
    let g = guests[i]
    for (const s of folded) {
      g = {
        ...g,
        is_primary_guest: g.is_primary_guest || s.is_primary_guest,
        // Keep the full name's claims; take the short one's only where the full had none.
        nationality_claim_code: g.nationality_claim_code ?? s.nationality_claim_code,
        nationality_claim_text: g.nationality_claim_code ? g.nationality_claim_text : s.nationality_claim_text,
        gender_signal: g.gender_signal !== "unknown" ? g.gender_signal : s.gender_signal,
        gender_evidence_text: g.gender_signal !== "unknown" ? g.gender_evidence_text : s.gender_evidence_text,
        confidence: Math.max(g.confidence, s.confidence),
      }
    }
    out.push(g)
  }
  return { guests: out, aliases }
}
