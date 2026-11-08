import { useMemo } from "react"
import {
  CharacterLogoSrc,
  selectRandomCharacterLogo,
} from "./characterBannerLogic"

export default function CharacterLogoBanner() {
  const logoSrc = useMemo(() => selectRandomCharacterLogo(), [])

  if (!logoSrc) {
    return null
  }

  return (
    <div
      id="character-logo-banner"
      data-testid="character-logo-banner"
      aria-hidden="true"
      className="pointer-events-none relative mx-auto flex w-full max-w-[1400px] select-none items-center justify-center overflow-hidden px-4 py-8 sm:py-12"
    >
      <img
        src={logoSrc}
        alt=""
        role="presentation"
        className="max-h-[340px] sm:max-h-[440px] lg:max-h-[480px] w-auto max-w-full object-contain opacity-90"
      />
    </div>
  )
}
