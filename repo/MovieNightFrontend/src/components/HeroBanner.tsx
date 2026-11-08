import { useEffect, useRef, useState, useCallback } from "react"
import { Link } from "../router"
import { useStore } from "../store/MovieStore"
import useWatchlistSave from "../hooks/useWatchlistSave"
import { useHeroSlides } from "../hooks/useHeroSlides"
import type { Movie } from "../store/data"
import {
  HERO_AUTOPLAY_INTERVAL_MS,
  getNextSlideIndex,
  getPreviousSlideIndex,
  shouldAutoAdvance,
  evaluateTouchSwipe,
  resolveHeroTitleDisplay,
  type HeroSlide,
} from "./heroBannerLogic"

export default function HeroBanner() {
  const store = useStore()
  const { slides, loading } = useHeroSlides()
  const { toggleWatchlist } = useWatchlistSave()
  const currentUser = store.currentUser

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isManuallyPaused, setIsManuallyPaused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({})

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  // Keep index within bounds if slide count changes
  useEffect(() => {
    if (currentIndex >= slides.length && slides.length > 0) {
      setCurrentIndex(0)
    }
  }, [slides.length, currentIndex])

  const goToNextSlide = useCallback(() => {
    setCurrentIndex((prev) => getNextSlideIndex(prev, slides.length))
  }, [slides.length])

  const goToPrevSlide = useCallback(() => {
    setCurrentIndex((prev) => getPreviousSlideIndex(prev, slides.length))
  }, [slides.length])

  const goToSlide = useCallback(
    (index: number) => {
      if (index >= 0 && index < slides.length) {
        setCurrentIndex(index)
      }
    },
    [slides.length],
  )

  // 7-second auto-advance cycle with pause-on-hover, pause-on-focus, and manual pause
  // Reset timer on slide change (currentIndex) so manual jumps get full interval (PH04)
  useEffect(() => {
    if (
      !shouldAutoAdvance({
        totalSlides: slides.length,
        isManuallyPaused,
        isHovered,
        isFocused,
      })
    ) {
      return
    }

    const timer = setInterval(() => {
      goToNextSlide()
    }, HERO_AUTOPLAY_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [
    slides.length,
    currentIndex,
    isManuallyPaused,
    isHovered,
    isFocused,
    goToNextSlide,
  ])

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current

    // Only process horizontal swipes if horizontal movement dominates vertical scroll
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const direction = evaluateTouchSwipe(deltaX)
      if (direction === "next") {
        goToNextSlide()
      } else if (direction === "prev") {
        goToPrevSlide()
      }
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  const getLibraryStatus = useCallback(
    (movieId: string): "watchlist" | "watched" | null => {
      if (!currentUser) return null
      const entry = store.entryFor(currentUser.id, movieId)
      if (!entry) return null
      return entry.status === "watched"
        ? "watched"
        : entry.status === "watchlist"
          ? "watchlist"
          : null
    },
    [currentUser, store],
  )

  const handleWatchlistToggle = async (movie: Movie) => {
    if (!currentUser) return
    await toggleWatchlist(movie.id, movie)
  }

  // PH06: Dark skeleton placeholder during loading
  if (loading && slides.length === 0) {
    return (
      <section
        aria-label="Loading spotlight titles"
        className="relative w-full h-[65vh] min-h-[460px] max-h-[620px] sm:h-[75vh] sm:min-h-[500px] sm:max-h-[820px] bg-[#05070d] animate-pulse overflow-hidden flex items-end"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-[#05070d]/70 to-transparent" />
        <div className="relative z-10 mx-auto max-w-[1400px] w-full px-5 sm:px-8 lg:px-12 pb-10 sm:pb-14 space-y-3">
          <div className="h-6 w-32 rounded-md bg-white/10" />
          <div className="h-8 sm:h-10 w-3/4 max-w-md rounded-lg bg-white/10" />
          <div className="h-4 w-48 rounded bg-white/10" />
          <div className="flex gap-2.5 pt-1">
            <div className="h-9 sm:h-10 w-28 rounded-lg bg-white/10" />
            <div className="h-9 sm:h-10 w-9 sm:w-10 rounded-lg bg-white/10" />
          </div>
        </div>
      </section>
    )
  }

  // PH06: Graceful collapse if all feeds fail or return empty
  if (slides.length === 0) {
    return null
  }

  return (
    <section
      role="region"
      aria-roledescription="spotlight"
      aria-label="Curated spotlight hero banner"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) {
          setIsFocused(true)
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false)
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="relative w-full h-[65vh] min-h-[460px] max-h-[620px] sm:h-[75vh] sm:min-h-[500px] sm:max-h-[820px] overflow-hidden bg-[#05070d] select-none"
    >
      {/* Slides with smooth crossfade */}
      {slides.map((slide, index) => {
        const isActive = index === currentIndex
        const libStatus = getLibraryStatus(slide.movie.id)
        const isInWatchlist = libStatus === "watchlist"
        const isWatched = libStatus === "watched"
        const isSaving = store.isWatchlistSaving(slide.movie.id)

        return (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
            aria-hidden={!isActive}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              isActive
                ? "opacity-100 z-10 pointer-events-auto"
                : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            {/* High-resolution Backdrop Artwork with object-cover center crop */}
            <div className="absolute inset-0 overflow-hidden bg-[#05070d]">
              {slide.backdropUrl ? (
                <img
                  src={slide.backdropUrl}
                  alt={slide.title}
                  className="h-full w-full object-cover object-center"
                  loading={index === 0 ? "eager" : "lazy"}
                />
              ) : slide.posterUrl ? (
                <img
                  src={slide.posterUrl}
                  alt={slide.title}
                  className="h-full w-full object-cover object-center filter blur-sm scale-105"
                  loading="lazy"
                />
              ) : null}
            </div>

            {/* Localized scrims: seamless bottom ground blend and soft left text vignette for unobstructed artwork */}
            <div className="absolute bottom-0 inset-x-0 h-44 sm:h-56 bg-gradient-to-t from-[#05070d] via-[#05070d]/60 to-transparent pointer-events-none" />
            <div className="absolute inset-y-0 left-0 w-full sm:w-3/5 bg-gradient-to-r from-[#05070d]/80 via-[#05070d]/30 to-transparent pointer-events-none" />

            {/* Slide Content Overlay */}
            <div className="relative z-20 mx-auto max-w-[1400px] h-full flex flex-col justify-end px-5 sm:px-8 lg:px-12 pb-10 sm:pb-14">
              <div className="max-w-2xl text-left">
                {/* Contextual Rank Badge with design token bg-accent and 6px radius (HB03) */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider bg-accent text-white mb-2 sm:mb-2.5">
                  <span>{slide.badge}</span>
                </div>

                {/* Title logo branding with graceful text fallback (LG02, LG03) */}
                {(() => {
                  const titleDisplay = resolveHeroTitleDisplay(slide, failedLogos)
                  if (titleDisplay.mode === "logo" && titleDisplay.logoUrl) {
                    return (
                      <div className="mb-2 sm:mb-2.5 flex items-center">
                        <img
                          src={titleDisplay.logoUrl}
                          alt={titleDisplay.altText}
                          onError={() =>
                            setFailedLogos((prev) => ({
                              ...prev,
                              [slide.id]: true,
                            }))
                          }
                          className="max-h-24 sm:max-h-32 w-auto max-w-[280px] sm:max-w-md object-contain drop-shadow-md"
                        />
                        <h1 className="sr-only">{titleDisplay.title}</h1>
                      </div>
                    )
                  }
                  return (
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight leading-tight line-clamp-2 mb-2 sm:mb-2.5">
                      {titleDisplay.title}
                    </h1>
                  )
                })()}

                {/* Metadata Line: Star Audience Rating, Year, Media Badge, Top Genres */}
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-text-muted mb-3 sm:mb-4">
                  {slide.starRating && (
                    <>
                      <span className="nums flex items-center gap-1 font-semibold text-text-primary">
                        {slide.starRating}
                      </span>
                      <span className="text-white/40">·</span>
                    </>
                  )}

                  {slide.year && (
                    <>
                      <span className="nums font-medium text-text-primary">
                        {slide.year}
                      </span>
                      <span className="text-white/40">·</span>
                    </>
                  )}

                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-text-primary">
                    {slide.mediaType === "MOVIE"
                      ? "Movie"
                      : slide.mediaType === "TV"
                        ? "TV"
                        : "Anime"}
                  </span>

                  {slide.genres.length > 0 && (
                    <>
                      <span className="text-white/40">·</span>
                      <span className="text-text-muted font-medium">
                        {slide.genres.slice(0, 3).join(", ")}
                      </span>
                    </>
                  )}
                </div>

                {/* Primary Actions: More Info Link & Reversible Watchlist Toggle Button (HB03, HB04, PH07) */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  <Link
                    to={slide.detailUrl}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => {
                      store.upsertMovie(slide.movie)
                      try {
                        sessionStorage.setItem(
                          "last_selected_movie",
                          JSON.stringify(slide.movie),
                        )
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black font-semibold text-xs sm:text-sm transition-all hover:bg-white/90 active:scale-[0.98] min-h-[44px]"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>More info</span>
                  </Link>

                  <button
                    type="button"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => handleWatchlistToggle(slide.movie)}
                    disabled={isSaving || isWatched}
                    aria-busy={isSaving}
                    title={
                      isWatched
                        ? "In Watched History"
                        : isInWatchlist
                          ? "Remove from Watchlist"
                          : "Add to Watchlist"
                    }
                    aria-label={
                      isSaving
                        ? "Saving to Watchlist"
                        : isWatched
                          ? `${slide.title} is in your watched history`
                          : isInWatchlist
                            ? `Remove ${slide.title} from watchlist`
                            : `Add ${slide.title} to watchlist`
                    }
                    className={`flex items-center justify-center rounded-lg min-h-[44px] min-w-[44px] transition-all font-bold text-lg ${
                      isWatched
                        ? "bg-surface border border-white/20 text-text-muted cursor-default"
                        : isInWatchlist
                          ? "bg-accent text-white hover:bg-accent/80 border border-accent cursor-pointer active:scale-95"
                          : "bg-surface-raised/90 text-text-primary hover:bg-surface-raised hover:text-white border border-white/20 active:scale-95 cursor-pointer"
                    }`}
                  >
                    {isWatched || isInWatchlist ? "✓" : "+"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Hero Banner Controls: Indicator Dashes & Manual Pause/Play Toggle (PH04, PH07) */}
      <div className="absolute bottom-4 right-5 sm:bottom-8 sm:right-8 lg:right-12 z-30 flex items-center gap-1 sm:gap-2 bg-surface/85 backdrop-blur-md px-2 sm:px-3 py-1 rounded-lg border border-white/10">
        {/* Manual Pause / Play Toggle with >= 44x44px touch target and 6px radius */}
        <button
          type="button"
          onClick={(e) => {
            setIsManuallyPaused((prev) => !prev)
            setIsFocused(false)
            e.currentTarget.blur()
          }}
          aria-label={isManuallyPaused ? "Resume spotlight" : "Pause spotlight"}
          title={
            isManuallyPaused ? "Resume auto-advance" : "Pause auto-advance"
          }
          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
        >
          {isManuallyPaused ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          )}
        </button>

        {/* Clickable Progress Indicator Dashes with >= 44x44px touch target (PH04, PH07) */}
        <div className="flex items-center">
          {slides.map((s, idx) => {
            const isSlideActive = idx === currentIndex
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goToSlide(idx)}
                aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                aria-current={isSlideActive ? "true" : undefined}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] px-1 sm:px-1.5 group"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    isSlideActive
                      ? "w-6 sm:w-8 bg-accent"
                      : "w-2.5 sm:w-3 bg-white/35 group-hover:bg-white/70"
                  }`}
                />
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
