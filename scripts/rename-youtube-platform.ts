/**
 * «يوتيوب» → «YouTube». Khaled, 2026-08-05.
 *
 * Every other platform on the site already renders its Latin name — Spotify,
 * Apple Podcasts, Amazon Music — because that is the name each brand uses.
 * YouTube was the one transliterated into Arabic, so a row of four buttons
 * read «يوتيوب · Apple Podcasts · Spotify · Amazon Music»: one convention
 * broken once.
 *
 * It is a DATABASE value, not a string in the page, so it changes on both
 * sides or the two drift.
 */
import { Pool } from "pg"; import { readFileSync } from "fs"; import path from "path"
const argv=process.argv.slice(2), APPLY=argv.includes("--apply"), LIVE=argv.includes("--live")
const key = LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"
const url=(process.env[key] ?? (readFileSync(".env.local","utf8").match(new RegExp(`^${key}=(.*)$`,"m"))?.[1] ?? "")).trim().replace(/^["']|["']$/g,"")
if(!url) throw new Error(`${key} is not set`)
async function main(){
  const p=new Pool({connectionString:url.replace(/[?&]sslmode=[^&]*/,""),...(LIVE?{ssl:{rejectUnauthorized:false}}:{}),max:1})
  console.log(`\n▸ target: ${LIVE?"PRODUCTION":"local"}   mode: ${APPLY?"APPLY":"dry run"}\n`)
  const rows=(await p.query(`select platform_key, platform_name from podcast_platform_links where platform_key='youtube'`)).rows
  if(!rows.length){ console.log("  no youtube row — nothing to do\n"); await p.end(); return }
  for (const r of rows) console.log(`  ${r.platform_key}: ${JSON.stringify(r.platform_name)} → "YouTube"`)
  if(!APPLY){ console.log("\nDry run — nothing written. Re-run with --apply.\n"); await p.end(); return }
  await p.query(`update podcast_platform_links set platform_name='YouTube', updated_at=now() where platform_key='youtube'`)
  console.log("\n▸ renamed.\n"); await p.end()
}
main().catch(e=>{console.error(e);process.exit(1)})
