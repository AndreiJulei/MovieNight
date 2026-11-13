// Ticket #26 (PD-10): Explore spotlight hero and "Top 10 today" row.
const test = require("node:test")
const assert = require("node:assert/strict")

let highlightsView

test.before(async () => {
  const mod = await import("../../src/components/exploreHighlightsLogic.ts")
  highlightsView = mod.highlightsView
})

function item(tmdbId, extra = {}) {
  return {
    tmdbId,
    title: `Title ${tmdbId}`,
    posterUrl: `https://img/p${tmdbId}.jpg`,
    backdropUrl: `https://img/b${tmdbId}.jpg`,
    releaseYear: 2026,
    voteAverage: 7.8,
    mediaType: "MOVIE",
    ...extra,
  }
}

function response({ spotlight = [], topTen = [], spotlightState = "READY", topTenState = "READY" } = {}) {
  return {
    categories: [
      { id: "spotlight", title: "Trending this week", state: spotlightState, updatedAt: "2026-11-12T08:00:00Z", movies: spotlight },
      { id: "top-10", title: "Top 10 today", state: topTenState, updatedAt: "2026-11-13T04:30:00Z", movies: topTen },
    ],
  }
}

const range = (from, count) => Array.from({ length: count }, (_, i) => from + i)

test("EH01: spotlight slides follow the weekly chart with its artwork, genres and rank badges", () => {
  const view = highlightsView("movies", {
    loading: false,
    error: null,
    data: response({
      spotlight: [
        item(1, { logoUrl: "https://img/logo1.png", genres: ["Drama", "Mystery"] }),
        item(2),
        item(3),
      ],
    }),
  })

  assert.equal(view.spotlight.status, "ready")
  assert.deepEqual(
    view.spotlight.slides.map((s) => s.badge),
    ["#1 Trending this week", "#2 Trending this week", "#3 Trending this week"],
  )
  const first = view.spotlight.slides[0]
  assert.equal(first.title, "Title 1")
  assert.equal(first.backdropUrl, "https://img/b1.jpg")
  assert.equal(first.logoUrl, "https://img/logo1.png")
  assert.deepEqual(first.genres, ["Drama", "Mystery"])
  assert.equal(first.mediaType, "MOVIE")
  assert.equal(first.detailUrl, "/movies/movie:1?type=MOVIE")
  assert.equal(first.starRating, "★ 7.8")
})

test("EH01: the spotlight rotates at most 5 titles and skips titles without a backdrop, keeping chart ranks", () => {
  const view = highlightsView("movies", {
    loading: false,
    error: null,
    data: response({
      spotlight: [item(1), item(2, { backdropUrl: undefined }), ...range(3, 6).map((id) => item(id))],
    }),
  })

  assert.deepEqual(
    view.spotlight.slides.map((s) => [s.movie.tmdbId, s.badge]),
    [
      [1, "#1 Trending this week"],
      [3, "#3 Trending this week"],
      [4, "#4 Trending this week"],
      [5, "#5 Trending this week"],
      [6, "#6 Trending this week"],
    ],
  )
})

test("EH01: the Top 10 row numbers the daily chart 1-10", () => {
  const view = highlightsView("movies", {
    loading: false,
    error: null,
    data: response({ spotlight: [item(1)], topTen: range(101, 12).map((id) => item(id)) }),
  })

  assert.equal(view.topTen.status, "ready")
  assert.deepEqual(
    view.topTen.entries.map((e) => e.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
  assert.deepEqual(
    view.topTen.entries.map((e) => e.movie.tmdbId),
    range(101, 10),
  )
  assert.equal(view.topTen.entries[0].movie.posterUrl, "https://img/p101.jpg")
})

test("EH02: anime highlights become anime TV titles with TV identities", () => {
  const view = highlightsView("anime", {
    loading: false,
    error: null,
    data: response({
      spotlight: [item(7, { mediaType: "ANIME" })],
      topTen: [item(7, { mediaType: "ANIME" })],
    }),
  })

  assert.equal(view.spotlight.slides[0].mediaType, "ANIME")
  assert.equal(view.spotlight.slides[0].categoryPillar, "anime")
  assert.equal(view.topTen.entries[0].movie.id, "tv:7")
  assert.equal(view.topTen.entries[0].movie.mediaType, "ANIME")
})

test("EH04: an unavailable or empty chart hides only that section", () => {
  const view = highlightsView("tv", {
    loading: false,
    error: null,
    data: response({ spotlightState: "UNAVAILABLE", topTen: [item(1, { mediaType: "TV" })] }),
  })
  assert.equal(view.spotlight.status, "unavailable")
  assert.deepEqual(view.spotlight.slides, [])
  assert.equal(view.topTen.status, "ready")

  const empty = highlightsView("tv", {
    loading: false,
    error: null,
    data: response({ spotlight: [item(1, { backdropUrl: undefined })], topTen: [] }),
  })
  assert.equal(empty.spotlight.status, "unavailable")
  assert.equal(empty.topTen.status, "unavailable")
})

test("EH04: a failed request makes both sections unavailable; a stale chart is still shown", () => {
  const failed = highlightsView("movies", { loading: false, error: "Could not load highlights.", data: null })
  assert.equal(failed.spotlight.status, "unavailable")
  assert.equal(failed.topTen.status, "unavailable")

  const stale = highlightsView("movies", {
    loading: false,
    error: null,
    data: response({ spotlight: [item(1)], topTen: [item(2)], spotlightState: "STALE", topTenState: "STALE" }),
  })
  assert.equal(stale.spotlight.status, "ready")
  assert.equal(stale.topTen.status, "ready")
  // A stale chart is still shown, with the same "Stale snapshot" notice as the shelves.
  assert.equal(stale.spotlight.staleSince, "2026-11-12T08:00:00Z")
  assert.equal(stale.topTen.staleSince, "2026-11-13T04:30:00Z")
})

test("fresh charts carry no stale notice", () => {
  const view = highlightsView("movies", {
    loading: false,
    error: null,
    data: response({ spotlight: [item(1)], topTen: [item(2)] }),
  })
  assert.equal(view.spotlight.staleSince, null)
  assert.equal(view.topTen.staleSince, null)
})

test("first load shows the loading state until the highlights arrive", () => {
  const view = highlightsView("movies", { loading: true, error: null, data: null })
  assert.equal(view.spotlight.status, "loading")
  assert.equal(view.topTen.status, "loading")
})

test("EH04: retrying after a failed request keeps the notice instead of the tall loading state", () => {
  // A taller loading state would shift the shelves below (e.g. under a restored scroll position).
  const view = highlightsView("movies", { loading: true, error: "Could not load highlights.", data: null })
  assert.equal(view.spotlight.status, "unavailable")
  assert.equal(view.topTen.status, "unavailable")
})

test("titles without a usable identity are dropped", () => {
  const view = highlightsView("movies", {
    loading: false,
    error: null,
    data: response({ spotlight: [item(0), item(1)], topTen: [item(-5), item(2)] }),
  })
  assert.deepEqual(view.spotlight.slides.map((s) => s.movie.tmdbId), [1])
  assert.deepEqual(view.topTen.entries.map((e) => [e.rank, e.movie.tmdbId]), [[1, 2]])
})
