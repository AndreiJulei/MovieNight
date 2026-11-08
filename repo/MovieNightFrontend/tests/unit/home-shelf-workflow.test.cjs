const test = require("node:test")
const assert = require("node:assert/strict")

let shelfLogic

test.before(async () => {
  shelfLogic = await import("../../src/components/homeShelfLogic.ts")
})

const mockMovie = (id, title, tmdbRating, imdb = null, tmdbId = null) => ({
  id,
  title,
  year: 2024,
  posterUrl: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
  posterSeed: null,
  imdb,
  tmdbRating,
  tmdbVotes: 1000,
  mediaType: "MOVIE",
  tmdbId: tmdbId ?? parseInt(id.replace(/\D/g, "") || "1", 10),
})

// ── RW01: Adaptive row ordering (Cases 1, 2, 3) ──
test("RW01: Case 1 — No personal recommendations and no friends suggestions renders Top Rated and Popular & Well-Rated", () => {
  const result = shelfLogic.determineHomeShelfOrdering({
    personalMovies: [],
    friendMovies: [],
    topRatedMovies: [mockMovie("tr-1", "Top Movie 1", 8.5)],
    popularMovies: [mockMovie("pop-1", "Popular Movie 1", 7.5)],
  })

  assert.equal(result.caseIndex, 1)
  assert.deepEqual(result.shelves, ["top-rated", "popular"])
})

test("RW01: Case 2 — Personal recommendations available, but no friends suggestions renders Personal, Top Rated, and Popular & Well-Rated", () => {
  const result = shelfLogic.determineHomeShelfOrdering({
    personalMovies: [mockMovie("rec-1", "Recommended Movie 1", 8.0)],
    friendMovies: [],
    topRatedMovies: [mockMovie("tr-1", "Top Movie 1", 8.5)],
    popularMovies: [mockMovie("pop-1", "Popular Movie 1", 7.5)],
  })

  assert.equal(result.caseIndex, 2)
  assert.deepEqual(result.shelves, ["personal", "top-rated", "popular"])
})

test("RW01: Case 3 — Both personal recommendations and friends suggestions available renders Personal, Friend Suggestions, and Top Rated", () => {
  const result = shelfLogic.determineHomeShelfOrdering({
    personalMovies: [mockMovie("rec-1", "Recommended Movie 1", 8.0)],
    friendMovies: [mockMovie("fr-1", "Friend Pick 1", 7.8)],
    topRatedMovies: [mockMovie("tr-1", "Top Movie 1", 8.5)],
    popularMovies: [mockMovie("pop-1", "Popular Movie 1", 7.5)],
  })

  assert.equal(result.caseIndex, 3)
  assert.deepEqual(result.shelves, ["personal", "friends", "top-rated"])
})

test("RW01: Case 2 (Friend fallback) — Friend suggestions available without personal recommendations renders Friends, Top Rated, and Popular & Well-Rated", () => {
  const result = shelfLogic.determineHomeShelfOrdering({
    personalMovies: [],
    friendMovies: [mockMovie("fr-1", "Friend Pick 1", 7.8)],
    topRatedMovies: [mockMovie("tr-1", "Top Movie 1", 8.5)],
    popularMovies: [mockMovie("pop-1", "Popular Movie 1", 7.5)],
  })

  assert.equal(result.caseIndex, 2)
  assert.deepEqual(result.shelves, ["friends", "top-rated", "popular"])
})

// ── RW02: Deduplication & voteAverage >= 7.0 filter ──
test("RW02: Popular titles with voteAverage < 7.0 are excluded", () => {
  const popular = [
    mockMovie("p1", "High Rated Pop", 8.0, null, 101),
    mockMovie("p2", "Borderline 7.0 Pop", 7.0, null, 102),
    mockMovie("p3", "Sub-par Pop 6.9", 6.9, null, 103),
    mockMovie("p4", "Low Rated Pop 5.5", 5.5, null, 104),
  ]
  const topRated = [mockMovie("tr1", "Unrelated Top Rated", 9.0, null, 201)]

  const filtered = shelfLogic.filterAndDeduplicatePopular(popular, topRated)
  assert.equal(filtered.length, 2)
  assert.deepEqual(
    filtered.map((m) => m.id),
    ["p1", "p2"],
  )
})

test("RW02: Popular titles appearing in Top Rated are deduplicated out", () => {
  const topRated = [
    mockMovie("shared-1", "The Godfather", 9.2, null, 238),
    mockMovie("tr-unique", "Citizen Kane", 8.9, null, 15),
  ]
  const popular = [
    mockMovie("shared-1", "The Godfather", 9.2, null, 238),
    mockMovie("pop-title-match", "the godfather", 9.0, null, 999), // Case-insensitive title collision
    mockMovie("pop-unique-1", "Inception", 8.4, null, 27205),
    mockMovie("pop-unique-2", "Interstellar", 8.7, null, 157336),
  ]

  const filtered = shelfLogic.filterAndDeduplicatePopular(popular, topRated)
  assert.equal(filtered.length, 2)
  assert.deepEqual(
    filtered.map((m) => m.title),
    ["Inception", "Interstellar"],
  )
})

test("RW02: Deduplication handles null/undefined ratings safely falling back to imdb", () => {
  const popular = [
    mockMovie("p-imdb", "IMDb Rescued Movie", null, 7.5),
    mockMovie("p-imdb-low", "IMDb Low Movie", null, 6.5),
    mockMovie("p-no-rating", "No Rating Movie", null, null),
  ]
  const topRated = []

  const filtered = shelfLogic.filterAndDeduplicatePopular(popular, topRated)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, "p-imdb")
})

// ── RW03: Density spacing token constant ──
test("RW03: Shelf spacing class constant matches space-y-10 sm:space-y-16", () => {
  assert.equal(shelfLogic.SHELF_SPACING_CLASS, "space-y-10 sm:space-y-16")
})

// ── RW04: Centered Empty state messages and CTA buttons ──
test("RW04: Personal recommendations empty state defines exact message and CTA", () => {
  const personalEmpty = shelfLogic.EMPTY_STATE_MESSAGES.personal
  assert.equal(
    personalEmpty.message,
    "No recommendations yet. Start by marking movies as watched to let MovieNight learn your taste.",
  )
  assert.equal(personalEmpty.ctaLabel, "Explore Movies")
  assert.equal(personalEmpty.ctaTo, "/explore/movies")
})

test("RW04: Friend suggestions empty state defines exact message and CTA", () => {
  const friendsEmpty = shelfLogic.EMPTY_STATE_MESSAGES.friends
  assert.equal(
    friendsEmpty.message,
    "No friend suggestions yet. Add friends who have watched movies to see their picks here.",
  )
  assert.equal(friendsEmpty.ctaLabel, "Find Friends")
  assert.equal(friendsEmpty.ctaTo, "/friends")
})

// ── RW05: Unified reload action button format ──
test("RW05: Reload button text constant matches [↺ Reload list]", () => {
  assert.equal(shelfLogic.RELOAD_BUTTON_TEXT, "↺ Reload list")
})
