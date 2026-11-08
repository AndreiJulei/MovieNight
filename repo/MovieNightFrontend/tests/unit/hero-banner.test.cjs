const test = require("node:test")
const assert = require("node:assert/strict")

let hero

test.before(async () => {
  hero = await import("../../src/components/heroBannerLogic.ts")
})

test("formatHeroStarRating: prefers valid IMDb score (PH02)", () => {
  assert.equal(
    hero.formatHeroStarRating({ imdb: 8.4, tmdbRating: 7.9 }),
    "★ 8.4",
  )
  assert.equal(hero.formatHeroStarRating({ imdb: 8.0 }), "★ 8.0")
})

test("formatHeroStarRating: falls back to TMDB when IMDb is null or missing (PH02)", () => {
  assert.equal(
    hero.formatHeroStarRating({ imdb: null, tmdbRating: 7.5 }),
    "★ 7.5",
  )
  assert.equal(hero.formatHeroStarRating({ tmdbRating: 9.1 }), "★ 9.1")
})

test("formatHeroStarRating: valid 0 or 0.0 is preserved (PH02)", () => {
  assert.equal(hero.formatHeroStarRating({ imdb: 0 }), "★ 0.0")
  assert.equal(
    hero.formatHeroStarRating({ imdb: null, tmdbRating: 0 }),
    "★ 0.0",
  )
})

test("formatHeroStarRating: invalid or missing scores return null cleanly (PH02)", () => {
  assert.equal(
    hero.formatHeroStarRating({ imdb: null, tmdbRating: null }),
    null,
  )
  assert.equal(hero.formatHeroStarRating({ imdb: 11, tmdbRating: 15 }), null)
  assert.equal(hero.formatHeroStarRating({ imdb: -1 }), null)
})

test("createHeroSlide: uses high-resolution backdropUrl and falls back to posterUrl (PH02)", () => {
  const movie = {
    id: "movie-100",
    tmdbId: 100,
    title: "Dune: Part Two",
    year: 2024,
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    mediaType: "MOVIE",
    overview: "Paul Atreides unites with Chani and the Fremen.",
    genres: ["Sci-Fi", "Adventure"],
    imdb: 8.6,
  }

  const slide = hero.createHeroSlide({
    badge: "#1 in Movies",
    categoryPillar: "movies",
    movie,
  })

  assert.equal(slide.badge, "#1 in Movies")
  assert.equal(slide.title, "Dune: Part Two")
  assert.equal(
    slide.backdropUrl,
    "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  )
  assert.equal(slide.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg")
  assert.equal(slide.starRating, "★ 8.6")
  assert.equal(slide.year, 2024)
  assert.equal(slide.mediaType, "MOVIE")
  assert.deepEqual(slide.genres, ["Sci-Fi", "Adventure"])
  assert.equal(slide.detailUrl, "/movies/movie-100?type=MOVIE")
})

test("createHeroSlide: preserves null backdropUrl and retains posterUrl when backdropUrl is absent (PH02)", () => {
  const movie = {
    id: "movie-101",
    tmdbId: 101,
    title: "Indie Film",
    year: 2023,
    posterUrl: "https://image.tmdb.org/t/p/w500/indie_poster.jpg",
    mediaType: "MOVIE",
    imdb: 7.2,
  }

  const slide = hero.createHeroSlide({
    badge: "#1 in Movies",
    categoryPillar: "movies",
    movie,
  })

  assert.equal(slide.backdropUrl, null)
  assert.equal(
    slide.posterUrl,
    "https://image.tmdb.org/t/p/w500/indie_poster.jpg",
  )
  assert.equal(slide.logoUrl, null)
})

test("createHeroSlide: preserves and maps logoUrl from movie when available (LG01, LG02)", () => {
  const movie = {
    id: "movie-105",
    tmdbId: 105,
    title: "Fight Club",
    year: 1999,
    posterUrl: "https://image.tmdb.org/t/p/w500/fight_club.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/fight_club_bg.jpg",
    logoUrl: "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
    mediaType: "MOVIE",
  }

  const slide = hero.createHeroSlide({
    badge: "#1 in Movies",
    categoryPillar: "movies",
    movie,
  })

  assert.equal(slide.title, "Fight Club")
  assert.equal(
    slide.logoUrl,
    "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
  )
})

test("createHeroSlide: applies enriched logoUrl when provided (LG01, LG02)", () => {
  const movie = {
    id: "movie-106",
    tmdbId: 106,
    title: "Inception",
    year: 2010,
    posterUrl: "https://image.tmdb.org/t/p/w500/inception.jpg",
    mediaType: "MOVIE",
  }

  const enriched = {
    backdropUrl: "https://image.tmdb.org/t/p/w1280/inception_bg.jpg",
    logoUrl: "https://image.tmdb.org/t/p/w500/inception_logo.png",
  }

  const slide = hero.createHeroSlide({
    badge: "#1 in Movies",
    categoryPillar: "movies",
    movie,
    enriched,
  })

  assert.equal(
    slide.logoUrl,
    "https://image.tmdb.org/t/p/w500/inception_logo.png",
  )
})

test("resolveHeroTitleDisplay: resolves to logo mode when logoUrl is available and not failed (LG02)", () => {
  const slide = {
    id: "hero-movies-550",
    title: "Fight Club",
    logoUrl: "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
  }
  const display = hero.resolveHeroTitleDisplay(slide, {})
  assert.equal(display.mode, "logo")
  assert.equal(
    display.logoUrl,
    "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
  )
  assert.equal(display.altText, "Fight Club")
  assert.equal(display.title, "Fight Club")
})

test("resolveHeroTitleDisplay: resolves to text mode when logoUrl is null, undefined, or blank (LG03)", () => {
  const nullSlide = { id: "hero-tv-1", title: "Breaking Bad", logoUrl: null }
  assert.equal(hero.resolveHeroTitleDisplay(nullSlide, {}).mode, "text")
  assert.equal(
    hero.resolveHeroTitleDisplay(nullSlide, {}).title,
    "Breaking Bad",
  )

  const undefinedSlide = { id: "hero-tv-2", title: "The Wire" }
  assert.equal(hero.resolveHeroTitleDisplay(undefinedSlide, {}).mode, "text")

  const blankSlide = { id: "hero-tv-3", title: "Lost", logoUrl: "   " }
  assert.equal(hero.resolveHeroTitleDisplay(blankSlide, {}).mode, "text")
})

test("resolveHeroTitleDisplay: gracefully falls back to text title when logo image failed to load (LG03)", () => {
  const slide = {
    id: "hero-movies-550",
    title: "Fight Club",
    logoUrl: "https://image.tmdb.org/t/p/w500/corrupt_logo.png",
  }
  const failedLogos = { "hero-movies-550": true }
  const display = hero.resolveHeroTitleDisplay(slide, failedLogos)
  assert.equal(display.mode, "text")
  assert.equal(display.title, "Fight Club")
  assert.equal(display.logoUrl, undefined)
})

test("createHeroSlide: applies enriched metadata when provided (PH02)", () => {
  const baseMovie = {
    id: "movie-102",
    tmdbId: 102,
    title: "Shogun",
    year: 2024,
    posterUrl: "https://image.tmdb.org/t/p/w500/shogun.jpg",
    mediaType: "TV",
  }

  const enriched = {
    backdropUrl: "https://image.tmdb.org/t/p/w1280/shogun_backdrop.jpg",
    overview: "Lord Yoshii Toranaga discovers secrets in a fishing village.",
    genres: ["Drama", "War", "History"],
    imdbRating: 8.7,
    releaseYear: 2024,
  }

  const slide = hero.createHeroSlide({
    badge: "#1 in TV Series",
    categoryPillar: "tv",
    movie: baseMovie,
    enriched,
  })

  assert.equal(
    slide.backdropUrl,
    "https://image.tmdb.org/t/p/w1280/shogun_backdrop.jpg",
  )
  assert.equal(slide.overview, undefined, "overview is omitted from HeroSlide")
  assert.deepEqual(slide.genres, ["Drama", "War", "History"])
  assert.equal(slide.starRating, "★ 8.7")
  assert.equal(slide.badge, "#1 in TV Series")
})

test("buildHeroSlides: generates 4 curated slides in exact pillar order (PH01)", () => {
  const popular = {
    id: "m-1",
    tmdbId: 1,
    title: "Top Movie",
    mediaType: "MOVIE",
    year: 2024,
    imdb: 8.5,
  }
  const airing = {
    id: "t-2",
    tmdbId: 2,
    title: "Top TV",
    mediaType: "TV",
    year: 2024,
    imdb: 8.8,
  }
  const anime = {
    id: "a-3",
    tmdbId: 3,
    title: "Top Anime",
    mediaType: "ANIME",
    year: 2024,
    imdb: 9.0,
  }
  const forYou = {
    id: "m-4",
    tmdbId: 4,
    title: "Top For You",
    mediaType: "MOVIE",
    year: 2023,
    imdb: 8.1,
  }
  const upcoming = {
    id: "m-5",
    tmdbId: 5,
    title: "Top Upcoming",
    mediaType: "MOVIE",
    year: 2025,
    imdb: null,
  }

  const slides = hero.buildHeroSlides({
    movie: popular,
    tvSeries: airing,
    currentAnime: anime,
    personalRecommendation: forYou,
    upcomingMovie: upcoming,
  })

  assert.equal(slides.length, 4)
  assert.equal(slides[0].badge, "#1 in Movies")
  assert.equal(slides[0].title, "Top Movie")
  assert.equal(slides[1].badge, "#1 in TV Series")
  assert.equal(slides[1].title, "Top TV")
  assert.equal(slides[2].badge, "#1 in Anime")
  assert.equal(slides[2].title, "Top Anime")
  assert.equal(slides[3].badge, "#1 For You")
  assert.equal(slides[3].title, "Top For You")
})

test("buildHeroSlides: propagates logoUrl from candidates or enrichments (LG01, LG02)", () => {
  const popular = {
    id: "m-1",
    tmdbId: 1,
    title: "Fight Club",
    mediaType: "MOVIE",
    logoUrl: "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
  }
  const airing = {
    id: "m-2",
    tmdbId: 2,
    title: "Breaking Bad",
    mediaType: "TV",
  }

  const enrichments = {
    "m-2": {
      logoUrl: "https://image.tmdb.org/t/p/w500/breaking_bad_logo.png",
    },
  }

  const slides = hero.buildHeroSlides(
    {
      movie: popular,
      tvSeries: airing,
    },
    enrichments,
  )

  assert.equal(slides.length, 2)
  assert.equal(
    slides[0].logoUrl,
    "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
  )
  assert.equal(
    slides[1].logoUrl,
    "https://image.tmdb.org/t/p/w500/breaking_bad_logo.png",
  )
})

test("buildHeroSlides: falls back to #1 Anticipated when personal recommendation is null/empty (PH01)", () => {
  const popular = {
    id: "m-1",
    tmdbId: 1,
    title: "Top Movie",
    mediaType: "MOVIE",
    year: 2024,
  }
  const airing = {
    id: "t-2",
    tmdbId: 2,
    title: "Top TV",
    mediaType: "TV",
    year: 2024,
  }
  const anime = {
    id: "a-3",
    tmdbId: 3,
    title: "Top Anime",
    mediaType: "ANIME",
    year: 2024,
  }
  const upcoming = {
    id: "m-5",
    tmdbId: 5,
    title: "Anticipated Sci-Fi",
    mediaType: "MOVIE",
    year: 2025,
  }

  const slides = hero.buildHeroSlides({
    movie: popular,
    tvSeries: airing,
    currentAnime: anime,
    personalRecommendation: null,
    upcomingMovie: upcoming,
  })

  assert.equal(slides.length, 4)
  assert.equal(slides[3].badge, "#1 Anticipated")
  assert.equal(slides[3].title, "Anticipated Sci-Fi")
  assert.equal(slides[3].categoryPillar, "anticipated")
})

test("buildHeroSlides: gracefully omits unavailable categories without breaking others (PH01)", () => {
  const popular = {
    id: "m-1",
    tmdbId: 1,
    title: "Top Movie",
    mediaType: "MOVIE",
    year: 2024,
  }
  // Airing TV and anime failed or are empty
  const forYou = {
    id: "m-4",
    tmdbId: 4,
    title: "Top For You",
    mediaType: "MOVIE",
    year: 2023,
  }

  const slides = hero.buildHeroSlides({
    movie: popular,
    tvSeries: null,
    currentAnime: null,
    personalRecommendation: forYou,
    upcomingMovie: null,
  })

  assert.equal(slides.length, 2)
  assert.equal(slides[0].badge, "#1 in Movies")
  assert.equal(slides[1].badge, "#1 For You")
})

test("buildHeroSlides: returns empty array when all categories are null/empty (PH06)", () => {
  const slides = hero.buildHeroSlides({
    movie: null,
    tvSeries: null,
    currentAnime: null,
    personalRecommendation: null,
    upcomingMovie: null,
  })

  assert.equal(slides.length, 0)
})

test("getNextSlideIndex and getPreviousSlideIndex wrap around boundaries (PH04)", () => {
  const total = 4
  assert.equal(hero.getNextSlideIndex(0, total), 1)
  assert.equal(hero.getNextSlideIndex(3, total), 0) // wrap
  assert.equal(hero.getPreviousSlideIndex(0, total), 3) // wrap backwards
  assert.equal(hero.getPreviousSlideIndex(2, total), 1)

  // Single slide or zero slides
  assert.equal(hero.getNextSlideIndex(0, 1), 0)
  assert.equal(hero.getPreviousSlideIndex(0, 1), 0)
  assert.equal(hero.getNextSlideIndex(0, 0), 0)
})

test("shouldAutoAdvance: pauses on manual pause, hover, or focus (PH04)", () => {
  // Normal auto-advance condition
  assert.equal(
    hero.shouldAutoAdvance({
      totalSlides: 4,
      isManuallyPaused: false,
      isHovered: false,
      isFocused: false,
    }),
    true,
  )

  // Single slide does not auto-advance
  assert.equal(
    hero.shouldAutoAdvance({
      totalSlides: 1,
      isManuallyPaused: false,
      isHovered: false,
      isFocused: false,
    }),
    false,
  )

  // Manual pause freezes auto-advance
  assert.equal(
    hero.shouldAutoAdvance({
      totalSlides: 4,
      isManuallyPaused: true,
      isHovered: false,
      isFocused: false,
    }),
    false,
  )

  // Hover pauses auto-advance
  assert.equal(
    hero.shouldAutoAdvance({
      totalSlides: 4,
      isManuallyPaused: false,
      isHovered: true,
      isFocused: false,
    }),
    false,
  )

  // Keyboard focus pauses auto-advance
  assert.equal(
    hero.shouldAutoAdvance({
      totalSlides: 4,
      isManuallyPaused: false,
      isHovered: false,
      isFocused: true,
    }),
    false,
  )
})

test("evaluateTouchSwipe: detects swipe direction with threshold (PH04)", () => {
  // Left swipe (< -50px) advances to next slide
  assert.equal(hero.evaluateTouchSwipe(-51), "next")
  assert.equal(hero.evaluateTouchSwipe(-120), "next")

  // Right swipe (> 50px) returns to previous slide
  assert.equal(hero.evaluateTouchSwipe(51), "prev")
  assert.equal(hero.evaluateTouchSwipe(150), "prev")

  // Sub-threshold movements (< 50px) are ignored
  assert.equal(hero.evaluateTouchSwipe(0), "none")
  assert.equal(hero.evaluateTouchSwipe(49), "none")
  assert.equal(hero.evaluateTouchSwipe(-49), "none")
})

test("selectMovieCandidate: selects first movie from newest meeting voteAverage >= 6.5 floor (HB01)", () => {
  const newest = [
    { id: "m-1", title: "Flop Movie", voteAverage: 5.8 },
    { id: "m-2", title: "Fresh Hit", voteAverage: 7.2 },
    { id: "m-3", title: "Another Fresh", voteAverage: 8.0 },
  ]
  const topRated = [
    { id: "m-classic", title: "Classic Masterpiece", voteAverage: 9.3 },
  ]

  const selected = hero.selectMovieCandidate(newest, topRated)
  assert.equal(selected?.title, "Fresh Hit")
  assert.equal(selected?.id, "m-2")
})

test("selectMovieCandidate: falls back to top-rated when no newest movie meets rating floor (HB01)", () => {
  const newest = [
    { id: "m-1", title: "Mediocre Movie 1", voteAverage: 6.4 },
    { id: "m-2", title: "Mediocre Movie 2", voteAverage: 5.9 },
  ]
  const topRated = [
    { id: "m-classic", title: "The Godfather", voteAverage: 9.2 },
  ]

  const selected = hero.selectMovieCandidate(newest, topRated)
  assert.equal(selected?.title, "The Godfather")
  assert.equal(selected?.id, "m-classic")
})

test("selectMovieCandidate: falls back to top-rated when newest is empty or missing (HB01)", () => {
  const topRated = [
    { id: "m-classic", title: "The Shawshank Redemption", voteAverage: 9.3 },
  ]

  assert.equal(
    hero.selectMovieCandidate([], topRated)?.title,
    "The Shawshank Redemption",
  )
  assert.equal(
    hero.selectMovieCandidate(null, topRated)?.title,
    "The Shawshank Redemption",
  )
})

test("selectMovieCandidate: returns null when both newest and top-rated are empty (HB01)", () => {
  assert.equal(hero.selectMovieCandidate([], []), null)
  assert.equal(hero.selectMovieCandidate(null, null), null)
})

test("selectTvCandidate: selects first title from top-rated TV meeting vote floor (HB02)", () => {
  const topRated = [
    { id: "tv-1", title: "Breaking Bad", voteAverage: 9.2, voteCount: 1500 },
    { id: "tv-2", title: "The Wire", voteAverage: 9.1, voteCount: 1200 },
  ]

  const selected = hero.selectTvCandidate(topRated)
  assert.equal(selected?.title, "Breaking Bad")
  assert.equal(selected?.id, "tv-1")
})

test("selectTvCandidate: preserves candidate when voteCount metadata is null or missing (HB02)", () => {
  const topRatedMissing = [
    { id: "tv-no-votes", title: "Bayesian Show Without Count", voteAverage: 8.9 },
  ]
  assert.equal(
    hero.selectTvCandidate(topRatedMissing)?.title,
    "Bayesian Show Without Count",
  )

  const topRatedNull = [
    { id: "tv-null-votes", title: "Null Votes Show", voteAverage: 8.9, voteCount: null },
  ]
  assert.equal(hero.selectTvCandidate(topRatedNull)?.title, "Null Votes Show")
})

test("selectTvCandidate: selects first title from categories matching top-rated (HB02)", () => {
  const categories = [
    {
      id: "airing",
      movies: [{ id: "airing-1", title: "Airing Show", voteAverage: 7.5, voteCount: 800 }],
    },
    {
      id: "top-rated",
      movies: [{ id: "top-1", title: "Bayesian Ranked TV", voteAverage: 8.9, voteCount: 1200 }],
    },
  ]

  const selected = hero.selectTvCandidate(categories)
  assert.equal(selected?.title, "Bayesian Ranked TV")
  assert.equal(selected?.id, "top-1")
})

test("selectTvCandidate: rejects airing feed and returns null when top-rated is absent (HB02)", () => {
  const categories = [
    {
      id: "airing",
      movies: [{ id: "airing-1", title: "Raw Airing Show", voteAverage: 7.5, voteCount: 800 }],
    },
    {
      id: "popular",
      movies: [{ id: "pop-1", title: "Popular Show", voteAverage: 7.8, voteCount: 900 }],
    },
  ]

  // Crucial HB02 guard: must NOT fall back to airing or popular when top-rated is absent
  const selected = hero.selectTvCandidate(categories)
  assert.equal(selected, null)
})

test("selectTvCandidate: rejects explicit non-top-rated category (HB02)", () => {
  const movies = [{ id: "tv-airing", title: "Airing Title", voteAverage: 8.0, voteCount: 800 }]
  assert.equal(hero.selectTvCandidate(movies, "airing"), null)
  assert.equal(hero.selectTvCandidate(movies, "popular"), null)
  assert.equal(hero.selectTvCandidate(movies, "top-rated")?.title, "Airing Title")
})

test("selectTvCandidate: returns null when top-rated TV is empty or missing (HB02)", () => {
  assert.equal(hero.selectTvCandidate([]), null)
  assert.equal(hero.selectTvCandidate(null), null)
})

test("selectTvCandidate: enforces minimumVotes floor (150) and skips candidate below floor (HB02)", () => {
  const topRated = [
    { id: "tv-low", title: "Low Votes Show", voteAverage: 9.8, voteCount: 120 },
    {
      id: "tv-high",
      title: "Bayesian Confidence Show",
      voteAverage: 8.9,
      voteCount: 300,
    },
  ]
  const selected = hero.selectTvCandidate(topRated)
  assert.equal(selected?.title, "Bayesian Confidence Show")
  assert.equal(selected?.id, "tv-high")
})

test("selectTvCandidate: returns null when all top-rated candidates are below minimumVotes floor (HB02)", () => {
  const topRated = [
    { id: "tv-low1", title: "Low Votes Show 1", voteCount: 50 },
    { id: "tv-low2", title: "Low Votes Show 2", voteCount: 149 },
  ]
  assert.equal(hero.selectTvCandidate(topRated), null)
})

test("isFamilyOrKidsTitle: detects kids and family titles by genre or title", () => {
  assert.equal(hero.isFamilyOrKidsTitle("Wildwood", ["Animation", "Family"]), true)
  assert.equal(hero.isFamilyOrKidsTitle("Doraemon", ["Animation"]), true)
  assert.equal(hero.isFamilyOrKidsTitle("Dune: Part Two", ["Sci-Fi", "Adventure"]), false)
  assert.equal(hero.isFamilyOrKidsTitle(null, null, [10751]), true)
  assert.equal(hero.isFamilyOrKidsTitle(null, null, [10762]), true)
})

test("selectMovieCandidate: filters out Family/Kids releases", () => {
  const newest = [
    { id: "m-kids", title: "Wildwood", voteAverage: 7.5, genres: ["Family", "Animation"] },
    { id: "m-mature", title: "Dune: Part Two", voteAverage: 8.4, genres: ["Sci-Fi", "Adventure"] },
  ]
  const selected = hero.selectMovieCandidate(newest, [])
  assert.equal(selected?.title, "Dune: Part Two")
  assert.equal(selected?.id, "m-mature")
})

test("selectTvCandidate: enforces minimumVotes floor inside categories structure (HB02)", () => {
  const categories = [
    {
      id: "top-rated",
      movies: [
        { id: "tv-few", title: "Niche Show", voteCount: 50 },
        { id: "tv-valid", title: "Shogun", voteCount: 800 },
      ],
    },
  ]
  const selected = hero.selectTvCandidate(categories)
  assert.equal(selected?.title, "Shogun")
  assert.equal(selected?.id, "tv-valid")
})

test("buildHeroSlides: supports movie and tvSeries keys (HB01, HB02)", () => {
  const movie = { id: "m-1", title: "Newest Movie", mediaType: "MOVIE" }
  const tv = { id: "t-1", title: "Top Rated TV", mediaType: "TV" }
  const anime = { id: "a-1", title: "Current Anime", mediaType: "ANIME" }

  const slides = hero.buildHeroSlides({
    movie,
    tvSeries: tv,
    currentAnime: anime,
  })

  assert.equal(slides.length, 3)
  assert.equal(slides[0].badge, "#1 in Movies")
  assert.equal(slides[0].title, "Newest Movie")
  assert.equal(slides[1].badge, "#1 in TV Series")
  assert.equal(slides[1].title, "Top Rated TV")
  assert.equal(slides[2].badge, "#1 in Anime")
  assert.equal(slides[2].title, "Current Anime")
})
