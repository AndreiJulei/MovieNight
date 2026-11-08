// Browser verification for Ticket 1 (Hero banner refinements: HB01-HB04).
// Runs against Vite preview/dev server at MOVIENIGHT_BROWSER_URL with Playwright.
const assert = require("node:assert/strict")

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE)
    return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium
  try {
    return require("playwright").chromium
  } catch {
    return require("/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright")
      .chromium
  }
}

const chromium = loadChromium()
const app = process.env.MOVIENIGHT_BROWSER_URL || "http://127.0.0.1:8443"

async function main() {
  console.log("Launching browser for Ticket 1 Hero Banner verification...")
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.MOVIENIGHT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })

    await context.addInitScript(() => {
      localStorage.setItem("movienight_token", "fixture-token-hero")
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({
          id: "1",
          username: "herotester",
          displayName: "Hero Tester",
        }),
      )
    })

    const page = await context.newPage()
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err))

    // Route mocks
    await page.route(
      (url) => new URL(url).pathname === "/api/users/me",
      (route) => {
        return route.fulfill({
          json: {
            id: 1,
            username: "herotester",
            displayName: "Hero Tester",
            role: "USER",
          },
        })
      },
    )

    await page.route(
      (url) => new URL(url).pathname.startsWith("/api/movies/library"),
      (route) => {
        if (route.request().method() === "POST") {
          return route.fulfill({
            status: 201,
            json: {
              id: 1,
              status: "WATCHLIST",
              movie: {
                id: 693134,
                tmdbId: 693134,
                title: "Dune: Part Two",
                mediaType: "MOVIE",
              },
            },
          })
        }
        if (route.request().method() === "DELETE") {
          return route.fulfill({ status: 200, json: { ok: true } })
        }
        return route.fulfill({ json: [] })
      },
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/suggestions/friends",
      (route) => {
        return route.fulfill({
          json: {
            categories: [
              { id: "friends", title: "Rated by friends", movies: [] },
              {
                id: "friends-watchlist",
                title: "On friends watchlists",
                movies: [],
              },
            ],
          },
        })
      },
    )

    // Feed 1: Movies explore (HB01: Newest Releases with floor 6.5, fallback to Top Rated)
    await page.route(
      (url) => new URL(url).pathname === "/api/movies/explore/movies",
      (route) => {
        return route.fulfill({
          json: {
            categories: [
              {
                id: "newest",
                title: "Newest Releases",
                movies: [
                  {
                    tmdbId: 111111,
                    title: "Below Floor Release",
                    mediaType: "MOVIE",
                    releaseYear: 2024,
                    voteAverage: 5.9,
                    voteCount: 200,
                  },
                  {
                    tmdbId: 693134,
                    title: "Dune: Part Two",
                    mediaType: "MOVIE",
                    releaseYear: 2024,
                    voteAverage: 8.4,
                    voteCount: 4500,
                    posterUrl:
                      "https://image.tmdb.org/t/p/w500/dune_poster.jpg",
                    backdropUrl:
                      "https://image.tmdb.org/t/p/w1280/dune_backdrop.jpg",
                    overview:
                      "Paul Atreides unites with Chani and the Fremen while seeking revenge.",
                    genres: "Sci-Fi, Adventure",
                  },
                ],
              },
              {
                id: "top-rated",
                title: "Top Rated",
                movies: [
                  {
                    tmdbId: 278,
                    title: "The Shawshank Redemption",
                    mediaType: "MOVIE",
                    releaseYear: 1994,
                    voteAverage: 9.3,
                  },
                ],
              },
              {
                id: "upcoming",
                title: "Upcoming Movies",
                movies: [
                  {
                    tmdbId: 999999,
                    title: "Mickey 17",
                    mediaType: "MOVIE",
                    releaseYear: 2025,
                    posterUrl:
                      "https://image.tmdb.org/t/p/w500/mickey_poster.jpg",
                  },
                ],
              },
            ],
          },
        })
      },
    )

    // Feed 2: TV explore (HB02: Bayesian Top Rated feed, rejects raw airing and low-vote items)
    await page.route(
      (url) => new URL(url).pathname === "/api/movies/explore/tv",
      (route) => {
        return route.fulfill({
          json: {
            categories: [
              {
                id: "airing",
                title: "Currently Airing",
                movies: [
                  {
                    tmdbId: 888888,
                    title: "Raw Airing Show",
                    mediaType: "TV",
                    releaseYear: 2024,
                    voteAverage: 7.2,
                    voteCount: 150,
                  },
                ],
              },
              {
                id: "top-rated",
                title: "Top Rated",
                movies: [
                  {
                    tmdbId: 126308,
                    title: "Shogun",
                    mediaType: "TV",
                    releaseYear: 2024,
                    voteAverage: 8.8,
                    voteCount: 1200,
                    posterUrl:
                      "https://image.tmdb.org/t/p/w500/shogun_poster.jpg",
                    backdropUrl:
                      "https://image.tmdb.org/t/p/w1280/shogun_backdrop.jpg",
                    overview:
                      "When a mysterious European ship is found marooned in a nearby fishing village...",
                    genres: "Drama, War",
                  },
                ],
              },
            ],
          },
        })
      },
    )

    // Feed 3: Anime explore
    await page.route(
      (url) => new URL(url).pathname === "/api/movies/explore/anime",
      (route) => {
        return route.fulfill({
          json: {
            categories: [
              {
                id: "current-season",
                title: "Current Season Hits",
                movies: [
                  {
                    tmdbId: 209867,
                    title: "Frieren: Beyond Journey’s End",
                    mediaType: "ANIME",
                    releaseYear: 2024,
                    voteAverage: 9.1,
                    voteCount: 850,
                    posterUrl:
                      "https://image.tmdb.org/t/p/w500/frieren_poster.jpg",
                    backdropUrl:
                      "https://image.tmdb.org/t/p/w1280/frieren_backdrop.jpg",
                    genres: "Animation, Fantasy, Adventure",
                  },
                ],
              },
            ],
          },
        })
      },
    )

    // Feed 4: Personal recommendations
    await page.route(
      (url) => new URL(url).pathname === "/api/suggestions/personal",
      (route) => {
        return route.fulfill({
          json: {
            categories: [
              {
                id: "movies",
                title: "Personalized Recommendations",
                state: "READY",
                limitations: [],
                movies: [
                  {
                    tmdbId: 335984,
                    title: "Blade Runner 2049",
                    mediaType: "MOVIE",
                    releaseYear: 2017,
                    score: 9.8,
                    voteAverage: 8.0,
                    posterUrl:
                      "https://image.tmdb.org/t/p/w500/bladerunner_poster.jpg",
                    backdropUrl:
                      "https://image.tmdb.org/t/p/w1280/bladerunner_backdrop.jpg",
                    genres: "Sci-Fi, Mystery",
                  },
                ],
              },
            ],
          },
        })
      },
    )

    // TMDB details route
    await page.route(
      (url) => /\/api\/movies\/tmdb\/\d+$/.test(new URL(url).pathname),
      (route) => {
        const id = Number(
          new URL(route.request().url()).pathname.split("/").at(-1),
        )
        const type =
          new URL(route.request().url()).searchParams.get("mediaType") ||
          "MOVIE"
        const genres =
          id === 693134
            ? "Sci-Fi, Adventure"
            : id === 126308
              ? "Drama, War"
              : "Animation, Fantasy"
        return route.fulfill({
          json: {
            id,
            tmdbId: id,
            title: `Title ${id}`,
            mediaType: type,
            releaseYear: 2024,
            backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
            genres,
          },
        })
      },
    )

    // Navigate to Home Page
    console.log("Navigating to home page...")
    const res = await page.goto(app, { waitUntil: "domcontentloaded" })
    assert.equal(res?.status(), 200, "Home page returns 200")

    const heroRegion = page.getByRole("region", {
      name: /curated spotlight hero banner/i,
    })
    await heroRegion.waitFor({ timeout: 10000 })
    console.log("✔ Hero banner region rendered")

    // ─────────────────────────────────────────────────────────────
    // HB01 — Newest movie candidate:
    // Sourced from newest with floor voteAverage >= 6.5 (Dune: Part Two)
    // ─────────────────────────────────────────────────────────────
    const movieBadge = heroRegion.locator("text=#1 in Movies")
    await movieBadge.waitFor({ timeout: 5000 })
    assert(await movieBadge.isVisible(), "HB01: #1 in Movies badge is visible")
    assert(
      await heroRegion.locator('h1:has-text("Dune: Part Two")').isVisible(),
      "HB01: Dune: Part Two title visible",
    )
    assert.equal(
      await heroRegion.locator('h1:has-text("Below Floor Release")').count(),
      0,
      "HB01: Below-floor release is rejected in favor of >= 6.5 candidate",
    )
    assert(
      await heroRegion.locator("text=★ 8.4").isVisible(),
      "HB01: Star rating visible",
    )
    assert(
      await heroRegion.locator("text=2024").first().isVisible(),
      "HB01: Year visible",
    )
    assert(
      await heroRegion.locator("text=Movie").first().isVisible(),
      "HB01: Media badge visible",
    )

    // ─────────────────────────────────────────────────────────────
    // HB03 — Streamlined hero overlay:
    // Rank badge uses bg-accent (not bg-red-600), synopsis is omitted,
    // title typography is capped at text-3xl, buttons scaled down
    // ─────────────────────────────────────────────────────────────
    const badgeEl = heroRegion
      .locator("span:has-text('#1 in Movies')")
      .locator("..")
    const badgeClasses = await badgeEl.getAttribute("class")
    assert(
      badgeClasses && badgeClasses.includes("bg-accent"),
      "HB03: Rank badge uses bg-accent token",
    )
    assert(
      !badgeClasses.includes("bg-red-600"),
      "HB03: Rank badge does not use bg-red-600",
    )
    assert(
      badgeClasses && badgeClasses.includes("rounded-md"),
      "HB03: Rank badge uses rounded-md per DESIGN.md",
    )
    assert(
      !badgeClasses.includes("rounded-full"),
      "HB03: Rank badge does not use rounded-full",
    )

    // Synopsis paragraph is omitted
    const synopsisPara = heroRegion.locator("p:has-text('Paul Atreides')")
    assert.equal(
      await synopsisPara.count(),
      0,
      "HB03: Active hero slide renders no synopsis text block",
    )

    // Title scale is capped at text-3xl per DESIGN.md (no lg:text-4xl)
    const titleEl = heroRegion.locator('h1:has-text("Dune: Part Two")')
    const titleClasses = await titleEl.getAttribute("class")
    assert(
      titleClasses && !titleClasses.includes("text-4xl"),
      "HB03: Main title typography does not exceed text-3xl",
    )

    // Action buttons scaled down while satisfying minimum 44x44px touch targets (PH07)
    const watchlistBtn = heroRegion
      .getByRole("button", { name: /add dune: part two to watchlist/i })
      .first()
    assert(await watchlistBtn.isVisible(), "HB03: Watchlist add button visible")
    const btnBox = await watchlistBtn.boundingBox()
    assert(
      btnBox && btnBox.width >= 44 && btnBox.height >= 44,
      "HB03/PH07: Watchlist button satisfies >= 44x44px touch target floor",
    )

    // ─────────────────────────────────────────────────────────────
    // PH05 — Home page vertical layout hierarchy:
    // Layout renders: (1) Hero Banner at the top, followed by
    // (2) Recommendations section in the middle, and
    // (3) Editorial narrative at the bottom (heroBox.y < recBox.y < narBox.y).
    // ─────────────────────────────────────────────────────────────
    const heroBox = await heroRegion.boundingBox()
    const recSection = page.locator('#recommendations')
    const recBox = await recSection.boundingBox()
    const narSection = page.locator('section:has-text("A single, deliberate space for everything you watch")')
    const narBox = await narSection.boundingBox()

    assert(heroBox && recBox && narBox, "PH05: All three home page sections are present")
    assert(
      heroBox.y < recBox.y,
      `PH05: Hero banner (y=${heroBox.y}) is above Recommendations (y=${recBox.y})`,
    )
    assert(
      recBox.y < narBox.y,
      `PH05: Recommendations (y=${recBox.y}) is above Editorial Narrative (y=${narBox.y})`,
    )
    console.log("✔ PH05: Vertical section hierarchy verified (Hero < Recommendations < Narrative)")

    // ─────────────────────────────────────────────────────────────
    // HB04 — Toast auto-dismiss:
    // Watchlist save confirmation toast automatically disappears after 3 seconds.
    // Hover over hero banner pauses auto-advance so assertions aren't interrupted by slide cycling.
    // ─────────────────────────────────────────────────────────────
    await heroRegion.hover()
    await watchlistBtn.click()
    const toast = page.locator(
      'div[role="status"]:has-text("saved to Watchlist")',
    )
    await toast.waitFor({ timeout: 4000 })
    const appearTime = Date.now()
    assert(
      await toast.isVisible(),
      "HB04: Watchlist save toast is visible after adding to watchlist",
    )

    // Check at +2500ms after appearance: toast MUST still be visible
    const elapsed1 = Date.now() - appearTime
    if (elapsed1 < 2500) {
      await page.waitForTimeout(2500 - elapsed1)
    }
    assert(
      await toast.isVisible(),
      "HB04: Toast is still visible at 2500ms after appearance",
    )

    // Check at +3300ms after appearance (3000ms duration + 200ms exit transition):
    // Toast MUST be gone / dismissed. If it had 3400ms or 3500ms duration, it would still be present.
    const elapsed2 = Date.now() - appearTime
    if (elapsed2 < 3300) {
      await page.waitForTimeout(3300 - elapsed2)
    }
    assert(
      !(await toast.isVisible()),
      "HB04: Toast automatically disappears by 3300ms after appearance (proves 3000ms duration, rejects 3400ms/3500ms default)",
    )
    console.log("✔ HB04: Watchlist toast auto-dismiss timing verified tightly")

    // Verify reversible watchlist toggle: clicking '✓' removes title from watchlist
    const removeBtn = heroRegion
      .getByRole("button", { name: /remove dune: part two from watchlist/i })
      .first()
    assert(
      await removeBtn.isVisible(),
      "HB04: Watchlist button transitioned to active removal toggle",
    )
    await removeBtn.click()
    const removeToast = page.locator(
      'div[role="status"]:has-text("removed from Watchlist")',
    )
    await removeToast.waitFor({ timeout: 4000 })
    assert(
      await removeToast.isVisible(),
      "HB04: Watchlist removal toast visible",
    )
    const addAgainBtn = heroRegion
      .getByRole("button", { name: /add dune: part two to watchlist/i })
      .first()
    await addAgainBtn.waitFor({ timeout: 4000 })
    assert(
      await addAgainBtn.isVisible(),
      "HB04: Button reverts to Add to Watchlist after removal",
    )
    console.log("✔ HB04: Reversible watchlist toggle verified")

    // ─────────────────────────────────────────────────────────────
    // HB02 — TV confidence ranking:
    // #1 in TV Series uses Bayesian confidence-ranked top-rated feed,
    // rejecting raw airing
    // ─────────────────────────────────────────────────────────────
    const slide2Indicator = heroRegion.getByRole("button", {
      name: /go to slide 2/i,
    })
    await slide2Indicator.click()

    const tvBadge = heroRegion.locator("text=#1 in TV Series")
    await tvBadge.waitFor({ timeout: 5000 })
    assert(await tvBadge.isVisible(), "HB02: Jumped to #1 in TV Series")
    assert(
      await heroRegion.locator('h1:has-text("Shogun")').isVisible(),
      "HB02: Shogun from Bayesian top-rated feed visible",
    )
    assert.equal(
      await heroRegion.locator('h1:has-text("Raw Airing Show")').count(),
      0,
      "HB02: Raw airing series is rejected in favor of Bayesian top-rated",
    )
    console.log("✔ HB02: Bayesian TV confidence candidate verified")

    console.log(
      "✔ All Ticket 1 Hero Banner checks (HB01-HB04) passed successfully!",
    )
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("FAILED:", err)
  process.exit(1)
})