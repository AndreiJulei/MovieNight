const test = require("node:test")
const assert = require("node:assert/strict")

let hero

test.before(async () => {
  hero = await import("../../src/components/heroBannerLogic.ts")
})

function movie(id, extra = {}) {
  return {
    id,
    tmdbId: Number(id.replace(/\D/g, "")) || 1,
    title: `Title ${id}`,
    year: 2024,
    posterSeed: null,
    posterUrl: `https://img/${id}-poster.jpg`,
    backdropUrl: `https://img/${id}-backdrop.jpg`,
    imdb: 7.5,
    rt: null,
    overview: "",
    genres: [],
    mediaType: "MOVIE",
    ...extra,
  }
}

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const hasBackdrop = (m) => Boolean(m.backdropUrl)

function fullPools() {
  return {
    watchlist: ["w1", "w2", "w3", "w4"].map((id) => movie(id)),
    recommended: ["r1", "r2", "r3", "r4"].map((id) => movie(id)),
    friends: ["f1", "f2", "f3", "f4"].map((id) => movie(id)),
  }
}

function countBySource(picks) {
  const counts = { watchlist: 0, recommended: 0, friends: 0 }
  for (const p of picks) counts[p.source]++
  return counts
}

test("drawHeroPicks: with all three pools non-empty, draws 5 picks with every pool present and none over 2 (HM01)", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const picks = hero.drawHeroPicks(fullPools(), seeded(seed), hasBackdrop)
    assert.equal(picks.length, 5)
    const counts = countBySource(picks)
    for (const source of ["watchlist", "recommended", "friends"]) {
      assert.ok(counts[source] >= 1, `seed ${seed}: ${source} missing`)
      assert.ok(counts[source] <= 2, `seed ${seed}: ${source} over 2`)
    }
  }
})

test("drawHeroPicks: skips titles without a backdrop (HM01)", () => {
  const pools = {
    watchlist: [movie("w1", { backdropUrl: null }), movie("w2", { backdropUrl: null }), movie("w3")],
    recommended: [movie("r1")],
    friends: [],
  }
  for (let seed = 1; seed <= 20; seed++) {
    const ids = hero.drawHeroPicks(pools, seeded(seed), hasBackdrop).map((p) => p.movie.id).sort()
    assert.deepEqual(ids, ["r1", "w3"])
  }
})

test("drawHeroPicks: a title in two pools appears only once", () => {
  const shared = movie("x1")
  const pools = { watchlist: [shared], recommended: [shared], friends: [shared] }
  const picks = hero.drawHeroPicks(pools, seeded(7), hasBackdrop)
  assert.equal(picks.length, 1)
  assert.equal(picks[0].movie.id, "x1")
})

test("drawHeroPicks: short pools leave slots for the fallback instead of exceeding 2 per pool", () => {
  const pools = { watchlist: ["w1", "w2", "w3", "w4"].map((id) => movie(id)), recommended: [], friends: [] }
  const picks = hero.drawHeroPicks(pools, seeded(3), hasBackdrop)
  assert.equal(picks.length, 2)
  assert.ok(picks.every((p) => p.source === "watchlist"))
})

test("drawHeroPicks: empty pools draw nothing", () => {
  assert.deepEqual(hero.drawHeroPicks({ watchlist: [], recommended: [], friends: [] }, seeded(1), hasBackdrop), [])
})

function fallbackCandidates() {
  return {
    movie: movie("m1"),
    tvSeries: movie("t1", { mediaType: "TV" }),
    currentAnime: movie("a1", { mediaType: "ANIME" }),
    upcomingMovie: movie("u1"),
  }
}

test("buildHomeHeroSlides: a user with no picks sees today's default lineup unchanged (HM02)", () => {
  const slides = hero.buildHomeHeroSlides([], fallbackCandidates(), {})
  assert.deepEqual(
    slides.map((s) => [s.title, s.badge]),
    [
      ["Title m1", "#1 in Movies"],
      ["Title t1", "#1 in TV Series"],
      ["Title a1", "#1 in Anime"],
      ["Title u1", "#1 Anticipated"],
    ],
  )
})

test("buildHomeHeroSlides: personal slides lead with their pool's source label, then the default lineup fills to 5 (HM04)", () => {
  const picks = [
    { source: "friends", movie: movie("f1") },
    { source: "watchlist", movie: movie("w1") },
    { source: "recommended", movie: movie("r1") },
  ]
  const slides = hero.buildHomeHeroSlides(picks, fallbackCandidates(), {})
  assert.deepEqual(
    slides.map((s) => [s.title, s.badge, s.categoryPillar]),
    [
      ["Title f1", "Friends' pick", "friends"],
      ["Title w1", "On your watchlist", "watchlist"],
      ["Title r1", "Recommended for you", "recommended"],
      ["Title m1", "#1 in Movies", "movies"],
      ["Title t1", "#1 in TV Series", "tv"],
    ],
  )
})

test("buildHomeHeroSlides: a default slide repeating a personal pick is not shown twice", () => {
  const picks = [{ source: "watchlist", movie: movie("m1") }]
  const slides = hero.buildHomeHeroSlides(picks, fallbackCandidates(), {})
  assert.deepEqual(
    slides.map((s) => s.title),
    ["Title m1", "Title t1", "Title a1", "Title u1"],
  )
  assert.equal(slides[0].badge, "On your watchlist")
})

test("buildHomeHeroSlides: personal slides use lazily fetched details", () => {
  const picks = [{ source: "watchlist", movie: movie("w1", { backdropUrl: null }) }]
  const slides = hero.buildHomeHeroSlides(picks, {}, {
    w1: { backdropUrl: "https://img/w1-details.jpg", logoUrl: "https://img/w1-logo.png", genres: ["Drama"] },
  })
  assert.equal(slides[0].backdropUrl, "https://img/w1-details.jpg")
  assert.equal(slides[0].logoUrl, "https://img/w1-logo.png")
  assert.deepEqual(slides[0].genres, ["Drama"])
})

test("markFriendsWatchlistPicks: titles only on friends' watchlists get their own label (glossary: Friend suggestion)", () => {
  const picks = hero.markFriendsWatchlistPicks(
    [
      { source: "friends", movie: movie("f1") },
      { source: "friends", movie: movie("f2") },
      { source: "watchlist", movie: movie("f3") },
    ],
    new Set(["f2", "f3"]),
  )
  const slides = hero.buildHomeHeroSlides(picks, {}, {})
  assert.deepEqual(
    slides.map((s) => [s.title, s.badge]),
    [
      ["Title f1", "Friends' pick"],
      ["Title f2", "On a friend's watchlist"],
      ["Title f3", "On your watchlist"],
    ],
  )
})

test("buildHomeHeroSlides: the default #1 For You slide is dropped once 2 recommended picks are shown (max 2 per pool)", () => {
  const picks = [
    { source: "recommended", movie: movie("r1") },
    { source: "recommended", movie: movie("r2") },
  ]
  // Only the For You pillar is available, so it would otherwise fill slot 3.
  const slides = hero.buildHomeHeroSlides(picks, { personalRecommendation: movie("r3") }, {})
  assert.deepEqual(slides.map((s) => s.title), ["Title r1", "Title r2"])

  const one = hero.buildHomeHeroSlides(picks.slice(0, 1), { personalRecommendation: movie("r3") }, {})
  assert.deepEqual(one.map((s) => [s.title, s.badge]), [
    ["Title r1", "Recommended for you"],
    ["Title r3", "#1 For You"],
  ])
})
