/**
 * «نسخة الضيف» — server wrapper for the guest-link card on the prep tab.
 * Loads its own read model so PreparationTab's props stay unchanged.
 */

import { getGuestLinkAdminState } from "@/lib/guest-link/admin"
import { GuestLinkPanel } from "./guest-link-panel"

export async function GuestLinkSection({ eirId }: { eirId: string }) {
  const state = await getGuestLinkAdminState(eirId)
  if (!state) return null
  return <GuestLinkPanel state={state} />
}
