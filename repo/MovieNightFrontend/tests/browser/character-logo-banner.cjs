// Browser verification for Ticket 2 (Dynamic character logo banner: CL01-CL03).
// Runs against Vite preview/dev server at MOVIENIGHT_BROWSER_URL with Playwright.
const assert = require("node:assert/strict")

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) {
    return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium
  }
  try {
    return require("playwright").chromium
  } catch {
    const fallback =
      "/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright"
    const fsMod = require("node:fs")
    if (fsMod.existsSync(fallback)) {
      return require(fallback).chromium
    }
    throw new Error("Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.")
  }
}

const chromium = loadChromium()
const app = process.env.MOVIENIGHT_BROWSER_URL || "http://127.0.0.1:8443"

async function setupMocks(page) {
  await page.route(
    (url) => new URL(url).pathname === "/api/users/me",
    (route) =>
      route.fulfill({
        json: {
          id: 1,
          username: "bannertester",
          displayName: "Banner Tester",
          role: "USER",
        },
      }),
  )

  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/movies/library"),
    (route) => route.fulfill({ json: [] }),
  )

  await page.route(
    (url) => new URL(url).pathname === "/api/suggestions/friends",
    (route) =>
      route.fulfill({
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
      }),
  )

  await page.route(
    (url) => new URL(url).pathname === "/api/movies/explore/movies",
    (route) =>
      route.fulfill({
        json: {
          categories: [
            {
              id: "newest",
              title: "Newest Releases",
              movies: [
                {
                  tmdbId: 693134,
                  title: "Dune: Part Two",
                  mediaType: "MOVIE",
                  releaseYear: 2024,
                  voteAverage: 8.4,
                  voteCount: 4500,
                  posterUrl:
                    "/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg",
                },
              ],
            },
          ],
        },
      }),
  )

  await page.route(
    (url) => new URL(url).pathname === "/api/movies/explore/tv",
    (route) =>
      route.fulfill({
        json: {
          categories: [
            {
              id: "top-rated",
              title: "Top Rated Series",
              movies: [
                {
                  tmdbId: 126308,
                  title: "Shogun",
                  mediaType: "TV",
                  releaseYear: 2024,
                  voteAverage: 8.6,
                  voteCount: 1800,
                  posterUrl:
                    "/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg",
                },
              ],
            },
          ],
        },
      }),
  )

  await page.route(
    (url) => new URL(url).pathname === "/api/movies/explore/anime-tv",
    (route) =>
      route.fulfill({
        json: {
          categories: [
            {
              id: "popular",
              title: "Popular Anime",
              movies: [],
            },
          ],
        },
      }),
  )

  await page.route(
    (url) => new URL(url).pathname === "/api/suggestions/personal",
    (route) =>
      route.fulfill({
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
                    "/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg",
                },
              ],
            },
          ],
        },
      }),
  )

  await page.route(
    (url) => /\/api\/movies\/tmdb\/\d+$/.test(new URL(url).pathname),
    (route) =>
      route.fulfill({
        json: {
          id: 693134,
          tmdbId: 693134,
          title: "Dune: Part Two",
          mediaType: "MOVIE",
          voteAverage: 8.4,
          genres: "Sci-Fi, Adventure",
        },
      }),
  )
}

async function main() {
  const { CHARACTER_LOGOS } = await import(
    "../../src/components/characterBannerLogic.ts"
  )

  console.log(
    "Launching browser for Ticket 2 Character Logo Banner verification...",
  )
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
      localStorage.setItem("movienight_token", "fixture-token-banner")
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({
          id: "1",
          username: "bannertester",
          displayName: "Banner Tester",
        }),
      )
    })

    const page = await context.newPage()
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err))
    await setupMocks(page)

    console.log("Navigating to home page at 1280x800...")
    const res = await page.goto(app, { waitUntil: "domcontentloaded" })
    assert.equal(res?.status(), 200, "Home page returns 200")

    // ─────────────────────────────────────────────────────────────
    // CL01 — Placement:
    // Character banner renders strictly below recommendations grid
    // and above the editorial narrative section.
    // ─────────────────────────────────────────────────────────────
    const banner = page.locator("#character-logo-banner")
    await banner.waitFor({ timeout: 10000 })
    assert(await banner.isVisible(), "CL01: Character logo banner is visible")

    const recSection = page.locator("#recommendations")
    await recSection.waitFor({ timeout: 5000 })
    const narrativeSection = page.locator("#editorial-narrative")
    await narrativeSection.waitFor({ timeout: 5000 })

    const recBox = await recSection.boundingBox()
    const bannerBox = await banner.boundingBox()
    const narrativeBox = await narrativeSection.boundingBox()

    assert(
      recBox && bannerBox && narrativeBox,
      "CL01: Bounding boxes retrieved",
    )
    assert(
      recBox.y < bannerBox.y,
      `CL01: Recommendations (y=${recBox.y}) must be above Banner (y=${bannerBox.y})`,
    )
    assert(
      bannerBox.y < narrativeBox.y,
      `CL01: Banner (y=${bannerBox.y}) must be above Editorial Narrative (y=${narrativeBox.y})`,
    )
    console.log(
      "✔ CL01: Vertical placement verified (recommendations < banner < narrative)",
    )

    // ─────────────────────────────────────────────────────────────
    // CL03 — Styling & responsiveness:
    // Centered, non-clickable, transparent, no horizontal overflow.
    // ─────────────────────────────────────────────────────────────
    const bannerImg = banner.locator("img")
    assert(await bannerImg.isVisible(), "CL03: Banner image is visible")

    // Verify non-clickable / pointer-events-none
    const pointerEvents = await banner.evaluate((el) => {
      return window.getComputedStyle(el).pointerEvents
    })
    assert.equal(
      pointerEvents,
      "none",
      "CL03: Banner container must have pointer-events: none (purely decorative)",
    )

    // Verify centered horizontally
    const imgBox = await bannerImg.boundingBox()
    assert(imgBox, "CL03: Image bounding box exists")
    const imgCenter = imgBox.x + imgBox.width / 2
    const pageCenter = 1280 / 2
    assert(
      Math.abs(imgCenter - pageCenter) < 25,
      `CL03: Image should be centered horizontally (imgCenter=${imgCenter}, pageCenter=${pageCenter})`,
    )

    // Verify responsive height constraints on desktop
    assert(
      imgBox.height <= 485,
      `CL03: Image height (${imgBox.height}px) must respect desktop max-h-[480px]`,
    )

    // Check zero horizontal overflow at desktop
    const desktopOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      )
    })
    assert.equal(
      desktopOverflow,
      false,
      "CL03: Zero horizontal scroll on desktop (1280px)",
    )
    console.log(
      "✔ CL03: Desktop styling, centering, non-clickable, and zero-overflow verified",
    )

    // Viewport responsiveness checks: tablet (768px), mobile (390px), narrow mobile (320px)
    for (const vp of [
      { width: 768, height: 1024, name: "Tablet (768px)" },
      { width: 390, height: 844, name: "Mobile iPhone (390px)" },
      { width: 320, height: 640, name: "Narrow Mobile (320px)" },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.waitForTimeout(100)

      const vpOverflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
        )
      })
      assert.equal(
        vpOverflow,
        false,
        `CL03: Zero horizontal scroll on ${vp.name} (scrollWidth <= ${vp.width})`,
      )

      const vpImgBox = await bannerImg.boundingBox()
      assert(vpImgBox, `CL03: Image visible on ${vp.name}`)
      assert(
        vpImgBox.width <= vp.width,
        `CL03: Image width (${vpImgBox.width}px) does not exceed viewport width (${vp.width}px)`,
      )
    }
    console.log(
      "✔ CL03: Responsive mobile viewports (768px, 390px, 320px) verified with zero overflow",
    )

    // ─────────────────────────────────────────────────────────────
    // CL02 — Rotation:
    // Multiple page loads randomly choose from configured transparent character assets.
    // ─────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 1280, height: 800 })
    const seenSrcs = new Set()

    for (let i = 0; i < 15; i++) {
      await page.goto(app, { waitUntil: "domcontentloaded" })
      const currentBanner = page.locator("#character-logo-banner img")
      await currentBanner.waitFor({ timeout: 5000 })
      const src = await currentBanner.getAttribute("src")
      assert(src, "CL02: Banner image src is present")
      assert(
        CHARACTER_LOGOS.includes(src),
        `CL02: Picked src "${src}" must be one of the configured transparent character assets`,
      )
      seenSrcs.add(src)
      if (seenSrcs.size >= 2) {
        break
      }
    }

    assert(
      seenSrcs.size >= 2,
      `CL02: Refreshing page randomly rotates between character assets (saw: ${Array.from(seenSrcs).join(", ")})`,
    )
    console.log(
      `✔ CL02: Random rotation across page loads verified (observed variants: ${Array.from(seenSrcs).join(", ")})`,
    )

    console.log(
      "✔ All Ticket 2 Character Logo Banner checks (CL01-CL03) passed successfully!",
    )
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("FAILED:", err)
  process.exit(1)
})
