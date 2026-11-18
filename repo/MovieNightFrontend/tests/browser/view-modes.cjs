// Browser verification for #42 (PD-24): distinct Grid / Compact on phones and
// the List view. Every /api/* call is answered by page.route mocks below, so
// this checks layout and view-mode persistence only.
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

const POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
const LONG_TITLE =
  "The Extraordinarily Long and Winding Title of a Film That Never Ends Properly At All"
const LONG_OVERVIEW =
  "A sprawling story that keeps going. ".repeat(20).trim()

const catalogMovie = (id, title, rating = 8.0, overview) => ({
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
  ...(overview === undefined ? {} : { overview }),
})

// 16 watched: #1 has a long title, #2 is unrated and has no overview.
const library = Array.from({ length: 16 }, (_, i) => ({
  id: 100 + i,
  catalogMovieId: 500 + i,
  status: "WATCHED",
  personalRating: i === 1 ? null : 8.2,
  notes: "",
  movie: catalogMovie(
    500 + i,
    i === 0 ? LONG_TITLE : `Watched Title ${i + 1}`,
    7.5,
    i === 1 ? "" : LONG_OVERVIEW,
  ),
}))

async function mockApi(page) {
  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/"),
    (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === "/api/users/me") {
        return route.fulfill({ json: { id: 1, username: "views", displayName: "View Tester", role: "USER" } })
      }
      if (pathname === "/api/movies/library") return route.fulfill({ json: library })
      if (pathname.startsWith("/api/movies/explore/movies/")) {
        return route.fulfill({
          json: {
            sessionId: "view-modes",
            cursor: 30,
            hasMore: false,
            title: "Popular",
            subtitle: "Fixture category",
            state: "READY",
            updatedAt: new Date().toISOString(),
            terminalReason: "PROVIDER_EXHAUSTED",
            movies: Array.from({ length: 30 }, (_, i) => catalogMovie(4000 + i, `Grid Title ${i + 1}`)),
          },
        })
      }
      if (pathname.startsWith("/api/movies/tmdb/")) {
        return route.fulfill({ json: { ...catalogMovie(501, "Watched Title 2"), overview: "" } })
      }
      return route.fulfill({ json: [] })
    },
  )
}

async function openContext(browser, width) {
  const isMobile = width < 600
  const context = await browser.newContext({
    viewport: { width, height: isMobile ? 844 : 1000 },
    isMobile,
    hasTouch: isMobile,
    reducedMotion: "reduce",
  })
  await context.addInitScript(() => {
    localStorage.setItem("movienight_token", "fixture-token-views")
    localStorage.setItem(
      "movienight_current_user",
      JSON.stringify({ id: "1", username: "views", displayName: "View Tester" }),
    )
    // Start from Grid once per tab; later reloads keep what the user chose.
    if (!sessionStorage.getItem("view-modes-init")) {
      localStorage.setItem("app_view_mode", "grid")
      sessionStorage.setItem("view-modes-init", "1")
    }
  })
  return context
}

async function openPage(browser, width, url, ready) {
  const context = await openContext(browser, width)
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

async function assertNoPageOverflow(page, where) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  assert.ok(scrollWidth <= clientWidth, `${where}: horizontal page overflow ${scrollWidth} > ${clientWidth}`)
}

async function columnCount(page) {
  return page.$$eval("[data-poster-grid] > *", (cells) => {
    const top = cells[0].getBoundingClientRect().top
    return cells.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 1).length
  })
}

const PAGES = [
  ["watched", "/movies"],
  ["view-all", "/explore/movies/popular"],
]

async function checkColumns(browser) {
  for (const [name, url] of PAGES) {
    const counts = {}
    for (const width of [390, 1440]) {
      for (const view of ["grid", "compact"]) {
        const page = await openPage(browser, width, `${url}?view=${view}`, "[data-poster-grid] > *")
        counts[`${view}@${width}`] = await columnCount(page)
        await assertNoPageOverflow(page, `VM01 ${name} ${view}@${width}`)
        await shoot(page, `vm01-${name}-${view}@${width}`)
        await page.context().close()
      }
    }
    assert.equal(counts["grid@390"], 3, `VM01 ${name}: Grid at 390 has ${counts["grid@390"]} columns`)
    assert.equal(counts["compact@390"], 4, `VM01 ${name}: Compact at 390 has ${counts["compact@390"]} columns`)
    assert.equal(counts["grid@1440"], 5, `VM01 ${name}: desktop Grid count changed (${counts["grid@1440"]})`)
    assert.ok(
      counts["compact@1440"] > counts["grid@1440"],
      `VM01 ${name}: desktop Compact (${counts["compact@1440"]}) must be denser than Grid (${counts["grid@1440"]})`,
    )
  }
  console.log("✔ VM01: Grid 3 / Compact 4 columns at 390; desktop Compact denser than Grid")

  // Narrow Explore Compact posters keep the #2 PM02 rule: the revealed
  // year · score line wraps rather than clipping.
  for (const width of [390, 320]) {
    const page = await openPage(browser, width, "/explore/movies/popular?view=compact", "[data-poster-grid] > *")
    const card = page.locator("[data-poster-grid] > * a").first()
    await card.focus()
    const fit = await card.locator(".explore-poster-metadata").evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    assert.ok(fit.scrollWidth <= fit.clientWidth + 1, `VM01 compact@${width}: metadata clipped ${JSON.stringify(fit)}`)
    await assertNoPageOverflow(page, `VM01 compact@${width}`)
    await page.context().close()
  }
  console.log("✔ VM01: phone Explore Compact metadata fits at 390 and 320")
}

async function measureList(page) {
  return page.$$eval("[data-poster-list] > *", (rows) =>
    rows.map((row) => {
      const box = row.getBoundingClientRect()
      const poster = row.querySelector("[data-poster-id]").getBoundingClientRect()
      const title = row.querySelector("h3")
      const titleStyle = getComputedStyle(title)
      const meta = row.querySelector("[data-list-meta]")
      const overview = row.querySelector("[data-list-overview]")
      const overviewStyle = overview && getComputedStyle(overview)
      const cs = getComputedStyle(row)
      return {
        left: box.left,
        right: box.right,
        posterWidth: poster.width,
        posterHeight: poster.height,
        posterLeft: poster.left,
        titleLeft: title.getBoundingClientRect().left,
        title: title.textContent,
        titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(titleStyle.lineHeight)),
        meta: meta ? meta.textContent : null,
        overviewLines: overview
          ? Math.round(overview.getBoundingClientRect().height / parseFloat(overviewStyle.lineHeight))
          : 0,
        overviewText: overview ? overview.textContent : null,
        divider:
          parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0,
        clipsRight: row.scrollWidth > row.clientWidth + 1,
      }
    }),
  )
}

async function checkList(browser) {
  for (const width of [390, 1440]) {
    for (const [name, url] of PAGES) {
      const where = `VM02 ${name}@${width}`
      const page = await openPage(browser, width, `${url}?view=list`, "[data-poster-list] > *")
      const rows = await measureList(page)
      assert.ok(rows.length >= 10, `${where}: ${rows.length} list rows`)
      assert.equal(await page.locator("[data-poster-grid]").count(), 0, `${where}: grid still rendered`)
      // One title per row: rows stack vertically.
      const lefts = new Set(rows.map((r) => Math.round(r.left)))
      assert.equal(lefts.size, 1, `${where}: rows are not stacked one per line`)
      for (const r of rows) {
        assert.ok(r.posterWidth >= 88 && r.posterWidth <= 104, `${where}: poster ${r.posterWidth}px wide`)
        assert.ok(Math.abs(r.posterHeight / r.posterWidth - 1.5) < 0.04, `${where}: poster not 2:3`)
        assert.ok(r.titleLeft > r.posterLeft + r.posterWidth, `${where}: title not right of poster`)
        assert.ok(r.titleLines >= 1 && r.titleLines <= 2, `${where}: "${r.title}" spans ${r.titleLines} lines`)
        assert.ok(r.overviewLines <= 3, `${where}: overview spans ${r.overviewLines} lines`)
        assert.ok(!r.clipsRight, `${where}: row content overflows`)
      }
      // Divider between rows.
      assert.ok(rows.slice(1).every((r) => r.divider), `${where}: rows lack a divider`)
      if (name === "watched") {
        const long = rows.find((r) => r.title === LONG_TITLE)
        assert.ok(long, `${where}: long-title row missing`)
        assert.equal(long.titleLines, Math.min(2, long.titleLines), `${where}: long title not clamped`)
        assert.equal(long.meta, "2019 · ★ 8.2", `${where}: watched meta ${JSON.stringify(long.meta)}`)
        assert.ok(long.overviewLines >= 1, `${where}: overview missing`)
        if (width === 390) assert.equal(long.overviewLines, 3, `${where}: long overview not clamped to 3 lines`)
        const unrated = rows.find((r) => r.title === "Watched Title 2")
        assert.equal(unrated.overviewText, null, `${where}: empty overview should be omitted`)
        assert.equal(unrated.meta, "2019", `${where}: unrated meta ${JSON.stringify(unrated.meta)}`)
      } else {
        assert.equal(rows[0].meta, "2019 · ★ 8.0", `${where}: explore meta ${JSON.stringify(rows[0].meta)}`)
      }
      await assertNoPageOverflow(page, where)
      await shoot(page, `vm02-${name}@${width}`)

      // The whole row opens the title.
      const second = page.locator("[data-poster-list] > *").nth(1)
      const box = await second.boundingBox()
      await page.mouse.click(box.x + box.width - 12, box.y + box.height / 2)
      await page.waitForURL(/\/movies\/[^/?]+/, { timeout: 8000 })
      await page.context().close()
    }
  }
  console.log("✔ VM02: List rows (96px 2:3 poster, ≤2-line title, year · ★ rating, ≤3-line overview, dividers) at 390 and 1440")
}

async function chooseView(page, label) {
  const dropdown = page.locator('button:has-text("View:")')
  if (await dropdown.isVisible()) {
    await dropdown.click()
    await page.locator(`button[role="option"]:has-text("${label}")`).click()
    return
  }
  await page.getByRole("button", { name: "Filters" }).click()
  const sheet = page.getByRole("dialog", { name: "Filter Options" })
  await sheet.getByRole("button", { name: label, exact: true }).click()
  await sheet.getByRole("button", { name: "Done" }).click()
}

async function checkPersistence(browser) {
  for (const width of [390, 1440]) {
    for (const [name, url] of PAGES) {
      const where = `VM03 ${name}@${width}`
      const page = await openPage(browser, width, url, "[data-poster-grid] > *")
      await chooseView(page, "List")
      await page.locator("[data-poster-list] > *").first().waitFor({ timeout: 5000 })
      assert.equal(new URL(page.url()).searchParams.get("view"), "list", `${where}: ?view=list missing (${page.url()})`)
      await page.reload()
      await page.locator("[data-poster-list] > *").first().waitFor({ timeout: 15000 })
      // Remembered without the URL too.
      await page.goto(`${app}${url}`)
      await page.locator("[data-poster-list] > *").first().waitFor({ timeout: 15000 })
      // Switching back to Grid restores the grid and clears ?view=.
      await chooseView(page, "Grid")
      await page.locator("[data-poster-grid] > *").first().waitFor({ timeout: 5000 })
      assert.equal(new URL(page.url()).searchParams.get("view"), null, `${where}: Grid should clear ?view=`)
      await page.context().close()
    }
  }
  console.log("✔ VM03: chosen view is in the URL, survives reload and is remembered")
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.MOVIENIGHT_CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  })
  try {
    await checkColumns(browser)
    await checkList(browser)
    await checkPersistence(browser)
    console.log("All #42 view-mode checks passed.")
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
