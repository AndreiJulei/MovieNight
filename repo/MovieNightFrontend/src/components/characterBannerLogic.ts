export const CHARACTER_LOGOS = [
  "/mainPageLogo/bvs_vertical_transparent.png",
  "/mainPageLogo/fightclub_transparent_pink.png",
  "/mainPageLogo/fightclub_transparent_violet.png",
  "/mainPageLogo/killbill_transparent_violet.png",
  "/mainPageLogo/killbill_transparent_yellow.png",
  "/mainPageLogo/spidey_vertical_transparent.png",
  "/mainPageLogo/spidey_vertical_transparent_violet.png",
  "/mainPageLogo/vader_crossed_transparent.png",
  "/mainPageLogo/vader_marvel_transparent.png",
] as const

export type CharacterLogoSrc = typeof CHARACTER_LOGOS[number]

/**
 * Randomly picks a character logo asset path from the configured transparent variants.
 * Supports injected pseudo-random generator for testing or deterministic selection.
 */
export function selectRandomCharacterLogo(
  logos: readonly CharacterLogoSrc[] | null | undefined = CHARACTER_LOGOS,
  random: () => number = Math.random,
): CharacterLogoSrc | null {
  if (!logos || logos.length === 0) {
    return null
  }

  const normalized = Math.max(0, Math.min(0.999999999999, random()))
  const index = Math.floor(normalized * logos.length)
  return logos[index] ?? null
}
