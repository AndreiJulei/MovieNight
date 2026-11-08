import { useEffect, useRef, useState, useCallback } from "react"
import { useStore } from "../store/MovieStore"
import { moviesApi } from "../api/movies"
import { mapApiMovie } from "./useSuggestions"
import { mapPersonalMovie } from "./usePersonalRecommendations"
import type { Movie } from "../store/data"
import {
  buildHeroSlides,
  parseGenres,
  selectMovieCandidate,
  selectTvCandidate,
  isFamilyOrKidsTitle,
  type EnrichedMetadata,
  type HeroFeedCandidates,
  type HeroSlide,
} from "../components/heroBannerLogic"

export function useHeroSlides() {
  const store = useStore()
  const currentUserId = store.currentUser?.id
  const storeRef = useRef(store)
  storeRef.current = store

  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<HeroFeedCandidates>({})
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

    const [moviesResult, tvResult, animeResult, personalResult] =
      await Promise.allSettled([
        moviesApi.getExploreMedia("movies", { userScope: currentUserId }),
        moviesApi.getExploreMedia("tv", { userScope: currentUserId }),
        moviesApi.getExploreMedia("anime", { userScope: currentUserId }),
        moviesApi.getPersonalRecommendations(),
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

    setCandidates(nextCandidates)
    setLoading(false)

    // Concurrently enrich metadata (backdropUrl, genres, ratings) for the selected titles
    const chosenTitles = [
      movieCandidate,
      tvCandidate,
      currentAnime,
      personalRecommendation || upcomingMovie,
    ].filter((m): m is Movie => Boolean(m && m.tmdbId))

    for (const title of chosenTitles) {
      if (!title.tmdbId) continue
      void moviesApi
        .getByTmdbId(title.tmdbId, title.mediaType, {
          userScope: currentUserId,
        })
        .then((res) => {
          if (reqId !== activeReqId.current || !res) return
          const parsedGenres = parseGenres(res.genres)
          setEnrichments((prev) => ({
            ...prev,
            [title.id]: {
              backdropUrl: res.backdropUrl ?? null,
              logoUrl: res.logoUrl ?? null,
              genres: parsedGenres,
              imdbRating: res.imdbRating ?? null,
              tmdbVoteAverage: res.tmdbVoteAverage ?? null,
              releaseYear: res.releaseYear ?? null,
            },
          }))
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
        })
        .catch(() => {
          /* ignore enrichment errors; slide falls back to poster */
        })
    }
  }, [currentUserId])

  useEffect(() => {
    void fetchHeroFeeds()
    return () => {
      activeReqId.current++
    }
  }, [fetchHeroFeeds])

  const slides = buildHeroSlides(candidates, enrichments)

  return {
    slides,
    loading,
    reload: fetchHeroFeeds,
  }
}
