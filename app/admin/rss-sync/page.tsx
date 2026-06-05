export const dynamic = "force-dynamic"

import { getRssSyncStatus } from "@/lib/queries/audio-platforms"
import { RssSyncClient } from "./rss-sync-client"

export default async function RssSyncPage() {
  const status = await getRssSyncStatus()
  return <RssSyncClient initialStatus={status} />
}
