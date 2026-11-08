// Browser / Component verification for Ticket 7: TMDB Title Logos in Hero banner (LG01-LG03).
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

async function main() {
  console.log("Launching browser for Ticket 7 Title Logos verification...")
  const launchOptions = {
    headless: true,
  }
  if (process.env.MOVIENIGHT_CHROME_PATH) {
    launchOptions.executablePath = process.env.MOVIENIGHT_CHROME_PATH
  } else {
    launchOptions.channel = "chrome"
  }

  const browser = await chromium.launch(launchOptions)

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })

    await context.addInitScript(() => {
      localStorage.setItem("movienight_token", "fixture-token-logos")
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({
          id: "1",
          username: "logotester",
          displayName: "Logo Tester",
        }),
      )
    })

    const page = await context.newPage()
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err))

    // Mock auth & profile
    await page.route(
      (url) => new URL(url).pathname === "/api/users/me",
      (route) => {
        return route.fulfill({
          json: {
            id: 1,
            username: "logotester",
            displayName: "Logo Tester",
            role: "USER",
          },
        })
      },
    )

    // Mock empty library
    await page.route(
      (url) => new URL(url).pathname.startsWith("/api/movies/library"),
      (route) => route.fulfill({ json: [] }),
    )

    // Mock explore media: Movies, TV, Anime
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
                    tmdbId: 550,
                    title: "Fight Club",
                    mediaType: "MOVIE",
                    releaseYear: 1999,
                    voteAverage: 8.4,
                    voteCount: 26000,
                    posterUrl: "https://image.tmdb.org/t/p/w500/fight_club.jpg",
                    backdropUrl:
                      "https://image.tmdb.org/t/p/w1280/fight_club_bg.jpg",
                  },
                ],
              },
            ],
          },
        })
      },
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/movies/explore/tv",
      (route) => {
        return route.fulfill({
          json: {
            categories: [
              {
                id: "top-rated",
                title: "Top Rated Series",
                movies: [
                  {
                    tmdbId: 1396,
                    title: "Breaking Bad",
                    mediaType: "TV",
                    releaseYear: 2008,
                    voteAverage: 8.9,
                    voteCount: 12000,
                    posterUrl: "https://image.tmdb.org/t/p/w500/bb_poster.jpg",
                    backdropUrl: "https://image.tmdb.org/t/p/w1280/bb_bg.jpg",
                  },
                ],
              },
            ],
          },
        })
      },
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/movies/explore/anime",
      (route) => route.fulfill({ json: { categories: [] } }),
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/suggestions/personal",
      (route) => route.fulfill({ json: { categories: [] } }),
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/suggestions/friends",
      (route) => route.fulfill({ json: { categories: [] } }),
    )

    await page.route(
      (url) => new URL(url).hostname === "image.tmdb.org",
      (route) => {
        // Return 1x1 transparent PNG for all TMDB image requests
        const png1x1 = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          "base64",
        )
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: png1x1,
        })
      },
    )

    // TMDB Details enrichment:
    // tmdbId 550 (Fight Club) returns a valid logoUrl
    // tmdbId 1396 (Breaking Bad) returns no logo (null)
    await page.route(
      (url) => /\/api\/movies\/tmdb\/\d+$/.test(new URL(url).pathname),
      (route) => {
        const id = Number(
          new URL(route.request().url()).pathname.split("/").at(-1),
        )
        if (id === 550) {
          return route.fulfill({
            json: {
              id: 550,
              tmdbId: 550,
              title: "Fight Club",
              mediaType: "MOVIE",
              releaseYear: 1999,
              backdropUrl: "https://image.tmdb.org/t/p/w1280/fight_club_bg.jpg",
              logoUrl: "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
              genres: "Drama",
            },
          })
        }
        return route.fulfill({
          json: {
            id,
            tmdbId: id,
            title: "Breaking Bad",
            mediaType: "TV",
            releaseYear: 2008,
            backdropUrl: "https://image.tmdb.org/t/p/w1280/bb_bg.jpg",
            logoUrl: null,
            genres: "Drama, Crime",
          },
        })
      },
    )

    console.log("Navigating to home page at", app)
    await page.goto(app, { waitUntil: "networkidle" })

    // Wait for hero banner
    const heroBanner = page.locator(
      'section[aria-label="Curated spotlight hero banner"]',
    )
    await heroBanner.waitFor({ timeout: 10000 })
    console.log("Hero banner rendered successfully.")

    // --- Check 1: LG02 - Official title logo renders for Slide 1 (Fight Club) ---
    const slide1 = heroBanner.locator(
      'div[role="group"][aria-label*="Fight Club"]',
    )
    await slide1.waitFor({ timeout: 5000 })

    const logoImg = slide1.locator('img.object-contain[alt="Fight Club"]')
    assert.equal(
      await logoImg.count(),
      1,
      "Expected 1 logo image for Fight Club",
    )
    const logoSrc = await logoImg.getAttribute("src")
    assert.equal(
      logoSrc,
      "https://image.tmdb.org/t/p/w500/fight_club_logo.png",
      "Logo src should match enriched logoUrl",
    )

    // Check CSS classes on logo image
    const logoClass = await logoImg.getAttribute("class")
    assert(logoClass.includes("max-h-24"), "Logo should include max-h-24")
    assert(logoClass.includes("sm:max-h-32"), "Logo should include sm:max-h-32")
    assert(
      logoClass.includes("object-contain"),
      "Logo should include object-contain",
    )

    // Check accessible sr-only title
    const srTitle = slide1.locator("h1.sr-only")
    assert.equal(
      await srTitle.count(),
      1,
      "Expected h1.sr-only accessibility label",
    )
    assert.equal((await srTitle.textContent()).trim(), "Fight Club")
    console.log("LG02: Hero logo rendering verified.")

    // --- Check 2: LG03 - Text fallback when image fails to load ---
    console.log("Triggering image load error on logo...")
    await logoImg.dispatchEvent("error")

    // Once error triggers, logo image is removed and bold text title is displayed
    const fallbackH1 = slide1.locator("h1:not(.sr-only)")
    await fallbackH1.waitFor({ timeout: 3000 })
    const h1Text = (await fallbackH1.textContent()).trim()
    assert.equal(
      h1Text,
      "Fight Club",
      "Expected bold text title fallback after logo error",
    )
    const h1Class = await fallbackH1.getAttribute("class")
    assert(
      h1Class.includes("font-bold"),
      "Fallback title should have font-bold",
    )
    assert(h1Class.includes("text-2xl"), "Fallback title should have text-2xl")
    console.log("LG03: Image error fallback verified.")

    // --- Check 3: LG03 - Text fallback when logo is missing (Slide 2: Breaking Bad) ---
    // Advance to slide 2
    const indicator2 = heroBanner.locator('button[aria-label*="Go to slide 2"]')
    await indicator2.click()
    await page.waitForTimeout(800) // Wait for crossfade

    const slide2 = heroBanner.locator(
      'div[role="group"][aria-label*="Breaking Bad"]',
    )
    await slide2.waitFor({ timeout: 5000 })

    const slide2Logo = slide2.locator('img.object-contain[alt="Breaking Bad"]')
    assert.equal(
      await slide2Logo.count(),
      0,
      "Slide 2 should not have a logo img since logoUrl is null",
    )

    const slide2H1 = slide2.locator("h1:not(.sr-only)")
    assert.equal(await slide2H1.count(), 1, "Slide 2 should display text h1")
    assert.equal((await slide2H1.textContent()).trim(), "Breaking Bad")
    console.log("LG03: Missing logo text fallback verified.")

    console.log(
      "\nALL TICKET 7 TITLE LOGO BROWSER CHECKS PASSED SUCCESSFULLY (LG01, LG02, LG03)!",
    )
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
