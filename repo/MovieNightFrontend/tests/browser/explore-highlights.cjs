// Browser verification for #26 (PD-10): Explore spotlight hero and "Top 10 today" row.
// Fixtures: every /api/* call is answered by page.route mocks below, so this
// checks layout and UI states only, not real API persistence (see
// ExploreHighlightsPersistenceTest for the backend contract).
//
//   MOVIENIGHT_BROWSER_URL         Vite origin (default http://127.0.0.1:8443)
//   MOVIENIGHT_PLAYWRIGHT_MODULE   Playwright module path when not resolvable
//   MOVIENIGHT_CHROME_PATH         Chrome executable
//   MOVIENIGHT_SCREENSHOT_DIR      optional; writes one screenshot per scenario

const assert = require("node:assert/strict")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) {
    return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium
  }
  try {
    return require("playwright").chromium
  } catch {
    const npxDir = path.join(os.homedir(), ".npm", "_npx")
    if (fs.existsSync(npxDir)) {
      for (const entry of fs.readdirSync(npxDir)) {
        const candidate = path.join(npxDir, entry, "node_modules", "playwright")
        if (fs.existsSync(candidate)) return require(candidate).chromium
      }
    }
    throw new Error("Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.")
  }
}

const chromium = loadChromium()
const app = process.env.MOVIENIGHT_BROWSER_URL || "http://127.0.0.1:8443"
const shotDir = process.env.MOVIENIGHT_SCREENSHOT_DIR

const IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

const MEDIA = { movies: "MOVIE", tv: "TV", anime: "ANIME" }

const title = (type, tmdbId, name) => ({
  tmdbId,
  title: name,
  posterUrl: IMAGE,
  backdropUrl: IMAGE,
  releaseYear: 2026,
  voteAverage: 7.9,
  voteCount: 900,
  mediaType: MEDIA[type],
  genres: ["Drama", "Mystery"],
})

const highlights = (type, { spotlight = "READY", topTen = "READY" } = {}) => ({
  categories: [
    {
      id: "spotlight",
      title: "Trending this week",
      state: spotlight,
      updatedAt: new Date().toISOString(),
      movies:
        spotlight === "UNAVAILABLE"
          ? []
          : Array.from({ length: 5 }, (_, i) => title(type, 100 + i, `Weekly Hit ${i + 1}`)),
    },
    {
      id: "top-10",
      title: "Top 10 today",
      state: topTen,
      updatedAt: new Date().toISOString(),
      movies:
        topTen === "UNAVAILABLE"
          ? []
          : Array.from({ length: 10 }, (_, i) => title(type, 200 + i, `Daily Chart ${i + 1}`)),
    },
  ],
})

const shelves = (type) => ({
  categories: ["newest", "popular", "top-rated"].map((id, s) => ({
    id,
    title: ["Newest Releases", "Popular & well rated", "Top Rated"][s],
    state: "READY",
    updatedAt: new Date().toISOString(),
    hasMore: true,
    movies: Array.from({ length: 8 }, (_, i) => {
      const { genres, backdropUrl, ...plain } = title(type, 1000 + s * 100 + i, `Shelf ${id} ${i + 1}`)
      return plain
    }),
  })),
})

// Daily Chart 3 (tmdb 202) is in the user's library.
const library = (type) => [
  {
    id: 1,
    catalogMovieId: 9202,
    status: "WATCHLIST",
    personalRating: null,
    notes: "",
    // The library API sends genres as one comma-separated string.
    movie: { ...title(type, 202, "Daily Chart 3"), id: 9202, genres: "Drama, Mystery" },
  },
]

/**
 * `answers` is a list of highlight responses served in turn; a number is an
 * HTTP error status. The last answer repeats.
 */
async function mockApi(page, type, answers) {
  let highlightCalls = 0
  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/"),
    (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === "/api/users/me") {
        return route.fulfill({
          json: { id: 1, username: "charts", displayName: "Chart Tester", role: "USER" },
        })
      }
      if (pathname === "/api/movies/library") return route.fulfill({ json: library(type) })
      if (pathname === `/api/movies/explore/${type}/highlights`) {
        const answer = answers[Math.min(highlightCalls++, answers.length - 1)]
        if (typeof answer === "number") return route.fulfill({ status: answer, json: { message: "Provider down" } })
        return route.fulfill({ json: answer })
      }
      if (pathname === `/api/movies/explore/${type}`) return route.fulfill({ json: shelves(type) })
      return route.fulfill({ json: [] })
    },
  )
  return { calls: () => highlightCalls }
}

async function openExplore(browser, { width, height = 900, type, answers, ready }) {
  const context = await browser.newContext({ viewport: { width, height } })
  await context.addInitScript(() => {
    localStorage.setItem("movienight_token", "fixture-token-charts")
    localStorage.setItem(
      "movienight_current_user",
      JSON.stringify({ id: "1", username: "charts", displayName: "Chart Tester" }),
    )
  })
  const page = await context.newPage()
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message))
  const api = await mockApi(page, type, answers)
  await page.goto(`${app}/explore/${type}`)
  await page.locator(ready).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(400)
  return { page, context, api }
}

async function shoot(page, name) {
  if (!shotDir) return
  fs.mkdirSync(shotDir, { recursive: true })
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false })
}

const SPOTLIGHT = (label) => `section[aria-label="Trending ${label} spotlight"]`
const TOP_TEN = 'section[aria-label="Top 10 today"]'

async function eh01Desktop(browser) {
  const { page, context } = await openExplore(browser, {
    width: 1440,
    type: "movies",
    answers: [highlights("movies")],
    ready: TOP_TEN + " [data-ranked-item]",
  })
  const hero = page.locator(SPOTLIGHT("Movies"))
  assert.equal(await hero.count(), 1, "EH01: spotlight hero is shown")
  assert.equal(await hero.locator('[aria-roledescription="slide"]').count(), 5, "EH01: 5 slides")
  assert.equal(await hero.locator("p", { hasText: /^Movies$/ }).count(), 5, "category label inside the hero")
  const heroBox = await hero.boundingBox()
  assert.ok(heroBox.height >= 0.5 * 900 && heroBox.height <= 0.6 * 900, `hero ~55vh, got ${heroBox.height}`)
  assert.equal(await page.getByText("Explore acclaimed films").count(), 0, "old subtitle block removed")
  const h1s = await page.locator("h1").allTextContents()
  assert.deepEqual(h1s, ["Movies"], "the category stays the only page heading")
  assert.equal(await page.title(), "Movies · Movie Night", "tab title names the category, not a slide")

  const items = page.locator(TOP_TEN + " [data-ranked-item]")
  assert.equal(await items.count(), 10, "EH01: 10 numbered posters")
  const numerals = await items.locator(".shelf-rank").allTextContents()
  assert.deepEqual(numerals, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"])
  const labels = await items.locator("a[data-shelf-item]").evaluateAll((a) => a.map((el) => el.getAttribute("aria-label")))
  assert.equal(labels[0], "1. Daily Chart 1")
  assert.equal(labels[2], "3. Daily Chart 3 (in your library)", "library title keeps its rank")
  assert.equal(await page.locator(TOP_TEN + " [data-in-library]").count(), 1, "one In library marker")

  // Order: hero, then the Top 10 row, then the shelves.
  const topTenBox = await page.locator(TOP_TEN).boundingBox()
  const firstShelf = await page.getByRole("heading", { name: "Newest Releases" }).boundingBox()
  assert.ok(topTenBox.y >= heroBox.y + heroBox.height - 1, "Top 10 directly below the hero")
  assert.ok(firstShelf.y > topTenBox.y + topTenBox.height - 1, "shelves follow the Top 10 row")
  await shoot(page, "eh01-movies-1440")
  await context.close()
  console.log("✔ EH01 desktop: spotlight (5 slides, ~55vh) then Top 10 (1-10, In library) then shelves")
}

async function eh02Anime(browser) {
  const { page, context } = await openExplore(browser, {
    width: 1280,
    type: "anime",
    answers: [highlights("anime")],
    ready: TOP_TEN + " [data-ranked-item]",
  })
  const hero = page.locator(SPOTLIGHT("Anime"))
  const badges = await hero.locator(".rounded-md.bg-white\\/15").allTextContents()
  assert.ok(badges.length === 5 && badges.every((b) => b.trim() === "Anime"), "EH02: anime media badge on every slide")
  const hrefs = await page.locator(TOP_TEN + " a[data-shelf-item]").evaluateAll((a) => a.map((el) => el.getAttribute("href")))
  assert.equal(hrefs.length, 10)
  assert.ok(hrefs.every((h) => /^\/movies\/tv:\d+\?type=ANIME$/.test(h)), `EH02: anime TV links, got ${hrefs[0]}`)
  await context.close()
  console.log("✔ EH02 anime: hero and Top 10 present anime TV titles")
}

async function eh03Phone(browser) {
  const { page, context } = await openExplore(browser, {
    width: 360,
    height: 760,
    type: "tv",
    answers: [highlights("tv")],
    ready: TOP_TEN + " [data-ranked-item]",
  })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 0, `EH03: no horizontal page overflow at 360px (overflow ${overflow}px)`)

  const metrics = await page.locator(TOP_TEN + " [data-ranked-item]").evaluateAll((items) =>
    items.map((item) => {
      const numeral = item.querySelector(".shelf-rank")
      const poster = item.querySelector("a[data-shelf-item]")
      const n = numeral.getBoundingClientRect()
      const p = poster.getBoundingClientRect()
      const style = getComputedStyle(numeral)
      return {
        text: numeral.textContent,
        fontSize: parseFloat(style.fontSize),
        stroke: parseFloat(style.webkitTextStrokeWidth),
        numeralHeight: n.height,
        uncoveredShare: (p.left - n.left) / n.width,
        posterHeight: p.height,
      }
    }),
  )
  for (const m of metrics) {
    assert.ok(m.fontSize >= 96, `EH03: numeral ${m.text} font ≥ 96px (got ${m.fontSize})`)
    assert.ok(m.stroke >= 2, `EH03: numeral ${m.text} outline ≥ 2px`)
    assert.ok(m.uncoveredShare >= 0.8, `EH03: numeral ${m.text} mostly beside its poster (${m.uncoveredShare.toFixed(2)})`)
    assert.ok(m.numeralHeight <= m.posterHeight, `numeral ${m.text} fits the poster height`)
  }
  // The active slide's actions stay clear of the slide controls.
  const hero = page.locator(SPOTLIGHT("TV Series"))
  const active = hero.locator('[aria-roledescription="slide"][aria-hidden="false"]')
  const actions = await active.getByRole("link", { name: "More info" }).boundingBox()
  const watchlist = await active.getByRole("button", { name: /watchlist/ }).boundingBox()
  const controls = await hero.getByRole("button", { name: "Pause spotlight" }).locator("..").boundingBox()
  for (const box of [actions, watchlist]) {
    assert.ok(box.y + box.height <= controls.y, `EH03: hero actions above the slide controls (${box.y + box.height} > ${controls.y})`)
  }
  await shoot(page, "eh03-tv-360")
  await page.locator(TOP_TEN).scrollIntoViewIfNeeded()
  await shoot(page, "eh03-tv-360-top10")
  await context.close()
  console.log("✔ EH03 phone 360px: no overflow; numerals ≥ 96px, outlined, ≥ 80% beside their posters")
}

async function eh04Failure(browser) {
  // TMDB is down: the server answers with both charts UNAVAILABLE. Retry succeeds.
  const { page, context, api } = await openExplore(browser, {
    width: 1280,
    type: "movies",
    answers: [highlights("movies", { spotlight: "UNAVAILABLE", topTen: "UNAVAILABLE" }), highlights("movies")],
    ready: "text=Trending titles are unavailable right now.",
  })
  assert.equal(await page.locator(SPOTLIGHT("Movies")).count(), 0, "EH04: hero hidden")
  assert.equal(await page.locator(TOP_TEN).count(), 0, "EH04: Top 10 hidden")
  assert.equal(await page.getByRole("heading", { name: "Movies", level: 1 }).count(), 1, "category heading kept")
  assert.ok(await page.getByRole("heading", { name: "Newest Releases" }).isVisible(), "EH04: shelves still load")
  const before = api.calls()
  await page.getByRole("button", { name: "Retry trending Movies" }).click()
  await page.locator(TOP_TEN + " [data-ranked-item]").first().waitFor({ timeout: 15000 })
  assert.ok(api.calls() > before, "Retry asks the server again")
  assert.equal(await page.locator(SPOTLIGHT("Movies")).count(), 1, "hero back after retry")
  await context.close()

  // The highlights request itself fails (server error): same notice, shelves unaffected.
  const failed = await openExplore(browser, {
    width: 1280,
    type: "movies",
    answers: [500],
    ready: "text=Trending titles are unavailable right now.",
  })
  assert.ok(await failed.page.getByRole("heading", { name: "Newest Releases" }).isVisible())
  assert.ok(await failed.page.getByRole("button", { name: "Retry trending Movies" }).isVisible())
  await failed.context.close()

  // Only today's chart is unavailable: the hero stays, the row offers a retry.
  const partial = await openExplore(browser, {
    width: 1280,
    type: "movies",
    answers: [highlights("movies", { topTen: "UNAVAILABLE" })],
    ready: "text=Today's chart is unavailable right now.",
  })
  assert.equal(await partial.page.locator(SPOTLIGHT("Movies")).count(), 1, "hero kept")
  assert.equal(await partial.page.locator(TOP_TEN + " [data-ranked-item]").count(), 0)
  assert.ok(await partial.page.getByRole("button", { name: "Retry Top 10 today" }).isVisible())
  assert.ok(await partial.page.getByRole("heading", { name: "Newest Releases" }).isVisible())
  await shoot(partial.page, "eh04-top10-unavailable")
  await partial.context.close()
  console.log("✔ EH04: failure hides the section with a retry; shelves unaffected; retry recovers")
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.MOVIENIGHT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  })
  try {
    await eh01Desktop(browser)
    await eh02Anime(browser)
    await eh03Phone(browser)
    await eh04Failure(browser)
    console.log("explore-highlights: all checks passed")
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
