import type { Movie, MediaType } from "../store/data"

export interface HeroSlide {
  id: string
  badge: string
  categoryPillar: "movies" | "tv" | "anime" | "for-you" | "anticipated"
  movie: Movie
  backdropUrl: string | null
  posterUrl: string | null
  logoUrl: string | null
  title: string
  year: number | null
  mediaType: MediaType
  starRating: string | null
  genres: string[]
  detailUrl: string
}

export interface EnrichedMetadata {
  backdropUrl?: string | null
  logoUrl?: string | null
  genres?: string[] | null
  imdbRating?: number | null
  tmdbVoteAverage?: number | null
  releaseYear?: number | null
}

export interface HeroFeedCandidates {
  movie?: Movie | null
  tvSeries?: Movie | null
  currentAnime?: Movie | null
  personalRecommendation?: Movie | null
  upcomingMovie?: Movie | null
}

export const MOVIE_RATING_FLOOR = 6.5
export const TV_HERO_CATEGORY_ID = "top-rated"
export const TV_MINIMUM_VOTES = 150

export interface CandidateItem {
  id?: string
  title?: string
  name?: string
  voteAverage?: number | null
  tmdbRating?: number | null
  voteCount?: number | null
  tmdbVoteCount?: number | null
  genres?: string[] | string | null
  genreIds?: number[] | null
  [key: string]: any
}

/**
 * Filters out Family / Kids titles to ensure meaningful, mature hero recommendations.
 * Checks TMDB genre IDs (10751 = Family, 10762 = Kids), genre string lists, and kid franchise titles.
 * Supports passing either a candidate object or individual fields.
 */
export function isFamilyOrKidsTitle(
  candidateOrTitle?: CandidateItem | string | null,
  genres?: string[] | string | null,
  genreIds?: number[] | null,
): boolean {
  if (candidateOrTitle && typeof candidateOrTitle === "object") {
    const item = candidateOrTitle
    return isFamilyOrKidsTitle(
      item.title || item.name,
      item.genres,
      item.genreIds,
    )
  }
  const title = candidateOrTitle as string | null | undefined
  if (genreIds && (genreIds.includes(10751) || genreIds.includes(10762))) {
    return true
  }
  if (genres) {
    const gList = Array.isArray(genres) ? genres : genres.split(",")
    if (gList.some((g) => /family|kids|children|toddler/i.test(g.trim()))) {
      return true
    }
  }
  if (
    title &&
    /doraemon|anpanman|shin-chan|crayons? shinchan|wildwood/i.test(title)
  ) {
    return true
  }
  return false
}

function parseScore(val: unknown): number | null {
  if (typeof val === "number") {
    return Number.isFinite(val) && val >= 0 && val <= 10 ? val : null
  }
  if (typeof val === "string") {
    const parsed = parseFloat(val)
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10
      ? parsed
      : null
  }
  return null
}

/**
 * Selects the #1 in Movies candidate (HB01):
 * 1. Evaluates Newest Releases (`newest` feed) in order, selecting the first
 *    movie meeting the rating floor `voteAverage >= 6.5` that is not a Kids/Family title.
 * 2. If no newest release meets the floor (or newest is empty), falls back
 *    to the top-ranked title in Top Rated (`top-rated` feed) that is not Kids/Family.
 * 3. Returns null if both candidate pools are empty or unavailable.
 */
export function selectMovieCandidate<T extends CandidateItem>(
  newestList?: T[] | null,
  topRatedList?: T[] | null,
  ratingFloor: number = MOVIE_RATING_FLOOR,
): T | null {
  if (newestList && newestList.length > 0) {
    const candidate = newestList.find((m) => {
      if (isFamilyOrKidsTitle(m)) {
        return false
      }
      const score = m.voteAverage ?? m.tmdbRating ?? 0
      return score >= ratingFloor
    })
    if (candidate) return candidate
  }
  if (topRatedList && topRatedList.length > 0) {
    const candidate = topRatedList.find((m) => !isFamilyOrKidsTitle(m))
    return candidate ?? null
  }
  return null
}

export interface TvCategoryItem<T> {
  id: string
  movies?: T[] | null
}

/**
 * Selects the #1 in TV Series candidate (HB02):
 * 1. Sourced strictly from the Bayesian confidence-ranked Top Rated TV category (`top-rated`).
 *    Rejects raw airing or any non-top-rated feed to guard against silent fallback.
 * 2. Enforces Bayesian confidence floor: candidate must satisfy minimumVotes = 150
 *    if vote count metadata is present. If vote count is omitted, candidate is preserved.
 * 3. Excludes Kids and Family titles.
 * 4. Returns null if the feed is empty, unavailable, or no candidate meets the criteria.
 */
export function selectTvCandidate<T extends CandidateItem = CandidateItem>(
  categoriesOrList?: TvCategoryItem<T>[] | T[] | null,
  categoryIdOrMinVotes?: string | number,
  explicitMinVotes?: number,
): T | null {
  if (!categoriesOrList || categoriesOrList.length === 0) return null

  let categoryId: string | undefined
  let minVotes = TV_MINIMUM_VOTES

  if (typeof categoryIdOrMinVotes === "number") {
    minVotes = categoryIdOrMinVotes
  } else if (typeof categoryIdOrMinVotes === "string") {
    categoryId = categoryIdOrMinVotes
    if (typeof explicitMinVotes === "number") {
      minVotes = explicitMinVotes
    }
  }

  const matchesVoteFloor = (item: T) => {
    if (isFamilyOrKidsTitle(item)) {
      return false
    }
    const count = item.voteCount ?? item.tmdbVoteCount
    // If voteCount is present, candidate must meet the confidence floor
    if (count != null) {
      return count >= minVotes
    }
    // If vote count metadata is omitted by the feed, accept from top-rated
    return true
  }

  // If passed an array of explore categories, strictly select from top-rated
  const first = categoriesOrList[0] as any
  if (
    first &&
    typeof first === "object" &&
    "id" in first &&
    "movies" in first
  ) {
    const cats = categoriesOrList as TvCategoryItem<T>[]
    const topRatedCat = cats.find((c) => c.id === TV_HERO_CATEGORY_ID)
    if (!topRatedCat?.movies || topRatedCat.movies.length === 0) {
      return null
    }
    return topRatedCat.movies.find(matchesVoteFloor) ?? null
  }

  // If passed a movie list with an explicit categoryId, guard against non-top-rated
  if (categoryId !== undefined && categoryId !== TV_HERO_CATEGORY_ID) {
    return null
  }

  return (categoriesOrList as T[]).find(matchesVoteFloor) ?? null
}

export function parseGenres(genres?: string | string[] | null): string[] {
  if (!genres) return []
  if (Array.isArray(genres)) return genres.filter(Boolean)
  return genres
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Formats a clean star audience rating for hero presentation:
 * Prefers valid IMDb (0–10) -> "★ 8.4"
 * Falls back to valid TMDB (0–10) -> "★ 7.5"
 * Valid zero is preserved as "★ 0.0"
 * Invalid or missing scores return null cleanly.
 */
export function formatHeroStarRating(movie: {
  imdb?: number | null
  tmdbRating?: number | null
  voteAverage?: number | null
}): string | null {
  const imdbScore = parseScore(movie.imdb)
  if (imdbScore != null) {
    return `★ ${imdbScore.toFixed(1)}`
  }
  const tmdbScore = parseScore(movie.tmdbRating ?? movie.voteAverage)
  if (tmdbScore != null) {
    return `★ ${tmdbScore.toFixed(1)}`
  }
  return null
}

/**
 * Creates one normalized hero spotlight slide from a title and optional enriched details.
 */
export function createHeroSlide(params: {
  badge: string
  categoryPillar: "movies" | "tv" | "anime" | "for-you" | "anticipated"
  movie: Movie
  enriched?: EnrichedMetadata | null
}): HeroSlide {
  const { badge, categoryPillar, movie, enriched } = params

  const backdrop =
    enriched?.backdropUrl ||
    (movie as { backdropUrl?: string | null }).backdropUrl ||
    null
  const logo =
    enriched?.logoUrl !== undefined
      ? enriched.logoUrl
      : (movie as { logoUrl?: string | null }).logoUrl || null
  const poster = movie.posterUrl || null
  const year = enriched?.releaseYear ?? movie.year ?? null
  const genres =
    enriched?.genres && enriched.genres.length > 0
      ? enriched.genres
      : movie.genres || []
  const starRating = formatHeroStarRating({
    imdb: enriched?.imdbRating ?? movie.imdb,
    tmdbRating: enriched?.tmdbVoteAverage ?? movie.tmdbRating,
  })

  const detailUrl = `/movies/${movie.id}${
    movie.mediaType ? `?type=${encodeURIComponent(movie.mediaType)}` : ""
  }`

  return {
    id: `hero-${categoryPillar}-${movie.id}`,
    badge,
    categoryPillar,
    movie,
    backdropUrl: backdrop,
    posterUrl: poster,
    logoUrl: logo,
    title: movie.title,
    year,
    mediaType: movie.mediaType,
    starRating,
    genres,
    detailUrl,
  }
}

/**
 * Builds the curated 4-slide lineup in exact catalog pillar order:
 * 1. #1 in Movies (Newest releases meeting >= 6.5 floor / fallback to Top Rated)
 * 2. #1 in TV Series (Bayesian confidence-ranked Top Rated TV)
 * 3. #1 in Anime (Current Season Anime hits)
 * 4. #1 For You (Personalized Recommendation / fallback to #1 Anticipated)
 *
 * Omits any category with no eligible titles without breaking remaining slides.
 */
export function buildHeroSlides(
  candidates: HeroFeedCandidates,
  enrichments?: Record<string, EnrichedMetadata | null>,
): HeroSlide[] {
  const pillarConfigs: Array<{
    key: keyof HeroFeedCandidates
    badge: string
    categoryPillar: "movies" | "tv" | "anime" | "for-you" | "anticipated"
  }> = [
    { key: "movie", badge: "#1 in Movies", categoryPillar: "movies" },
    { key: "tvSeries", badge: "#1 in TV Series", categoryPillar: "tv" },
    { key: "currentAnime", badge: "#1 in Anime", categoryPillar: "anime" },
    ...(candidates.personalRecommendation
      ? [
          {
            key: "personalRecommendation" as const,
            badge: "#1 For You",
            categoryPillar: "for-you" as const,
          },
        ]
      : candidates.upcomingMovie
        ? [
            {
              key: "upcomingMovie" as const,
              badge: "#1 Anticipated",
              categoryPillar: "anticipated" as const,
            },
          ]
        : []),
  ]

  return pillarConfigs.flatMap(({ key, badge, categoryPillar }) => {
    const movie = candidates[key]
    if (!movie) return []
    return [
      createHeroSlide({
        badge,
        categoryPillar,
        movie,
        enriched: enrichments?.[movie.id],
      }),
    ]
  })
}

export const HERO_AUTOPLAY_INTERVAL_MS = 7000
export const SWIPE_THRESHOLD_PX = 50

export function getNextSlideIndex(
  currentIndex: number,
  totalSlides: number,
): number {
  if (totalSlides <= 0) return 0
  return (currentIndex + 1) % totalSlides
}

export function getPreviousSlideIndex(
  currentIndex: number,
  totalSlides: number,
): number {
  if (totalSlides <= 0) return 0
  return (currentIndex - 1 + totalSlides) % totalSlides
}

export function shouldAutoAdvance(params: {
  totalSlides: number
  isManuallyPaused: boolean
  isHovered: boolean
  isFocused: boolean
}): boolean {
  return (
    params.totalSlides > 1 &&
    !params.isManuallyPaused &&
    !params.isHovered &&
    !params.isFocused
  )
}

export function evaluateTouchSwipe(deltaX: number): "next" | "prev" | "none" {
  if (deltaX < -SWIPE_THRESHOLD_PX) return "next"
  if (deltaX > SWIPE_THRESHOLD_PX) return "prev"
  return "none"
}

export interface HeroTitleDisplay {
  mode: "logo" | "text"
  logoUrl?: string
  altText: string
  title: string
}

/**
 * Resolves whether the hero slide header displays an authentic title logo
 * or gracefully falls back to the high-contrast styled text title (LG02, LG03).
 */
export function resolveHeroTitleDisplay(
  slide: Pick<HeroSlide, "id" | "title" | "logoUrl">,
  failedLogos: Record<string, boolean> = {},
): HeroTitleDisplay {
  const hasFailed = Boolean(failedLogos[slide.id])
  const validLogo =
    slide.logoUrl && slide.logoUrl.trim().length > 0 ? slide.logoUrl.trim() : null

  if (validLogo && !hasFailed) {
    return {
      mode: "logo",
      logoUrl: validLogo,
      altText: slide.title,
      title: slide.title,
    }
  }

  return {
    mode: "text",
    title: slide.title,
    altText: slide.title,
  }
}

