/**
 * Who hosts an episode (Addendum 2 c, scoped per program — noura 2026-10-03).
 * Pure. A channel's `host_names` apply to every episode; a `program_hosts`
 * entry applies only to episodes whose TITLE contains the program name, so a
 * program's host who guests on another program of the same channel keeps that
 * guest appearance.
 */
import { matchForm, normalizeNameKey } from "./normalize"

export interface ProgramHosts {
  program: string
  hosts: string[]
}

export function hostsForEpisode(channelHosts: string[] | null | undefined, programHosts: ProgramHosts[] | null | undefined, title: string): string[] {
  const t = matchForm(title)
  const out = new Set<string>(channelHosts ?? [])
  for (const p of programHosts ?? []) {
    const prog = matchForm(p.program)
    if (prog && t.includes(prog)) for (const h of p.hosts) out.add(h)
  }
  return [...out]
}

/** The program a title names: the last «|»-separated segment when present (e.g. «… | بودكاست آدم»). */
export function programOf(title: string): string | null {
  const parts = title.split("|").map((p) => matchForm(p)).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 1] : null
}

export function isHostOf(name: string, hosts: string[]): boolean {
  const k = normalizeNameKey(name)
  return !!k && hosts.some((h) => normalizeNameKey(h) === k)
}
