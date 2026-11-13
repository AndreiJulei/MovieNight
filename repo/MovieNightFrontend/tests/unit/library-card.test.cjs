// Ticket #22 (PD-06) PG02: Watched cards show only the personal rating under the
// title; Watchlist cards show only the year.
const test = require("node:test")
const assert = require("node:assert/strict")

let libraryCardCaption

test.before(async () => {
  const mod = await import("../../src/components/libraryCard.ts")
  libraryCardCaption = mod.libraryCardCaption
})

test("watched card shows the personal rating with one decimal (PG02)", () => {
  assert.equal(libraryCardCaption("watched", { rating: 8.2, year: 2019 }), "★ 8.2")
  assert.equal(libraryCardCaption("watched", { rating: 7, year: 2019 }), "★ 7.0")
})

test("watched card keeps a genuine zero rating (PG02)", () => {
  assert.equal(libraryCardCaption("watched", { rating: 0, year: 2019 }), "★ 0.0")
})

test("watched card without a rating says Unrated (PG02)", () => {
  assert.equal(libraryCardCaption("watched", { rating: null, year: 2019 }), "Unrated")
  assert.equal(libraryCardCaption("watched", { rating: undefined, year: 2019 }), "Unrated")
  assert.equal(libraryCardCaption("watched", { rating: Number.NaN, year: 2019 }), "Unrated")
})

test("watchlist card shows only the year, never the rating (PG02)", () => {
  assert.equal(libraryCardCaption("watchlist", { rating: 9.1, year: 2019 }), "2019")
})

test("watchlist card with an unknown year shows an empty caption (PG02)", () => {
  assert.equal(libraryCardCaption("watchlist", { rating: null, year: null }), "")
})

// #22 follow-up: friends' library cards show the year plus one rating.
test("friend watched card shows the year and the friend's rating", async () => {
  const { friendLibraryCardCaption } = await import("../../src/components/libraryCard.ts")
  assert.equal(friendLibraryCardCaption("watched", { year: 2019, friendRating: 8.2, tmdbRating: 7.1 }), "2019 · ★ 8.2")
  assert.equal(friendLibraryCardCaption("watched", { year: 2019, friendRating: null }), "2019 · Unrated")
  assert.equal(friendLibraryCardCaption("watched", { year: null, friendRating: 6 }), "★ 6.0")
})

test("friend watchlist card shows the year and the TMDB audience rating", async () => {
  const { friendLibraryCardCaption } = await import("../../src/components/libraryCard.ts")
  assert.equal(friendLibraryCardCaption("watchlist", { year: 2019, friendRating: 9, tmdbRating: 7.84 }), "2019 · TMDB 7.8")
  assert.equal(friendLibraryCardCaption("watchlist", { year: 2019, tmdbRating: null }), "2019")
  assert.equal(friendLibraryCardCaption("watchlist", { year: null, tmdbRating: null }), "")
})
