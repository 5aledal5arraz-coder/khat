// GENERATED FILE — do not edit by hand.
// Source of truth: public/guests/cutout/*.png, produced from public/guests/*.jpg
// by scripts/cut-out-guest-photos.ts (macOS Vision, entirely on-device).
// Regenerate after adding guest photos: npx tsx scripts/cut-out-guest-photos.ts

/**
 * Guests whose portrait has a background-free version on disk.
 *
 * A guest uploaded after this last ran is simply absent, and the card falls
 * back to the plain photograph — which is why this is a list of what exists
 * rather than a path the card guesses at.
 */
const CUTOUTS = new Set([
  "0df7ce140417712c",
  "1963486a3842625a",
  "1c55e5c19de8a851",
  "21eae81226419f42",
  "27eb62fce68e77de",
  "28c6a9fa516c6f48",
  "2e5be7cd23ebeed3",
  "3161c9bdf0d128e6",
  "33ab7d54f541c856",
  "3eea7b699f6d4734",
  "45267653de7cf8a9",
  "485f3fedfe342b53",
  "49b7c018fb9615eb",
  "4f81a88e3c2589a8",
  "595ccf74037b74ef",
  "5d03f95aedf5767b",
  "5f1a1cf6270b79b2",
  "604aa00c7ead3c0a",
  "66c47d8ee9db957a",
  "7ececd41000a11d1",
  "7ef99a8a65fe2320",
  "829429f647e1d137",
  "85e5f2a23c3e95d9",
  "8ba6beae48752302",
  "b7707c4d7792db5f",
  "ba19a08dd0c66eeb",
  "c99f0b7bbc9d861b",
  "d8756da52be15b30",
  "eacc2d6811b93d8e",
  "ef7a95d039d3c272",
  "f243d0d8b2b36b3b"
])

/** The cut-out for a `photo_url`, or null when there isn't one. */
export function guestCutoutUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null
  const base = photoUrl.split("/").pop()?.replace(/\.[^.]+$/, "")
  return base && CUTOUTS.has(base) ? `/guests/cutout/${base}.png` : null
}
