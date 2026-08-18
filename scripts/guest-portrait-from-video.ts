/**
 * Pull a HALF-BODY portrait for each guest out of their own episode.
 *
 * WHY. Our guest photos are square head-and-shoulders crops. The designer's
 * card is built on a half-body shot — head, shoulders, chest — whose clothing
 * runs off the bottom edge of the frame. No amount of CSS makes a square crop
 * fill a tall panel: there is no chest in the file to fill it with, which is
 * what seven attempts at `contain`/`cover`/trimming/box-width all failed on.
 *
 *   npx tsx scripts/guest-portrait-from-video.ts             # every season-one guest
 *   npx tsx scripts/guest-portrait-from-video.ts <videoId>   # one episode
 *   npx tsx scripts/guest-portrait-from-video.ts <videoId> --report
 *        ↑ score every candidate frame and print the table WITHOUT writing
 *          anything. This is how the thresholds below were set, and how to
 *          re-set them if the studio setup changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE FIRST VERSION SHIPPED, AND WHY
 *
 * Khaled's verdict on the twenty portraits that went live: «سيئه جدا وغير
 * مقبوله». He was right, and the causes were all in this file:
 *
 *   1. A FIXED CROP WINDOW. `extract({ left: w*0.14, width: w*0.48 })` assumed
 *      the guest sits in the same part of the frame in every episode. When he
 *      does not — or simply gestures — the window cuts through an arm, and six
 *      of the twenty shipped with a hand or a forearm sliced off at the edge.
 *
 *   2. THE FRAME WAS CHOSEN BY `bodyReach` AND NOTHING ELSE — how far down the
 *      image the mask extended. That does not merely ignore quality, it selects
 *      AGAINST it: the frame where a seated man spans the most rows is the one
 *      where he is leaning forward with his arms out, mid-sentence. Hence
 *      twenty open mouths and twenty raised hands.
 *
 *   3. 720p, UPSCALED. `bv[height<=720]` into a 900px-wide canvas is a 1.5×
 *      enlargement of an already soft video frame.
 *
 *   4. NO SHARED COMPOSITION. Whatever the crop happened to contain was the
 *      output, so five portraits came out head-and-shoulders and fifteen came
 *      out full-body-seated. In one grid the faces ranged from a tenth of the
 *      tile to half of it, which is what made the page look broken before any
 *      single picture did.
 *
 * (The fifth cause was in the Swift tool, not here: it kept EVERY foreground
 * instance, so chairs came out as part of the guest. See subject-cutout.swift.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES INSTEAD
 *
 * Sample widely, reject hard, then compose — rather than crop first and hope.
 *
 * · The cut-out runs on the WHOLE frame. There is no assumption about where the
 *   guest sits; the face is found and the crop is derived from it afterwards.
 * · Every candidate is rejected outright — not scored down — if the subject is
 *   cut by the top or side edge, if the eyes are shut, if the head is turned
 *   past Vision's ±45° bucket, or if the face is too small to be the guest
 *   (that frame is on the host, or on a cutaway) or too large to have a torso.
 * · What survives is ranked: facing the camera first, then mouth closed, then
 *   hands steady — both relative to this guest's own frames — and finally
 *   sharpest face. See `rankCandidates`, `gestureSharpness` for why the hands
 *   need their own measurement, and GATE for why these are ranked, not gated.
 * · Candidates are composed down that ranking until one is not sliced by the
 *   canvas edge — a check that has to run on the OUTPUT, because the crop is
 *   what does the slicing.
 * · The composition is shared: every guest's face is the same height on the
 *   canvas and every head starts at the same line. That is what makes twenty
 *   different portraits read as one set.
 */
import "@/lib/jobs/load-env"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtempSync, rmSync, existsSync, readdirSync, copyFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { db } from "@/lib/db"
import { episodes, guests, episodeCategories } from "@/lib/db/schema"
import { eq, like } from "drizzle-orm"

const exec = promisify(execFile)
const CUTOUT_BIN = join(process.cwd(), ".cache", "subject-cutout")
const OUT = join(process.cwd(), "public", "guests", "cutout")
const BACKUP = join(process.cwd(), "public", "guests", "cutout-square-crops")

/**
 * FIVE windows, not one.
 *
 * A single 20:00 window gives ten candidates from sixty consecutive seconds —
 * one gesture, one lighting state, one posture. If the guest happens to be
 * leaning forward through all of it there is no better frame to find. Spreading
 * the same budget across the episode is what makes the hard rejects affordable:
 * most candidates are now thrown away, so there have to be many.
 */
const WINDOWS = [600, 1200, 1800, 2400, 3000] // 10:00 … 50:00
const WINDOW_LEN = 60
const EVERY = 3 // seconds between samples → 20 per window, 100 in total
/** YouTube fails a range for no reason and serves it on the next try. */
const DOWNLOAD_TRIES = 2

/**
 * PLAYER CLIENTS, IN ORDER — a chain, because every pin has broken.
 *
 * This file has now been stopped twice in one day by a client that worked
 * yesterday:
 *   · `player_client=web` was hard-coded here. Checked 2026-08-17: it returns
 *     storyboard images only, so every download died with "Requested format is
 *     not available".
 *   · Removing the pin let yt-dlp pick ANDROID_VR, which downloaded all
 *     nineteen guests fine — and then, an hour later, answered **403 Forbidden**
 *     on the media URL for the same video (`c=ANDROID_VR` in the failing URL),
 *     for every window, which surfaces as `ffmpeg exited with code 8`.
 *
 * `web_embedded` served the identical range seconds later. So the working
 * client is not a fact to record, it is a thing to DISCOVER each time. An empty
 * string means "no --extractor-args at all", i.e. yt-dlp's own default first.
 */
const PLAYER_CLIENTS = ["", "web_embedded", "tv", "ios", "mweb"]

/** The output canvas. Unchanged — the card is built around this box. */
const OUT_W = 900
const OUT_H = 1045

/**
 * THE SHARED COMPOSITION. These two numbers are the whole reason the set looks
 * like a set.
 *
 * `FACE_H` fixes the SCALE: every guest's face is drawn the same height on the
 * canvas, whatever its size in the source frame. `HEAD_TOP` fixes the POSITION:
 * the topmost pixel of the person — hair, ghutra, cap, whatever it is — lands
 * on the same line in every file.
 *
 * HEAD_TOP is 0.16 and not smaller because of what the CARD does with the file.
 * `<GuestCard>` draws it in a box of aspect 0.58×16/9 ≈ 1.03 with `object-cover
 * object-[50%_82%]`, which for a 900×1045 file means the top 141px — 13.5% —
 * is cropped away before anyone sees it. A head placed above that line loses
 * its crown on the card while looking perfectly fine in the file, which is
 * exactly the class of bug that gets shipped. 0.16 clears it by 26px.
 */
const FACE_H = 0.17 // face-box height ÷ canvas height
const HEAD_TOP = 0.16 // top of the subject ÷ canvas height

/**
 * THE ESCAPE VALVE, AND WHY A FIXED FACE SIZE ALONE DOES NOT WORK.
 *
 * Scaling purely by face height sounds right and failed on ELEVEN of nineteen
 * guests: every usable frame came out sliced by the canvas edge, so eleven
 * portraits silently kept their old file and the set ended up MORE mixed than
 * it started — the exact fault the shared composition exists to remove.
 *
 * The arithmetic: at FACE_H the face is ~178px tall, so a face is ~134px wide
 * and a seated man's shoulders about three of those. That fits in 900px. His
 * ARMS do not — a hand raised mid-sentence puts the subject over 900px wide,
 * and the card shows this file's full width (its box is wider than 900×1045 in
 * aspect, so `object-cover` crops the top and bottom, never the sides). A
 * subject wider than the canvas is therefore visibly amputated.
 *
 * So the face size is a TARGET, not a law: if the person does not fit, shrink
 * until he does — but never past `MAX_SHRINK`, because a face at half the size
 * of every other face is the inconsistency this is all for. A frame that still
 * does not fit at the floor is rejected and the next candidate is tried, which
 * is usually one with his hands down.
 */
const FIT_MARGIN = 0.98 // of the canvas width the subject may occupy
const MAX_SHRINK = 0.72 // never smaller than this fraction of the target face size

/**
 * THE HARD REJECTS — and note what is NOT in here.
 *
 * Calibrated with `--report` over 32 frames of حسام مطر's episode. Two of the
 * first-guess thresholds were wrong in ways only the distribution shows, and
 * both were wrong in the same direction: they treated a RELATIVE quantity as an
 * absolute one.
 *
 * · MOUTH OPENNESS IS NOT GATED AT ALL, it is ranked (see `rankCandidates`).
 *   `outerLips` height ÷ width never approaches zero, because a closed mouth
 *   still has lips: the observed range over one episode was 0.38 → 0.83, and
 *   the first-guess cut-off of 0.42 threw away 21 of 32 frames. Where the
 *   closed end of that range sits depends on the person's mouth, not on
 *   whether they are speaking, so no constant can separate the two. Comparing
 *   a guest's frames against each OTHER can, and does.
 *
 * · YAW AND ROLL ARE QUANTISED. Vision does not return a continuous angle here
 *   — every one of the 32 frames reported yaw as exactly 0.00 or ±0.79 rad
 *   (±45°) and roll as 0.00 or 0.52 (30°). A 0.55 yaw gate therefore did not
 *   mean "up to 31°", it meant "frontal only", which is a much stronger rule
 *   than it looks and rejects a guest who simply sits angled towards the host.
 *   The gates below sit ON the buckets, and frontality is a ranking preference.
 */
const GATE = {
  /** Face-box height ÷ frame height. Below this the camera is not on the guest. */
  minFaceH: 0.08,
  /**
   * Above this the shot is a close-up. Not a quality judgement — there is no
   * torso in the frame to build a half-body portrait out of, so the composition
   * would place a correctly-scaled head above an empty canvas.
   */
  maxFaceH: 0.24,
  /** Vertical opening ÷ width of the eye. A blink measures near zero. */
  minEyeOpen: 0.14,
  /** Head turn, radians. 0.79 is Vision's ±45° bucket; beyond it is an ear. */
  maxYaw: 0.8,
  /** Head tilt, radians. 0.52 is the 30° bucket. */
  maxRoll: 0.6,
}

/** Frames whose head is turned are usable but never preferred. */
const FRONTAL_YAW = 0.1
/** Of the frames that survive the gates, the quietest mouths to consider. */
const MOUTH_QUANTILE = 0.4
/** Of those, the steadiest hands to consider. Half — a tail, not a hair. */
const GESTURE_QUANTILE = 0.5

type Probe = {
  ok: true
  width: number
  height: number
  faces: number
  instances: number
  picked: number
  face: { x: number; y: number; w: number; h: number }
  mouthOpen: number
  eyeOpen: number
  yaw: number
  roll: number
  mask: { x: number; y: number; w: number; h: number }
  touch: { left: boolean; right: boolean; top: boolean; bottom: boolean }
}

async function buildCutoutBinary() {
  // Always rebuild: the .cache copy is not in git, and a stale binary from
  // before the "keep only the instance the face is in" fix silently reproduces
  // the chairs. Compiling costs a couple of seconds once per run.
  mkdirSync(join(process.cwd(), ".cache"), { recursive: true })
  await exec("swiftc", ["-O", "scripts/native/subject-cutout.swift", "-o", CUTOUT_BIN])
}

/**
 * Variance of the Laplacian over a REGION, not the frame.
 *
 * Measured frame-wide this ranks a still background above a sharp face, which
 * is backwards: a video frame of a person talking is soft exactly where it
 * matters and crisp everywhere it does not. Restricted to a box it is the
 * standard blur estimator and it does what it says.
 */
async function regionSharpness(
  frame: string,
  box: { x: number; y: number; w: number; h: number },
  bounds: { width: number; height: number },
): Promise<number> {
  // Clamp: the gesture band below is derived from a face box and a mask, and
  // either can run past the frame on a guest who leans out of shot.
  const left = Math.min(Math.max(0, Math.round(box.x)), bounds.width - 8)
  const top = Math.min(Math.max(0, Math.round(box.y)), bounds.height - 8)
  const width = Math.max(8, Math.min(Math.round(box.w), bounds.width - left))
  const height = Math.max(8, Math.min(Math.round(box.h), bounds.height - top))

  const region = await sharp(frame)
    .extract({ left, top, width, height })
    .greyscale()
    // Normalising first makes the number comparable between a brightly lit set
    // and a dim one; without it "sharp" and "high contrast" are the same score.
    .normalise()
    .resize(160, 160, { fit: "fill" })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .raw()
    .toBuffer()

  let sum = 0
  for (const v of region) sum += v
  const mean = sum / region.length
  let variance = 0
  for (const v of region) variance += (v - mean) ** 2
  return variance / region.length
}

/** The face box. This is what "is the portrait sharp?" used to mean, alone. */
function faceSharpness(frame: string, p: Probe): Promise<number> {
  return regionSharpness(frame, p.face, p)
}

/**
 * THE HANDS. The half of the picture the face score never looked at.
 *
 * Requiring the body to reach the canvas floor pushed the choice towards frames
 * where the guest is reaching forward — and reaching is MOVING. The set that
 * came back was consistent and visibly worse: half-transparent, smeared hands
 * on four of nineteen, while `faceSharpness` reported those frames as fine,
 * because a face can be perfectly still in the same 1/25s that a hand crosses
 * the frame. A measurement that cannot see the defect will not stop it.
 *
 * The band is everything below the chin, across the subject's own width — so it
 * is hands, forearms and the fabric they move. Its absolute value means nothing
 * across guests (a plain white thobe is smooth and scores low however sharp the
 * photograph is), which is why callers compare it only WITHIN one guest's
 * candidates. Same reasoning as the mouth: see GATE.
 */
function gestureSharpness(frame: string, p: Probe): Promise<number> {
  const chin = p.face.y + p.face.h
  return regionSharpness(
    frame,
    { x: p.mask.x, y: chin, w: p.mask.w, h: Math.max(8, p.mask.y + p.mask.h - chin) },
    p,
  )
}

function rejectionOf(p: Probe): string | null {
  // The order is the order of confidence: geometry first, because a sliced arm
  // or a cropped crown is a fact about the picture, while an openness ratio is
  // an estimate.
  if (p.touch.top) return "head cut by frame top"
  if (p.touch.left) return "subject cut by left edge"
  if (p.touch.right) return "subject cut by right edge"
  if (p.face.h / p.height < GATE.minFaceH) return "face too small — not the guest"
  if (p.face.h / p.height > GATE.maxFaceH) return "close-up — no torso in frame"
  if (p.eyeOpen >= 0 && p.eyeOpen < GATE.minEyeOpen) return "eyes shut"
  if (Math.abs(p.yaw) > GATE.maxYaw) return "head turned away"
  if (Math.abs(p.roll) > GATE.maxRoll) return "head tilted"
  return null
}

/**
 * Pick the portrait out of the frames that passed the gates.
 *
 * Three filters in order of confidence, each narrowing the field rather than
 * contributing to a score. A weighted blend is what the first version did in
 * effect, and a blend is exactly how a soft frame wins: it trades away the one
 * thing you can see for a combination of things you cannot.
 *
 *   1. FACING THE CAMERA, if any frame is. Not "prefer", but "if the guest is
 *      ever frontal, that is the portrait" — an angled head is acceptable only
 *      when the whole episode was shot that way.
 *   2. MOUTH CLOSED, relative to this guest's own frames. See GATE above for
 *      why the comparison has to be within the person.
 *   3. SHARPEST FACE among what is left.
 */
function rankCandidates<T extends { probe: Probe; sharpness: number; gesture: number }>(
  kept: T[],
): T[] {
  const frontal = kept.filter((c) => Math.abs(c.probe.yaw) <= FRONTAL_YAW)
  const pool = frontal.length > 0 ? frontal : kept

  const byMouth = [...pool].sort((a, b) => a.probe.mouthOpen - b.probe.mouthOpen)
  const cut = Math.max(1, Math.ceil(byMouth.length * MOUTH_QUANTILE))

  /**
   * Drop the blurred-hands tail, then sort what is left by face sharpness.
   *
   * Relative, not absolute — `gestureSharpness` explains why a constant cannot
   * work across a white thobe and a dark jacket. Applied as a narrowing filter
   * rather than folded into a score with the face, because a blend lets a frame
   * with smeared hands win on a crisp face, which is precisely the trade the
   * previous run made without anyone choosing it.
   */
  const steady = <U extends { gesture: number }>(group: U[]): U[] => {
    if (group.length < 4) return group
    const sorted = [...group].sort((a, b) => b.gesture - a.gesture)
    return sorted.slice(0, Math.max(2, Math.ceil(sorted.length * GESTURE_QUANTILE)))
  }

  const quiet = steady(byMouth.slice(0, cut)).sort((a, b) => b.sharpness - a.sharpness)
  const rest = steady(byMouth.slice(cut)).sort((a, b) => b.sharpness - a.sharpness)

  // A LIST, not a winner. The canvas-edge check can only run on a composed
  // file, so the caller composes down this order until one survives; returning
  // a single "best" would mean a guest loses his portrait to a crop that the
  // second-choice frame would have passed.
  return [...quiet, ...rest]
}

/**
 * Place the chosen cut-out on the shared geometry.
 *
 * Scale comes from the face height and position from the top of the subject, so
 * the two things a viewer compares across a grid — how big the face is and
 * where the head sits — are identical in every output file. Everything else
 * (how much torso is visible, how wide the shoulders are) follows from those.
 */
async function compose(cut: string, p: Probe, target: string) {
  // Target the shared face height, then give way to the canvas if the subject
  // is too wide for it — see FIT_MARGIN / MAX_SHRINK for what this costs and
  // why paying it beats eleven guests keeping their old portrait.
  const scaleFace = (FACE_H * OUT_H) / p.face.h
  const scaleFit = (OUT_W * FIT_MARGIN) / p.mask.w
  const scale = Math.max(scaleFace * MAX_SHRINK, Math.min(scaleFace, scaleFit))

  const scaledW = Math.round(p.width * scale)
  const scaledH = Math.round(p.height * scale)

  // Where the canvas sits on the scaled image. Horizontally this follows the
  // FACE, but only as far as the subject allows: centring purely on the face
  // pushes a body that sits at an angle off one side, and centring purely on
  // the mask lets one raised arm drag the head away from the middle. Clamping
  // the face-centred window to the subject's own extent keeps the head near the
  // centre AND both arms on the canvas whenever that is geometrically possible.
  const faceCxRaw = (p.face.x + p.face.w / 2) * scale
  const maskL = p.mask.x * scale
  const maskR = (p.mask.x + p.mask.w) * scale
  const halfW = OUT_W / 2
  const faceCx =
    maskR - maskL <= OUT_W
      ? Math.min(Math.max(faceCxRaw, maskR - halfW), maskL + halfW)
      : faceCxRaw
  const srcLeft = Math.round(faceCx - OUT_W / 2)
  const srcTop = Math.round(p.mask.y * scale - HEAD_TOP * OUT_H)

  // The canvas will usually hang off the source — that is the point, the sides
  // and the bottom are meant to be transparent rather than filled with whatever
  // the frame happened to contain. Pad first so the extract is always in range.
  //
  // TWO PASSES, NOT ONE CHAIN. `resize → extend → extract` in a single sharp
  // pipeline fails with "extract_area: bad extract area": the extract is
  // validated against the pre-extend geometry, so every window that relies on
  // the padding is out of bounds. Materialising the padded image first makes
  // the second call's bounds the ones actually on disk.
  const PAD = Math.max(OUT_W, OUT_H)
  const padded = await sharp(cut)
    .resize(scaledW, scaledH, { fit: "fill" })
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  await sharp(padded)
    .extract({ left: srcLeft + PAD, top: srcTop + PAD, width: OUT_W, height: OUT_H })
    .png()
    .toFile(target)
}

/**
 * Is the subject cut off by the edge of the COMPOSED canvas?
 *
 * `rejectionOf` asks this of the source frame, and that is not the same
 * question. The composition crops a 900×1045 window out of the scaled frame, so
 * a guest who is comfortably inside the 2560px video can still be sliced by the
 * window — which is exactly what happened to حسام on the first generated file:
 * every gate passed, `touch=-` on the source, and his arm was cut off at x=0 of
 * the output. A check that runs on the input to a transformation cannot see
 * what the transformation does.
 *
 * The bottom is not checked: clothing running off the bottom edge is the
 * design.
 */
/**
 * Does the clothing actually run off the bottom of the canvas?
 *
 * The designer's card is built on a half-body shot whose clothing IS the bottom
 * edge of the frame — that is the sentence at the top of this file, and the
 * first nineteen portraits only honoured it on five. The rest ended in mid-air
 * between 81% and 99% of the canvas, each at a different height.
 *
 * "Reaches" is a real span of the bottom row, not a stray pixel: a sleeve tip
 * touching the floor is not clothing filling the frame. 25% of the width is the
 * narrowest a seated torso plausibly gets at that line.
 */
async function reachesBottom(file: string): Promise<boolean> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const y = info.height - 1
  let opaque = 0
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * ch + (ch - 1)] > 128) opaque++
  }
  return opaque >= info.width * 0.25
}

async function cutByCanvasEdge(file: string): Promise<boolean> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const alphaAt = (x: number, y: number) => data[(y * info.width + x) * ch + (ch - 1)]

  // A few stray anti-aliased pixels on an edge are not a severed arm. Require a
  // run of solid alpha before calling it a cut — 2% of the edge's length.
  const need = Math.max(4, Math.round(info.height * 0.02))
  const needTop = Math.max(4, Math.round(info.width * 0.02))

  let left = 0, right = 0
  for (let y = 0; y < info.height; y++) {
    left = alphaAt(0, y) > 128 ? left + 1 : 0
    right = alphaAt(info.width - 1, y) > 128 ? right + 1 : 0
    if (left >= need || right >= need) return true
  }
  let top = 0
  for (let x = 0; x < info.width; x++) {
    top = alphaAt(x, 0) > 128 ? top + 1 : 0
    if (top >= needTop) return true
  }
  return false
}

/**
 * One `WINDOW_LEN`-second slice of an episode, video only.
 *
 * RETRIED, because the failure is not deterministic. `ffmpeg exited with code
 * 8` came back for 30:00 of حسام مطر's 2h14m episode while 10:00 and 20:00 of
 * the same file downloaded fine, twice, minutes apart. Treating that as "this
 * range does not exist" cost two thirds of the candidate frames on a run where
 * everything downstream depends on having many.
 */
async function downloadSection(videoId: string, start: number, out: string) {
  let last: unknown
  for (let attempt = 1; attempt <= DOWNLOAD_TRIES; attempt++) {
    for (const client of PLAYER_CLIENTS) {
      try {
        return await ytdlpSection(videoId, start, out, client)
      } catch (e) {
        last = e
        rmSync(out, { force: true })
        rmSync(`${out}.part`, { force: true })
      }
    }
  }
  throw last
}

async function ytdlpSection(videoId: string, start: number, out: string, client: string) {
  await exec("yt-dlp", [
    // NO `[ext=mp4]`. That filter pins itag 398, and YouTube answered 403
    // Forbidden for it on ten of nineteen episodes while the same videos
    // downloaded fine without it. Let yt-dlp pick the best stream.
    //
    // The client comes from the caller's chain — see PLAYER_CLIENTS for the two
    // separate outages that killed a hard-coded one on the same day.
    //
    // 1440, not 720. The episodes are published up to 2160p — the old ceiling
    // was throwing away four fifths of the detail. The composition below scales
    // by face height, and at 1440 that works out to roughly 1:1 for a seated
    // guest, so the portrait is a native-resolution crop rather than the 1.5×
    // enlargement of a soft 720p frame that shipped. 2160 is available and
    // deliberately not used: 4× the decode and Vision time for a downscale we
    // do not need.
    "--no-update", "--quiet", "--no-warnings", "--socket-timeout", "30",
    ...(client ? ["--extractor-args", `youtube:player_client=${client}`] : []),
    "-f", "bv[height<=1440]/bv*[height<=1440]/bv/b",
    "--downloader", "ffmpeg",
    "--downloader-args", "ffmpeg:-loglevel error",
    "--download-sections", `*${start}-${start + WINDOW_LEN}`,
    "-o", out, `https://www.youtube.com/watch?v=${videoId}`,
  ])
}

async function portraitFor(videoId: string, hash: string, report: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "khat-portrait-"))
  try {
    // ONE DOWNLOAD PER WINDOW, not one call with three `--download-sections`.
    // Passing all three to a single call with `--downloader ffmpeg` produced a
    // 60-second file: fifteen frames from one window instead of forty-five from
    // three, silently, with no error anywhere. The whole point of sampling
    // across the episode was gone and the only symptom was a low frame count.
    //
    // AND A WINDOW IS ALLOWED TO FAIL. YouTube served 10:00 and 20:00 of حسام
    // مطر's episode and answered `ffmpeg exited with code 8` for 30:00 of the
    // same file, twice, minutes apart — the episode is 2h14m, so the range
    // exists. One flaky range must not cost the whole guest his portrait; two
    // windows out of three is still thirty candidates.
    const clips: string[] = []
    const windowErrors: string[] = []
    for (const [i, start] of WINDOWS.entries()) {
      const clip = join(dir, `clip${i}.mp4`)
      try {
        await downloadSection(videoId, start, clip)
        clips.push(clip)
      } catch (e) {
        const detail = String((e as { stderr?: string }).stderr ?? "").trim().split("\n").pop()
        windowErrors.push(`${Math.round(start / 60)}min: ${detail || "download failed"}`)
      }
    }
    if (clips.length === 0) throw new Error(`no window downloaded — ${windowErrors.join("; ")}`)
    if (report && windowErrors.length) {
      for (const w of windowErrors) console.log(`    (window skipped) ${w}`)
    }
    for (const [i, clip] of clips.entries()) {
      await exec("ffmpeg", [
        "-loglevel", "error", "-i", clip,
        "-vf", `fps=1/${EVERY}`, join(dir, `f${i}%03d.png`),
      ])
    }
    const frames = readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort()
    if (frames.length === 0) throw new Error("no frames extracted")

    type Candidate = { cut: string; probe: Probe; sharpness: number; gesture: number }
    const kept: Candidate[] = []
    const rejected: Record<string, number> = {}

    for (const f of frames) {
      const src = join(dir, f)
      const cut = join(dir, `c-${f}`)
      let probe: Probe
      try {
        const { stdout } = await exec(CUTOUT_BIN, [src, cut])
        probe = JSON.parse(stdout.trim().split("\n").pop()!)
      } catch (e) {
        // NO_FACE / NO_SUBJECT / FACE_NOT_IN_ANY_INSTANCE all land here, and
        // all of them mean "not a frame of the guest". Count, don't throw.
        const code = String((e as { stderr?: string }).stderr ?? e).trim().split(/\s+/)[0]
        rejected[code || "cutout failed"] = (rejected[code || "cutout failed"] ?? 0) + 1
        continue
      }

      const why = rejectionOf(probe)

      // In report mode print the MEASUREMENTS for every frame, passed or not.
      // A gate that only prints its verdict cannot be calibrated: the first run
      // of these thresholds rejected 12 of 15 frames as "mouth open mid-word"
      // and the line gave no way to tell an over-strict cut-off from a genuinely
      // talkative minute. The numbers are the point of this mode.
      if (report) {
        console.log(
          `    ${f}  ${why ? "✗" : "✓"} ` +
            `face=${((probe.face.h / probe.height) * 100).toFixed(1)}% ` +
            `mouth=${probe.mouthOpen.toFixed(3)} eye=${probe.eyeOpen.toFixed(3)} ` +
            `yaw=${probe.yaw.toFixed(2)} roll=${probe.roll.toFixed(2)} ` +
            `inst=${probe.instances} ` +
            `touch=${(["left", "right", "top"] as const).filter((k) => probe.touch[k]).join("+") || "-"}` +
            (why ? `   ← ${why}` : ""),
        )
      }

      if (why) {
        rejected[why] = (rejected[why] ?? 0) + 1
        continue
      }

      const sharpness = await faceSharpness(src, probe)
      const gesture = await gestureSharpness(src, probe)
      kept.push({ cut, probe, sharpness, gesture })
      if (report) console.log(`         face-sharp=${sharpness.toFixed(0)} hands-sharp=${gesture.toFixed(0)}`)
    }

    if (report) {
      console.log(`    kept ${kept.length}/${frames.length}`)
      for (const [why, n] of Object.entries(rejected).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${n}× ${why}`)
      }
      return null
    }

    if (kept.length === 0) {
      const summary = Object.entries(rejected)
        .sort((a, b) => b[1] - a[1])
        .map(([why, n]) => `${n}× ${why}`)
        .join(", ")
      throw new Error(`no usable frame (${summary})`)
    }

    // Compose down the ranking until one survives the canvas-edge check. The
    // work happens in a scratch file so a rejected attempt never touches the
    // live portrait — a half-written public/ is worse than an old picture.
    // TWO ACCEPTANCE TESTS, IN PRIORITY ORDER, WITH AN EXPLICIT FALLBACK.
    //
    // The first set of nineteen was consistent at the top — every head within
    // 2px of the same line — and ragged at the BOTTOM: the clothing reached the
    // canvas floor on five and stopped between 81% and 99% on the other
    // fourteen. On the card that is a transparent band of a different height
    // under each guest, which is the same class of inconsistency the shared
    // composition exists to remove, just moved to the other edge.
    //
    // Why it happens: the scale is set by the face, so whether the body reaches
    // the floor depends on how much torso the source frame contains. Filling
    // needs the subject to be about (1-HEAD_TOP)/FACE_H ≈ 4.9 face-heights
    // tall, and a seated guest framed to the knees is right on that line —
    // hence some pass and some do not.
    //
    // So: walk the ranking and take the first frame that BOTH fits the sides
    // and reaches the floor. If no frame does, fall back to the best one that
    // merely fits the sides — a portrait with a short body is worse than a
    // consistent one but far better than no portrait — and say so in the
    // return value, so the run reports it instead of it being found by eye.
    const ranked = rankCandidates(kept)
    const scratch = join(dir, "composed.png")
    const keeper = join(dir, "keeper.png")
    let chosen: (typeof ranked)[number] | null = null
    let fallback: (typeof ranked)[number] | null = null
    let sliced = 0
    let shortBody = 0

    for (const c of ranked) {
      await compose(c.cut, c.probe, scratch)
      if (await cutByCanvasEdge(scratch)) {
        sliced++
        continue
      }
      if (!(await reachesBottom(scratch))) {
        shortBody++
        if (!fallback) {
          fallback = c
          copyFileSync(scratch, keeper)
        }
        continue
      }
      chosen = c
      copyFileSync(scratch, keeper)
      break
    }

    const winner = chosen ?? fallback
    if (!winner) throw new Error(`all ${ranked.length} usable frames were sliced by the canvas edge`)

    const target = join(OUT, `${hash}.png`)
    if (existsSync(target) && !existsSync(join(BACKUP, `${hash}.png`))) {
      mkdirSync(BACKUP, { recursive: true })
      copyFileSync(target, join(BACKUP, `${hash}.png`))
    }
    copyFileSync(keeper, target)
    return {
      kept: kept.length,
      seen: frames.length,
      sharpness: winner.sharpness,
      sliced,
      shortBody,
      filled: chosen !== null,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  await buildCutoutBinary()
  if (!db) throw new Error("no database")

  const report = process.argv.includes("--report")
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"))
  const rows = await db
    .select({ vid: episodes.id, guest: guests.name, photo: guests.photo_url })
    .from(episodes)
    .innerJoin(guests, eq(guests.id, episodes.guest_id))
    .innerJoin(episodeCategories, eq(episodeCategories.id, episodes.category_id))
    .where(like(episodeCategories.name, "%الموسم الاول%"))

  const todo = rows.filter((r) => r.photo && (!only || r.vid === only))
  console.log(`${todo.length} guests\n`)

  let ok = 0
  const failed: string[] = []
  for (const r of todo) {
    const hash = r.photo!.split("/").pop()!.replace(/\.[^.]+$/, "")
    console.log(`${r.guest} …`)
    try {
      const res = await portraitFor(r.vid, hash, report)
      if (res) {
        console.log(`  ${res.filled ? "✓" : "◑"} ${res.kept}/${res.seen} usable · ${res.sliced} sliced · ${res.shortBody} short-body · sharpness ${res.sharpness.toFixed(0)}${res.filled ? "" : "  ← BODY DOES NOT REACH THE FLOOR"}`)
        ok++
      }
    } catch (e) {
      // `execFile`'s Error.message is the COMMAND LINE, truncated — for a
      // yt-dlp failure it says "Command failed: yt-dlp --no-update --quiet …"
      // and stops before the reason. The reason is on stderr, and without it a
      // failed guest is unactionable.
      const err = e as { message?: string; stderr?: string }
      const detail = (err.stderr ?? "").trim().split("\n").filter(Boolean).pop()
      const msg = detail || (e instanceof Error ? e.message : String(e))
      console.log(`  ✗ ${msg.slice(0, 200)}`)
      failed.push(`${r.guest}: ${msg.slice(0, 200)}`)
    }
  }

  if (!report) {
    console.log(`\n${ok}/${todo.length} portraits written`)
    if (failed.length) {
      // Named, not counted. A guest whose portrait could not be rebuilt still
      // has the OLD one on disk, which means the set is now mixed — and that is
      // precisely the state that has to be visible rather than inferred.
      console.log(`\nSTILL ON THE OLD PORTRAIT — these kept their previous file:`)
      for (const f of failed) console.log(`  · ${f}`)
    }
    console.log(`\nprevious files kept in public/guests/cutout-square-crops/`)
    console.log(`DO NOT run scripts/trim-guest-cutouts.ts on these — the transparent`)
    console.log(`margins here are the composition, not padding left over from Vision.`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
