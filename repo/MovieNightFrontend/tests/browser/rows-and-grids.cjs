// Browser verification for #21 (PD-05, rows) and #22 (PD-06, poster grids).
// Fixtures: every /api/* call is answered by page.route mocks below, so this
// checks layout only, not real API persistence.
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

const LONG_TITLE =
  "The Extraordinarily Long and Winding Title of a Film That Never Ends Properly"

// Inline 1×1 image: real titles have posters, and the no-poster fallback
// prints the title inside the poster, which would distort the PG02 text check.
const POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

const catalogMovie = (id, title, rating = 8.0) => ({
  id,
  tmdbId: id,
  title,
  year: 2019,
  releaseYear: 2019,
  posterUrl: POSTER,
  posterSeed: null,
  imdb: rating,
  imdbRating: rating,
  tmdbRating: rating,
  voteAverage: rating,
  voteCount: 900,
  tmdbVotes: 900,
  mediaType: "MOVIE",
})

const row = (id, title, base) => ({
  id,
  title,
  updatedAt: new Date().toISOString(),
  state: "READY",
  hasMore: true,
  movies: Array.from({ length: 14 }, (_, i) =>
    catalogMovie(base + i, `${title} ${i + 1}`, 9 - i * 0.1),
  ),
})

const exploreRows = {
  categories: [
    row("newest", "Newest Releases", 1000),
    row("popular", "Popular", 2000),
    row("top-rated", "Top Rated", 3000),
  ],
}

// 16 watched (one unrated, one long title) and 4 watchlist entries.
const library = [
  ...Array.from({ length: 16 }, (_, i) => ({
    id: 100 + i,
    catalogMovieId: 500 + i,
    status: "WATCHED",
    personalRating: i === 1 ? null : 8.2,
    notes: "",
    movie: {
      ...catalogMovie(500 + i, i === 0 ? LONG_TITLE : `Watched Title ${i + 1}`),
      rottenTomatoesRating: 91,
    },
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: 200 + i,
    catalogMovieId: 600 + i,
    status: "WATCHLIST",
    personalRating: null,
    notes: "",
    movie: catalogMovie(600 + i, `Planned Title ${i + 1}`),
  })),
]

async function mockApi(page) {
  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/"),
    (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === "/api/users/me") {
        return route.fulfill({
          json: { id: 1, username: "rows", displayName: "Rows Tester", role: "USER" },
        })
      }
      if (pathname === "/api/movies/library") return route.fulfill({ json: library })
      if (pathname === "/api/movies/explore/movies") {
        return route.fulfill({ json: exploreRows })
      }
      if (pathname.startsWith("/api/movies/explore/movies/")) {
        return route.fulfill({
          json: {
            sessionId: "rows-grid",
            cursor: 30,
            hasMore: false,
            title: "Popular",
            subtitle: "Fixture category",
            state: "READY",
            updatedAt: new Date().toISOString(),
            terminalReason: "PROVIDER_EXHAUSTED",
            movies: Array.from({ length: 30 }, (_, i) =>
              catalogMovie(4000 + i, `Grid Title ${i + 1}`),
            ),
          },
        })
      }
      if (pathname === "/api/movies/tmdb/627") {
        return route.fulfill({
          json: {
            ...catalogMovie(627, "Trainspotting"),
            backdropUrl: null,
            overview: "Fixture overview.",
            runtimeMinutes: 93,
            cast: Array.from({ length: 8 }, (_, i) => ({
              name: `Cast Member ${i + 1}`,
              role: `Role ${i + 1}`,
              profileUrl: null,
            })),
          },
        })
      }
      if (pathname === "/api/movies/627/similar") {
        return route.fulfill({
          json: Array.from({ length: 12 }, (_, i) =>
            catalogMovie(700 + i, `Similar Title ${i + 1}`),
          ),
        })
      }
      if (pathname.startsWith("/api/suggestions/personal") || pathname === "/api/suggestions/for-you") {
        return route.fulfill({
          json: {
            categories: [
              { id: "movies", title: "Personal", state: "NO_HISTORY", limitations: [], movies: [] },
            ],
          },
        })
      }
      if (pathname === "/api/suggestions/friends") {
        return route.fulfill({
          json: {
            categories: [
              { id: "friends", title: "Rated by friends", movies: [] },
              { id: "friends-watchlist", title: "On friends’ watchlists", movies: [] },
            ],
          },
        })
      }
      return route.fulfill({ json: [] })
    },
  )
}

async function openPage(browser, width, url, ready) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem("movienight_token", "fixture-token-rows")
    localStorage.setItem(
      "movienight_current_user",
      JSON.stringify({ id: "1", username: "rows", displayName: "Rows Tester" }),
    )
    localStorage.setItem("app_view_mode", "grid")
  })
  const page = await context.newPage()
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message))
  await mockApi(page)
  await page.goto(`${app}${url}`)
  await page.locator(ready).first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(300)
  return page
}

async function shoot(page, name) {
  if (!shotDir) return
  fs.mkdirSync(shotDir, { recursive: true })
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
}

/** Rows rendered by the shared row component, in document order. */
async function measureRows(page) {
  return page.$$eval("[data-shelf-section]", (sections) =>
    sections.map((section) => {
      const heading = section.querySelector("h2").getBoundingClientRect()
      const cards = [...section.querySelectorAll("[data-shelf-item]")]
      const bottom = cards.length
        ? Math.max(...cards.map((c) => c.getBoundingClientRect().bottom))
        : section.getBoundingClientRect().bottom
      const box = section.getBoundingClientRect()
      return {
        // Only directly stacked rows are compared for RO01 (the title page has
        // the notes/friends panel between Key Cast and You May Also Like).
        followsRow: Boolean(section.previousElementSibling?.matches("[data-shelf-section]")),
        label: section.querySelector("h2").textContent.trim(),
        headingTop: heading.top,
        headingFont: parseFloat(getComputedStyle(section.querySelector("h2")).fontSize),
        headingWeight: getComputedStyle(section.querySelector("h2")).fontWeight,
        itemsBottom: bottom,
        left: box.left,
        right: box.right,
        cardWidth: cards.length ? cards[0].getBoundingClientRect().width : null,
      }
    }),
  )
}

async function assertNoPageOverflow(page, where) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  assert.ok(scrollWidth <= clientWidth, `${where}: horizontal page overflow ${scrollWidth} > ${clientWidth}`)
}

// The title page has one row (Key Cast); You May Also Like stays a grid.
const ROW_PAGES = [
  { name: "home", url: "/", ready: "[data-shelf-section] [data-shelf-item]", minRows: 2, posters: true },
  { name: "explore", url: "/explore/movies", ready: "[data-shelf-section] [data-shelf-item]", minRows: 2, posters: true },
  { name: "title", url: "/movies/movie:627", ready: "[data-shelf-section] [data-shelf-item]", minRows: 1, posters: false },
]
const POSTER_ROW_PAGES = ROW_PAGES.filter((p) => p.posters)

/** Content is centred and capped at 1680px; the gutter is the minimum side margin. */
const MAX_CONTENT = 1680
const sideMargin = (viewport, gutter) => Math.max(gutter, (viewport - MAX_CONTENT) / 2)

async function checkRows(browser) {
  const widths = [
    { width: 1920, maxGap: 48, gutter: 32, headingFont: [22, 24] },
    { width: 1440, maxGap: 48, gutter: 32, headingFont: [22, 24] },
    { width: 390, maxGap: 32, gutter: 16, headingFont: [17, 19] },
  ]
  const baselineCardWidth = 180
  for (const spec of widths) {
    for (const rowPage of ROW_PAGES) {
      const page = await openPage(browser, spec.width, rowPage.url, rowPage.ready)
      const where = `${rowPage.name}@${spec.width}`
      const rows = await measureRows(page)
      assert.ok(rows.length >= rowPage.minRows, `${where}: expected ≥${rowPage.minRows} shared rows, found ${rows.length}`)

      // RO01: heading-to-previous-row gap
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i].followsRow) continue
        const gap = rows[i].headingTop - rows[i - 1].itemsBottom
        assert.ok(
          gap <= spec.maxGap && gap >= 0,
          `RO01 ${where}: gap above "${rows[i].label}" is ${gap.toFixed(1)}px (limit ${spec.maxGap})`,
        )
      }

      // Headings: size + weight
      for (const r of rows) {
        assert.ok(
          r.headingFont >= spec.headingFont[0] && r.headingFont <= spec.headingFont[1],
          `${where}: heading "${r.label}" font ${r.headingFont}px`,
        )
        assert.ok(Number(r.headingWeight) >= 600, `${where}: heading weight ${r.headingWeight}`)
      }

      // RO02: rows span the capped content area (viewport minus the side margins)
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
      const margin = sideMargin(clientWidth, spec.gutter)
      for (const r of rows) {
        assert.ok(Math.abs(r.left - margin) <= 1, `RO02 ${where}: "${r.label}" left ${r.left} (expected ${margin})`)
        assert.ok(
          Math.abs(clientWidth - margin - r.right) <= 1,
          `RO02 ${where}: "${r.label}" right ${r.right} (viewport ${clientWidth})`,
        )
      }
      await assertNoPageOverflow(page, `RO02 ${where}`)

      // Poster size: ~15% larger on desktop/tablet
      if (spec.width >= 768 && rowPage.posters) {
        const poster = rows.find((r) => r.cardWidth && r.label !== "Key Cast")
        assert.ok(
          poster.cardWidth >= baselineCardWidth * 1.12 && poster.cardWidth <= baselineCardWidth * 1.2,
          `${where}: poster width ${poster.cardWidth}`,
        )
      }
      await shoot(page, `rows-${where}`)
      await page.close()
    }
  }
  console.log("✔ RO01/RO02: row gaps, headings, gutters and poster size at 1920, 1440, 390")
}

async function checkHover(browser) {
  for (const width of [1920, 1440, 390]) {
    for (const rowPage of POSTER_ROW_PAGES) {
      const page = await openPage(browser, width, rowPage.url, rowPage.ready)
      const where = `${rowPage.name}@${width}`
      for (const mode of ["hover", "focus"]) {
        const card = page.locator(".shelf-card").nth(1)
        await card.scrollIntoViewIfNeeded()
        if (mode === "hover") await card.hover()
        else {
          // Keyboard focus so :focus-visible (and its ring) applies.
          await page.locator(".shelf-card").nth(0).focus()
          await page.keyboard.press("Tab")
        }
        await page.waitForTimeout(450)
        const m = await card.evaluate((el) => {
          const track = el.parentElement.getBoundingClientRect()
          const b = el.getBoundingClientRect()
          // Include the focus ring (offset + width, scaled with the card).
          const cs = getComputedStyle(el)
          const ring =
            cs.outlineStyle === "none" ? 0 : (parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth)) * 1.05
          const r = { top: b.top - ring, bottom: b.bottom + ring, left: b.left - ring, right: b.right + ring }
          const section = el.closest("[data-shelf-section]")
          let next = section.nextElementSibling
          while (next && !next.matches("[data-shelf-section]")) next = next.nextElementSibling
          const nextHeading = next ? next.querySelector("h2").getBoundingClientRect().top : null
          return { r, track, nextHeading }
        })
        // RO03: the enlarged card stays inside the scroll track (never clipped)…
        assert.ok(m.r.top >= m.track.top - 0.5, `RO03 ${where} ${mode}: clipped at top (${m.r.top} < ${m.track.top})`)
        assert.ok(m.r.bottom <= m.track.bottom + 0.5, `RO03 ${where} ${mode}: clipped at bottom (${m.r.bottom} > ${m.track.bottom})`)
        // …and does not overlap the next heading.
        if (m.nextHeading != null) {
          assert.ok(m.r.bottom <= m.nextHeading, `RO03 ${where} ${mode}: overlaps next heading`)
        }
        await page.mouse.move(0, 0)
        await page.evaluate(() => document.activeElement && document.activeElement.blur())
      }
      await page.close()
    }
  }
  console.log("✔ RO03: hover/focus enlargement unclipped and clear of the next heading")
}

async function checkSharedComponent(browser) {
  const signatures = []
  for (const rowPage of ROW_PAGES) {
    const page = await openPage(browser, 1440, rowPage.url, rowPage.ready)
    const sig = await page.$$eval("[data-shelf-section]", (sections) =>
      sections.map((s) => {
        const h = getComputedStyle(s.querySelector("h2"))
        return `${h.fontSize}/${h.fontWeight}/${getComputedStyle(s.parentElement).rowGap}`
      }),
    )
    signatures.push(...sig.map((s) => `${s}`))
    await page.close()
  }
  assert.equal(new Set(signatures).size, 1, `RO04: rows differ across pages: ${[...new Set(signatures)]}`)
  console.log("✔ RO04: Home, Explore and title page rows share one component and spacing")
}

async function columnCount(page) {
  return page.$$eval("[data-poster-grid] > *", (cells) => {
    if (cells.length === 0) return 0
    const top = cells[0].getBoundingClientRect().top
    return cells.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 1).length
  })
}

async function checkGrids(browser) {
  const targets = [
    [1920, 7],
    [1440, 5],
    [768, 3],
    [390, 2],
  ]
  for (const [width, cols] of targets) {
    for (const [name, url] of [
      ["watched", "/movies"],
      ["view-all", "/explore/movies/popular"],
    ]) {
      const page = await openPage(browser, width, url, "[data-poster-grid] > *")
      const n = await columnCount(page)
      assert.equal(n, cols, `PG01 ${name}@${width}: ${n} columns, expected ${cols}`)
      await assertNoPageOverflow(page, `PG01 ${name}@${width}`)
      await shoot(page, `grid-${name}@${width}`)
      await page.close()
    }
  }
  console.log("✔ PG01: grid columns 7/5/3/2 at 1920/1440/768/390 (Watched, View all)")

  // PG02: Watched cards — poster, title, personal rating only.
  {
    const page = await openPage(browser, 1440, "/movies", "[data-poster-grid] > *")
    const texts = await page.$$eval("[data-poster-grid] > *", (cells) =>
      cells.map((c) => c.innerText.split("\n").map((s) => s.trim()).filter(Boolean)),
    )
    const rated = texts.find((t) => t[0] === "Watched Title 3")
    assert.deepEqual(rated, ["Watched Title 3", "★ 8.2"], `PG02 watched rated: ${JSON.stringify(rated)}`)
    const unrated = texts.find((t) => t[0] === "Watched Title 2")
    assert.deepEqual(unrated, ["Watched Title 2", "Unrated"], `PG02 watched unrated: ${JSON.stringify(unrated)}`)

    // PG03: long titles truncate without changing card height.
    const heights = await page.$$eval("[data-poster-grid] > *", (cells) =>
      cells.map((c) => ({
        h: Math.round(c.getBoundingClientRect().height),
        truncated: (() => {
          const t = c.querySelector("h3")
          return t ? t.scrollWidth > t.clientWidth : false
        })(),
        title: c.querySelector("h3")?.textContent,
      })),
    )
    const long = heights.find((h) => h.title === LONG_TITLE)
    assert.ok(long.truncated, "PG03: long title should be truncated")
    assert.equal(new Set(heights.map((h) => h.h)).size, 1, `PG03: card heights differ ${heights.map((h) => h.h)}`)
    await page.close()
  }
  {
    const page = await openPage(browser, 1440, "/movies?status=watchlist", "[data-poster-grid] > *")
    const texts = await page.$$eval("[data-poster-grid] > *", (cells) =>
      cells.map((c) => c.innerText.split("\n").map((s) => s.trim()).filter(Boolean)),
    )
    assert.equal(texts.length, 4)
    for (const t of texts) {
      assert.ok(/^Planned Title \d$/.test(t[0]) && t[1] === "2019" && t.length === 2, `PG02 watchlist: ${JSON.stringify(t)}`)
    }
    await page.close()
  }
  console.log("✔ PG02/PG03: minimal Watched and Watchlist cards; long titles truncate at fixed height")
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.MOVIENIGHT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  })
  try {
    await checkRows(browser)
    await checkHover(browser)
    await checkSharedComponent(browser)
    await checkGrids(browser)
    console.log("All #21/#22 row and grid checks passed.")
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
