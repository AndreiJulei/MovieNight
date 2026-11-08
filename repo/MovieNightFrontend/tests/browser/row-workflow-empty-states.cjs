// Browser verification for Ticket 3:
// Row workflow, shelf density, centered empty states, and unified reload button (RW01-RW05).
// Runs against Vite server at MOVIENIGHT_BROWSER_URL with Playwright.

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
      const entries = fs.readdirSync(npxDir)
      for (const entry of entries) {
        const candidate = path.join(npxDir, entry, "node_modules", "playwright")
        if (fs.existsSync(candidate)) {
          return require(candidate).chromium
        }
      }
    }
    throw new Error("Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.")
  }
}

const chromium = loadChromium()
const app = process.env.MOVIENIGHT_BROWSER_URL || "http://127.0.0.1:8443"

const sampleMovie = (
  id,
  title,
  tmdbRating = 8.0,
  imdb = null,
  tmdbId = null,
) => ({
  id,
  title,
  year: 2024,
  releaseYear: 2024,
  posterUrl: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
  posterSeed: null,
  imdb,
  imdbRating: imdb,
  tmdbRating,
  voteAverage: tmdbRating,
  voteCount: 500,
  tmdbVotes: 500,
  score: 9.5,
  reason: "Recommended based on your watched titles",
  mediaType: "MOVIE",
  tmdbId: tmdbId ?? parseInt(id.replace(/\D/g, "") || "1", 10),
})

const topRatedData = [
  sampleMovie("tr-1", "Top Masterpiece 1", 9.1, null, 101),
  sampleMovie("tr-2", "Top Masterpiece 2", 8.8, null, 102),
  sampleMovie("tr-3", "Top Masterpiece 3", 8.6, null, 103),
]

// Popular data includes:
// - A shared title that also exists in Top Rated ("Top Masterpiece 1" with tmdbId 101)
// - A title with voteAverage < 7.0 (6.2)
// - Valid well-rated titles (>= 7.0)
const popularData = [
  sampleMovie("pop-dup", "Top Masterpiece 1", 9.1, null, 101), // duplicate of tr-1
  sampleMovie("pop-low", "Low Quality Pop", 6.2, null, 202), // below 7.0 floor
  sampleMovie("pop-valid-1", "Popular Hit 1", 7.8, null, 203),
  sampleMovie("pop-valid-2", "Popular Hit 2", 8.2, null, 204),
]

const personalData = [
  sampleMovie("rec-1", "Personal Gem 1", 8.5, null, 301),
  sampleMovie("rec-2", "Personal Gem 2", 8.1, null, 302),
]

const friendData = [
  {
    tmdbId: 401,
    title: "Friend Consensus Movie",
    score: 18,
    imdbRating: 8.4,
    voteAverage: 8.2,
    reason: "Average 8.4/10 × 2 friends",
    mediaType: "MOVIE",
    releaseYear: 2024,
  },
]

async function setupMocks(page, options = {}) {
  const {
    caseMode = 1, // 1: empty recs, 2: personal only, 3: both personal & friends
  } = options

  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/"),
    async (route) => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === "/api/users/me") {
        return route.fulfill({
          json: {
            id: 1,
            username: "shelftester",
            displayName: "Shelf Tester",
            role: "USER",
          },
        })
      }
      if (pathname.startsWith("/api/movies/library")) {
        return route.fulfill({ json: [] })
      }
      if (pathname === "/api/friends") {
        return route.fulfill({ json: [] })
      }
      if (pathname.startsWith("/api/friends/invitations")) {
        return route.fulfill({ json: [] })
      }
      if (pathname.startsWith("/api/lists")) {
        return route.fulfill({ json: [] })
      }
      if (
        pathname === "/api/suggestions/personal" ||
        pathname === "/api/suggestions/for-you"
      ) {
        if (caseMode === 2 || caseMode === 3) {
          return route.fulfill({
            json: {
              categories: [
                {
                  id: "movies",
                  title: "Personal movie recommendations",
                  state: "READY",
                  limitations: [],
                  movies: personalData,
                },
              ],
            },
          })
        }
        return route.fulfill({
          json: {
            categories: [
              {
                id: "movies",
                title: "Personal movie recommendations",
                state: "NO_HISTORY",
                limitations: [],
                movies: [],
              },
            ],
          },
        })
      }
      if (pathname === "/api/suggestions/friends") {
        if (caseMode === 3) {
          return route.fulfill({
            json: {
              categories: [
                {
                  id: "friends",
                  title: "Rated by friends",
                  movies: friendData,
                },
                {
                  id: "friends-watchlist",
                  title: "On friends’ watchlists",
                  movies: [],
                },
              ],
            },
          })
        }
        return route.fulfill({
          json: {
            categories: [
              { id: "friends", title: "Rated by friends", movies: [] },
              {
                id: "friends-watchlist",
                title: "On friends’ watchlists",
                movies: [],
              },
            ],
          },
        })
      }
      if (
        pathname.startsWith("/api/movies/explore/movies") ||
        pathname === "/api/explore/movies"
      ) {
        return route.fulfill({
          json: {
            categories: [
              {
                id: "top-rated",
                title: "Top Rated",
                updatedAt: new Date().toISOString(),
                state: "READY",
                movies: topRatedData,
              },
              {
                id: "popular",
                title: "Popular",
                updatedAt: new Date().toISOString(),
                state: "READY",
                movies: popularData,
              },
              {
                id: "empty-criteria",
                title: "Special Archive",
                updatedAt: new Date().toISOString(),
                state: "EMPTY",
                terminalReason: "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY",
                movies: [],
              },
            ],
          },
        })
      }
      return route.fulfill({ json: [] })
    },
  )
}

async function main() {
  console.log("Launching browser for Ticket 3 verification...")
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.MOVIENIGHT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    })

    await context.addInitScript(() => {
      localStorage.setItem("movienight_token", "fixture-token-ticket3")
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({
          id: "1",
          username: "shelftester",
          displayName: "Shelf Tester",
        }),
      )
    })

    // ── 1. RW01 & RW02 & RW03: Case 1 on Home Page (No personal recs, no friend suggestions) ──
    {
      const page = await context.newPage()
      await setupMocks(page, { caseMode: 1 })
      await page.goto(app)

      // Verify #recommendations container exists and has RW03 density spacing
      const recContainer = page.locator("#recommendations")
      await recContainer.waitFor()
      const recClass = await recContainer.getAttribute("class")
      assert.ok(
        recClass.includes("space-y-10") && recClass.includes("sm:space-y-16"),
        `RW03: Recommendations container must have space-y-10 sm:space-y-16. Found: ${recClass}`,
      )
      console.log(
        "✔ RW03: Density spacing token verified on Home recommendations container",
      )

      // Verify Case 1 exact shelves: Top Rated, then Popular & Well-Rated
      await page.locator("section[aria-label='Top Rated']").waitFor()
      await page.locator("section[aria-label='Popular & Well-Rated']").waitFor()

      // Case 1 must NOT have Personal Recommendations or Friend suggestions shelves
      assert.equal(
        await page
          .locator("section[aria-label='Personal Recommendations']")
          .count(),
        0,
      )
      assert.equal(
        await page.locator("section[aria-label='Friend suggestions']").count(),
        0,
      )

      // Verify vertical shelf ordering: Top Rated < Popular & Well-Rated
      const topRatedBox = await page
        .locator("section[aria-label='Top Rated']")
        .boundingBox()
      const popularBox = await page
        .locator("section[aria-label='Popular & Well-Rated']")
        .boundingBox()
      assert.ok(
        topRatedBox.y < popularBox.y,
        "RW01: Case 1 Top Rated must precede Popular & Well-Rated",
      )
      console.log(
        "✔ RW01: Case 1 exact row ordering (Top Rated → Popular & Well-Rated) verified",
      )

      // Verify RW02: Deduplication and rating floor
      // "Top Masterpiece 1" is in Top Rated. It was also in popularData, but should be deduplicated out of Popular & Well-Rated!
      const popularSection = page.locator(
        "section[aria-label='Popular & Well-Rated']",
      )
      const popHit1 = popularSection.locator("a[title='Popular Hit 1']")
      await popHit1.waitFor()
      const popHit2 = popularSection.locator("a[title='Popular Hit 2']")
      await popHit2.waitFor()

      // Below 7.0 floor must be excluded
      const popLow = popularSection.locator("a[title='Low Quality Pop']")
      assert.equal(
        await popLow.count(),
        0,
        "RW02: Titles < 7.0 must be excluded",
      )

      // Top Masterpiece 1 must only appear in Top Rated section, NOT in Popular section
      const popDupInPop = popularSection.locator("a[title='Top Masterpiece 1']")
      assert.equal(
        await popDupInPop.count(),
        0,
        "RW02: Top Rated title must not appear in Popular & Well-Rated",
      )
      console.log(
        "✔ RW02: Deduplication and voteAverage >= 7.0 filtering verified",
      )

      // Verify RW05: Unified ghost reload button in Home section headers
      const topRatedReload = page.locator(
        "button[aria-label='Reload Top Rated list']",
      )
      await topRatedReload.waitFor()
      assert.ok((await topRatedReload.innerText()).includes("Reload list"))
      assert.ok((await topRatedReload.innerText()).includes("↺"))

      const popularReload = page.locator(
        "button[aria-label='Reload Popular & Well-Rated list']",
      )
      await popularReload.waitFor()
      assert.ok((await popularReload.innerText()).includes("Reload list"))
      assert.ok((await popularReload.innerText()).includes("↺"))
      console.log(
        "✔ RW05: Unified [↺ Reload list] ghost buttons verified on Home headers",
      )

      await page.close()
    }

    // ── 2. RW01: Case 2 on Home Page (Personal recommendations available, no friend suggestions) ──
    {
      const page = await context.newPage()
      await setupMocks(page, { caseMode: 2 })
      await page.goto(app)

      await page
        .locator("section[aria-label='Personal Recommendations']")
        .waitFor()
      await page.locator("section[aria-label='Top Rated']").waitFor()
      await page.locator("section[aria-label='Popular & Well-Rated']").waitFor()
      assert.equal(
        await page.locator("section[aria-label='Friend suggestions']").count(),
        0,
      )

      const personalBox = await page
        .locator("section[aria-label='Personal Recommendations']")
        .boundingBox()
      const topRatedBox = await page
        .locator("section[aria-label='Top Rated']")
        .boundingBox()
      const popularBox = await page
        .locator("section[aria-label='Popular & Well-Rated']")
        .boundingBox()

      assert.ok(
        personalBox.y < topRatedBox.y,
        "RW01: Case 2 Personal must precede Top Rated",
      )
      assert.ok(
        topRatedBox.y < popularBox.y,
        "RW01: Case 2 Top Rated must precede Popular",
      )
      console.log(
        "✔ RW01: Case 2 exact row ordering (Personal → Top Rated → Popular) verified",
      )

      await page.close()
    }

    // ── 3. RW01: Case 3 on Home Page (Both personal recommendations and friends suggestions) ──
    {
      const page = await context.newPage()
      await setupMocks(page, { caseMode: 3 })
      await page.goto(app)

      await page
        .locator("section[aria-label='Personal Recommendations']")
        .waitFor()
      await page.locator("section[aria-label='Friend suggestions']").waitFor()
      await page.locator("section[aria-label='Top Rated']").waitFor()
      assert.equal(
        await page
          .locator("section[aria-label='Popular & Well-Rated']")
          .count(),
        0,
      )

      const personalBox = await page
        .locator("section[aria-label='Personal Recommendations']")
        .boundingBox()
      const friendsBox = await page
        .locator("section[aria-label='Friend suggestions']")
        .boundingBox()
      const topRatedBox = await page
        .locator("section[aria-label='Top Rated']")
        .boundingBox()

      assert.ok(
        personalBox.y < friendsBox.y,
        "RW01: Case 3 Personal must precede Friends",
      )
      assert.ok(
        friendsBox.y < topRatedBox.y,
        "RW01: Case 3 Friends must precede Top Rated",
      )
      console.log(
        "✔ RW01: Case 3 exact row ordering (Personal → Friends → Top Rated) verified",
      )

      await page.close()
    }

    // ── 4. RW03 & RW05: Explore Page (/explore/movies) ──
    {
      const page = await context.newPage()
      await setupMocks(page, { caseMode: 1 })
      await page.goto(`${app}/explore/movies`)

      // Verify density spacing on Explore page
      const shelvesContainer = page.locator("div.space-y-10.sm\\:space-y-16")
      await shelvesContainer.waitFor()
      console.log("✔ RW03: Density spacing token verified on Explore page")

      // Verify unified reload buttons on Explore headers
      const exploreReloadBtns = page.locator("button[aria-label*='Reload']")
      const btnCount = await exploreReloadBtns.count()
      assert.ok(
        btnCount >= 2,
        `Explore should have reload buttons on each shelf. Found: ${btnCount}`,
      )
      for (let i = 0; i < btnCount; i++) {
        const text = await exploreReloadBtns.nth(i).innerText()
        assert.ok(text.includes("Reload list") && text.includes("↺"))
      }
      console.log(
        "✔ RW05: Unified [↺ Reload list] ghost buttons verified on Explore shelves",
      )

      // Verify empty shelf renders ShelfEmptyCard rather than legacy blank box (RW04)
      const emptyGenericCard = page.locator(
        "[data-testid='empty-state-generic']",
      )
      await emptyGenericCard.waitFor()
      const emptyGenericText = await emptyGenericCard.innerText()
      assert.ok(
        emptyGenericText.includes(
          "All candidate titles in this shelf are already in your library.",
        ),
        "RW04: Empty shelf message must display centered reason",
      )
      const exploreShelfCta = emptyGenericCard.locator("a", {
        hasText: "Explore Category",
      })
      await exploreShelfCta.waitFor()
      assert.equal(
        await exploreShelfCta.getAttribute("href"),
        "/explore/movies/empty-criteria",
      )
      console.log(
        "✔ RW04: Centered empty state card and CTA verified on Explore empty shelf",
      )

      await page.close()
    }

    // ── 5. RW04: Centered Empty State on Personal Recommendations Page (/suggestions/for-you) ──
    {
      const page = await context.newPage()
      await setupMocks(page, { caseMode: 1 }) // empty personal recs
      await page.goto(`${app}/suggestions/for-you`)

      const emptyCard = page.locator("[data-testid='empty-state-personal']")
      await emptyCard.waitFor()

      const boldMessage = emptyCard.locator("p")
      const msgText = await boldMessage.innerText()
      assert.equal(
        msgText,
        "No recommendations yet. Start by marking movies as watched to let MovieNight learn your taste.",
        "RW04: Exact personal empty state copy mismatch",
      )

      const ctaBtn = emptyCard.locator("a", { hasText: "Explore Movies" })
      await ctaBtn.waitFor()
      assert.equal(await ctaBtn.getAttribute("href"), "/explore/movies")

      // Click CTA and verify navigation
      await ctaBtn.click()
      await page.waitForURL("**/explore/movies")
      assert.ok(
        page.url().includes("/explore/movies"),
        "RW04: CTA must navigate to /explore/movies",
      )
      console.log(
        "✔ RW04: Centered Personal empty state and CTA navigation verified",
      )

      await page.close()
    }

    // ── 6. RW04: Centered Empty State on Friend Suggestions Page (/suggestions/friends) ──
    {
      const page = await context.newPage()
      await setupMocks(page, { caseMode: 1 }) // empty friends
      await page.goto(`${app}/suggestions/friends`)

      const emptyCard = page.locator("[data-testid='empty-state-friends']")
      await emptyCard.waitFor()

      const boldMessage = emptyCard.locator("p")
      const msgText = await boldMessage.innerText()
      assert.equal(
        msgText,
        "No friend suggestions yet. Add friends who have watched movies to see their picks here.",
        "RW04: Exact friends empty state copy mismatch",
      )

      const ctaBtn = emptyCard.locator("a", { hasText: "Find Friends" })
      await ctaBtn.waitFor()
      assert.equal(await ctaBtn.getAttribute("href"), "/friends")

      // Click CTA and verify navigation
      await ctaBtn.click()
      await page.waitForURL("**/friends")
      assert.ok(
        page.url().includes("/friends"),
        "RW04: CTA must navigate to /friends",
      )
      console.log(
        "✔ RW04: Centered Friend empty state and CTA navigation verified",
      )

      await page.close()
    }

    console.log("✔ All Ticket 3 checks (RW01-RW05) passed successfully!")
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
