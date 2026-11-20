import { useEffect, useRef, useState, useCallback } from "react"
import { useStore } from "../store/MovieStore"
import { moviesApi, type ApiSuggestionMovieItem } from "../api/movies"
import { mapApiMovie } from "./useSuggestions"
import { mapPersonalMovie } from "./usePersonalRecommendations"
import type { Movie } from "../store/data"
import {
  buildHomeHeroSlides,
  drawHeroPicks,
  HERO_MAX_PER_POOL,
  markFriendsWatchlistPicks,
  parseGenres,
  selectMovieCandidate,
  selectTvCandidate,
  shuffleWith,
  isFamilyOrKidsTitle,
  type EnrichedMetadata,
  type HeroFeedCandidates,
  type HeroPick,
  type HeroPickPools,
} from "../components/heroBannerLogic"

/** Titles probed for a backdrop per pool when its source has too few known backdrops. */
const BACKDROP_PROBES_PER_POOL = 3

/** Maps provider items, dropping any whose mapping throws (no usable identity). */
function mapValidItems(
  items: readonly ApiSuggestionMovieItem[],
  map: (item: ApiSuggestionMovieItem) => Movie,
): Movie[] {
  return items.flatMap((item) => {
    try {
      return [map(item)]
    } catch {
      return []
    }
  })
}

export function useHeroSlides() {
  const store = useStore()
  const currentUserId = store.currentUser?.id
  const storeRef = useRef(store)
  storeRef.current = store

  // The watchlist pool needs the library, so the visit's draw waits for its
  // first load, while the hero's own requests start at once (the two loads
  // overlap instead of running one after the other). Latching per user keeps
  // later library refreshes (e.g. a watchlist toggle from the hero) from
  // redrawing the visit's selection.
  const libraryReadyFor = useRef<string | null>(null)
  const userKey = currentUserId ? String(currentUserId) : null
  if (userKey && !store.libraryLoading) libraryReadyFor.current = userKey
  const libraryReady = !!userKey && libraryReadyFor.current === userKey

  const libraryGate = useRef<{
    user: string
    ready: Promise<void>
    open: () => void
  } | null>(null)
  const libraryGateFor = useCallback((user: string) => {
    if (libraryGate.current?.user !== user) {
      let open = () => {}
      const ready = new Promise<void>((resolve) => (open = resolve))
      libraryGate.current = { user, ready, open }
    }
    return libraryGate.current
  }, [])
  useEffect(() => {
    if (userKey && libraryReady) libraryGateFor(userKey).open()
  }, [userKey, libraryReady, libraryGateFor])

  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<HeroFeedCandidates>({})
  const [picks, setPicks] = useState<HeroPick[]>([])
  const [enrichments, setEnrichments] =
    useState<Record<string, EnrichedMetadata | null>>({})

  const activeReqId = useRef(0)

  const fetchHeroFeeds = useCallback(async () => {
    if (!currentUserId) {
      setLoading(false)
      return
    }

    const reqId = ++activeReqId.current
    setLoading(true)

    /** Fetches a title's details once; resolves null when unavailable. */
    const enrich = (title: Movie): Promise<EnrichedMetadata | null> => {
      if (!title.tmdbId) return Promise.resolve(null)
      return moviesApi
        .getByTmdbId(title.tmdbId, title.mediaType, {
          userScope: currentUserId,
          // Entry pages never wait for OMDb; missing scores show on a later load.
          waitForScores: false,
        })
        .then((res) => {
          if (reqId !== activeReqId.current || !res) return null
          const parsedGenres = parseGenres(res.genres)
          const enriched: EnrichedMetadata = {
            backdropUrl: res.backdropUrl ?? null,
            logoUrl: res.logoUrl ?? null,
            genres: parsedGenres,
            imdbRating: res.imdbRating ?? null,
            tmdbVoteAverage: res.tmdbVoteAverage ?? null,
            releaseYear: res.releaseYear ?? null,
          }
          setEnrichments((prev) => ({ ...prev, [title.id]: enriched }))
          // Upsert enriched movie into store
          storeRef.current.upsertMovie({
            ...title,
            logoUrl: res.logoUrl ?? title.logoUrl ?? null,
            genres:
              parsedGenres.length > 0 ? parsedGenres : (title.genres ?? []),
            imdb: res.imdbRating ?? title.imdb ?? null,
            tmdbRating: res.tmdbVoteAverage ?? title.tmdbRating ?? null,
            year: res.releaseYear ?? title.year ?? null,
          })
          return enriched
        })
        .catch(() => null /* slide falls back to poster or is skipped */)
    }

    const [moviesResult, tvResult, animeResult, personalResult, friendsResult] =
      await Promise.allSettled([
        moviesApi.getExploreMedia("movies", { userScope: currentUserId }),
        moviesApi.getExploreMedia("tv", { userScope: currentUserId }),
        moviesApi.getExploreMedia("anime", { userScope: currentUserId }),
        moviesApi.getPersonalRecommendations(),
        moviesApi.getFriendsRecommendations(),
      ])

    if (reqId !== activeReqId.current) return

    // 1. Movie & Upcoming Movie from 'movies' feed (HB01)
    let movieCandidate: Movie | null = null
    let upcomingMovie: Movie | null = null
    if (moviesResult.status === "fulfilled" && moviesResult.value?.categories) {
      const newestCat = moviesResult.value.categories.find(
        (c) => c.id === "newest",
      )
      const topRatedCat = moviesResult.value.categories.find(
        (c) => c.id === "top-rated",
      )
      const bestMovieRaw = selectMovieCandidate(
        newestCat?.movies,
        topRatedCat?.movies,
      )
      if (bestMovieRaw) {
        movieCandidate = mapApiMovie(bestMovieRaw, storeRef.current)
      }

      const upCat = moviesResult.value.categories.find(
        (c) => c.id === "upcoming",
      )
      if (upCat?.movies && upCat.movies.length > 0) {
        const candidate = upCat.movies.find((m) => !isFamilyOrKidsTitle(m))
        if (candidate) {
          upcomingMovie = mapApiMovie(candidate, storeRef.current)
        }
      }
    }

    // 2. TV Series from Bayesian-ranked 'top-rated' feed (HB02)
    let tvCandidate: Movie | null = null
    if (tvResult.status === "fulfilled" && tvResult.value?.categories) {
      const bestTvRaw = selectTvCandidate(tvResult.value.categories)
      if (bestTvRaw) {
        tvCandidate = mapApiMovie(bestTvRaw, storeRef.current)
      }
    }

    // 3. Current Season Anime from 'anime' feed (filtering out Kids/Family anime)
    let currentAnime: Movie | null = null
    if (animeResult.status === "fulfilled" && animeResult.value?.categories) {
      const animeCat = animeResult.value.categories.find(
        (c) => c.id === "current-season",
      )
      if (animeCat?.movies && animeCat.movies.length > 0) {
        const candidate = animeCat.movies.find((m) => !isFamilyOrKidsTitle(m))
        if (candidate) {
          currentAnime = mapApiMovie(candidate, storeRef.current)
        }
      }
    }

    // 4. Personalized Recommendation (filtering out Kids/Family titles)
    let personalRecommendation: Movie | null = null
    if (
      personalResult.status === "fulfilled" &&
      personalResult.value?.categories
    ) {
      const pCat = personalResult.value.categories[0]
      if (pCat?.movies && pCat.movies.length > 0) {
        const candidate = pCat.movies.find((m) => !isFamilyOrKidsTitle(m))
        if (candidate) {
          personalRecommendation = mapPersonalMovie(candidate)
        }
      }
    }

    const nextCandidates: HeroFeedCandidates = {
      movie: movieCandidate,
      tvSeries: tvCandidate,
      currentAnime,
      personalRecommendation,
      upcomingMovie,
    }

    // 5. Personal pools for this visit's picks (#25). Recommendation and
    //    friend pools keep the hero's Kids/Family filter; the watchlist is the
    //    user's own choice and is not filtered. The watchlist pool waits for
    //    the library's first load.
    await libraryGateFor(String(currentUserId)).ready
    if (reqId !== activeReqId.current) return
    const libraryStore = storeRef.current
    const friendCategories =
      friendsResult.status === "fulfilled"
        ? (friendsResult.value?.categories ?? [])
        : []
    const friendRatedIds = new Set(
      mapValidItems(
        friendCategories
          .filter((c) => c.id !== "friends-watchlist")
          .flatMap((c) => c.movies),
        (item) => mapApiMovie(item, libraryStore),
      ).map((m) => m.id),
    )
    const pools: HeroPickPools = {
      watchlist: libraryStore
        .entriesFor(currentUserId, "watchlist")
        .map((entry) => libraryStore.movieById(entry.movieId))
        .filter((m): m is Movie => Boolean(m)),
      recommended:
        personalResult.status === "fulfilled"
          ? mapValidItems(
              (personalResult.value?.categories?.[0]?.movies ?? []).filter(
                (m) => !isFamilyOrKidsTitle(m),
              ),
              (item) => ({
                ...mapPersonalMovie(item),
                backdropUrl: item.backdropUrl ?? null,
                logoUrl: item.logoUrl ?? null,
              }),
            )
          : [],
      friends: mapValidItems(
        friendCategories
          .flatMap((c) => c.movies)
          .filter((m) => !isFamilyOrKidsTitle(m)),
        (item) => mapApiMovie(item, libraryStore),
      ),
    }
    const friendsWatchlistOnly = new Set(
      pools.friends.map((m) => m.id).filter((id) => !friendRatedIds.has(id)),
    )

    // Titles without a known backdrop are skipped unless details confirm one.
    // When a pool lacks enough known backdrops, probe a few random titles.
    const probes = Object.values(pools).flatMap((pool) => {
      if (pool.filter((m) => m.backdropUrl).length >= HERO_MAX_PER_POOL)
        return []
      return shuffleWith(
        pool.filter((m) => !m.backdropUrl),
        Math.random,
      ).slice(0, BACKDROP_PROBES_PER_POOL)
    })
    const probed = new Map<string, EnrichedMetadata | null>()
    await Promise.all(
      probes.map(async (title) => probed.set(title.id, await enrich(title))),
    )
    if (reqId !== activeReqId.current) return

    const nextPicks = markFriendsWatchlistPicks(
      drawHeroPicks(pools, Math.random, (m) =>
        Boolean(m.backdropUrl || probed.get(m.id)?.backdropUrl),
      ),
      friendsWatchlistOnly,
    )

    setCandidates(nextCandidates)
    setPicks(nextPicks)
    setLoading(false)

    // Lazily enrich the shown slides (backdrop, logo, genres, ratings).
    for (const slide of buildHomeHeroSlides(nextPicks, nextCandidates)) {
      if (!probed.has(slide.movie.id)) void enrich(slide.movie)
    }
  }, [currentUserId, libraryGateFor])

  // One draw per visit: re-renders keep the selection; remounting redraws.
  useEffect(() => {
    if (!currentUserId) {
      setLoading(false)
      return
    }
    void fetchHeroFeeds()
    return () => {
      activeReqId.current++
    }
  }, [currentUserId, fetchHeroFeeds])

  const slides = buildHomeHeroSlides(picks, candidates, enrichments)

  return {
    slides,
    loading,
    reload: fetchHeroFeeds,
  }
}
