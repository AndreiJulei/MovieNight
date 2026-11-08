import { Link } from "../router"
import { EMPTY_STATE_MESSAGES } from "./homeShelfLogic"

export interface ShelfEmptyCardProps {
  type?: "personal" | "friends" | "generic"
  customMessage?: string
  customCta?: { label: string; to: string }
  className?: string
}

export default function ShelfEmptyCard({
  type = "generic",
  customMessage,
  customCta,
  className = "",
}: ShelfEmptyCardProps) {
  const config =
    type === "personal"
      ? EMPTY_STATE_MESSAGES.personal
      : type === "friends"
        ? EMPTY_STATE_MESSAGES.friends
        : {
            message: "No titles found in this shelf.",
            ctaLabel: "Explore Movies",
            ctaTo: "/explore/movies",
          }

  const message = customMessage || config.message
  const ctaLabel = customCta?.label || config.ctaLabel
  const ctaTo = customCta?.to || config.ctaTo

  return (
    <div
      data-testid={`empty-state-${type}`}
      className={`mx-auto my-3 flex w-full max-w-2xl flex-col items-center justify-center rounded-lg border border-white/[0.08] bg-surface px-6 py-10 sm:py-14 text-center ${className}`}
    >
      <p className="max-w-md text-base sm:text-lg font-bold text-text-primary leading-snug">
        {message}
      </p>
      <Link
        to={ctaTo}
        className="mt-5 inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-accent"
      >
        {ctaLabel}
      </Link>
    </div>
  )
}
