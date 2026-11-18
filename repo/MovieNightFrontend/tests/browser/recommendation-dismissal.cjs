// Browser checks for #40 (PD-22): "Not interested" on personal recommendations with an Undo toast.
// Covers RM02–RM05 in the UI (row and View all, phone and desktop, mouse/touch and keyboard).
// API responses are fixtures: the mock keeps dismissals in memory to imitate the server's exclusion.
// Real persistence (RM01–RM04) is covered by PersonalRecommendationsPersistenceTest in the backend.
// Run against the Vite dev server: MOVIENIGHT_BROWSER_URL (default http://127.0.0.1:8443).

const assert = require("node:assert/strict")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium
  try {
    return require("playwright").chromium
  } catch {
    const npxDir = path.join(os.homedir(), ".npm", "_npx")
    for (const entry of fs.existsSync(npxDir) ? fs.readdirSync(npxDir) : []) {
      const candidate = path.join(npxDir, entry, "node_modules", "playwright")
      if (fs.existsSync(candidate)) return require(candidate).chromium
    }
    throw new Error("Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.")
  }
}

const chromium = loadChromium()
const app = process.env.MOVIENIGHT_BROWSER_URL || "http://127.0.0.1:8443"

// 25 stored recommendations: the Home row shows the first 20, so the 21st can slide in (RM02).
const stored = Array.from({ length: 25 }, (_, i) => ({
  tmdbId: 501 + i,
  title: `Pick ${i + 1}`,
  releaseYear: 2020,
  posterUrl: null,
  voteAverage: 7.5,
  voteCount: 900,
  imdbRating: 7.4,
  score: 10 - i * 0.1,
  mediaType: "MOVIE",
  reason: "Because you watched Seed (MovieLens similarity)",
}))

/** One fixture "server" per page: dismissals persist across reloads of that page. */
async function mockApi(page, { failDismiss = false } = {}) {
  const server = { dismissed: new Set(), calls: [] }
  await page.route((url) => new URL(url).pathname.startsWith("/api/"), async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const dismissal = pathname.match(/^\/api\/suggestions\/personal\/dismissals\/(\d+)$/)
    if (dismissal) {
      const id = Number(dismissal[1])
      server.calls.push(`${request.method()} ${id}`)
      // A short delay keeps the request in flight long enough to exercise the undo ordering.
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (failDismiss && request.method() === "POST") return route.fulfill({ status: 500, json: {} })
      if (request.method() === "POST") server.dismissed.add(id)
      else server.dismissed.delete(id)
      return route.fulfill({ status: 204, body: "" })
    }
    if (pathname === "/api/users/me")
      return route.fulfill({ json: { id: 1, username: "dismisser", displayName: "Dismisser", role: "USER" } })
    if (pathname === "/api/suggestions/personal")
      return route.fulfill({ json: { categories: [{ id: "movies", title: "Personal movie recommendations",
        state: "READY", limitations: [], movies: stored.filter((m) => !server.dismissed.has(m.tmdbId)) }] } })
    if (pathname === "/api/suggestions/friends")
      return route.fulfill({ json: { categories: [{ id: "friends", title: "Rated by friends", movies: [] }] } })
    return route.fulfill({ json: [] })
  })
  return server
}

async function newContext(browser, phone) {
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem("movienight_token", "fixture-token-dismissal")
    localStorage.setItem("movienight_current_user", JSON.stringify({ id: "1", username: "dismisser", displayName: "Dismisser" }))
  })
  return context
}

const ROW = 'section[aria-label="Personal Recommendations"]'
const control = (title) => `button[aria-label="Not interested in ${title}"]`

async function rowTitles(page) {
  return page.locator(`${ROW} a[data-shelf-item]`).evaluateAll((links) => links.map((a) => a.getAttribute("title")))
}
async function gridTitles(page) {
  return page.locator("[data-poster-grid] a[aria-label]").evaluateAll((links) => links.map((a) => a.getAttribute("aria-label")))
}

async function openHome(context, options) {
  const page = await context.newPage()
  const server = await mockApi(page, options)
  await page.goto(app)
  await page.locator(`${ROW} a[data-shelf-item]`).first().waitFor({ timeout: 15000 })
  return { page, server }
}

async function assertTarget(page, selector, where) {
  const box = await page.locator(selector).boundingBox()
  assert.ok(box && box.width >= 44 && box.height >= 44, `${where}: target ${JSON.stringify(box)} is under 44 px`)
}

async function desktopMouse(browser) {
  const context = await newContext(browser, false)
  const { page, server } = await openHome(context)
  assert.equal((await rowTitles(page)).length, 20)
  const opacity = () => page.locator(control("Pick 2")).evaluate((el) => getComputedStyle(el).opacity)
  assert.equal(await opacity(), "0", "desktop: the control stays out of the way until hover or focus")
  await page.locator(`${ROW} a[title="Pick 2"]`).hover()
  await page.waitForTimeout(250)
  assert.equal(await opacity(), "1", "desktop: hovering the card shows the control")
  await assertTarget(page, control("Pick 2"), "desktop row")

  await page.locator(control("Pick 2")).click()
  let titles = await rowTitles(page)
  assert.ok(!titles.includes("Pick 2"), "RM02: the card disappears at once")
  assert.equal(titles.length, 20, "RM02: the row keeps its length")
  assert.equal(titles[19], "Pick 21", "RM02: the next stored title slides in")
  await page.getByRole("status").filter({ hasText: "Pick 2 removed" }).waitFor()

  await page.getByRole("button", { name: "Undo" }).click()
  titles = await rowTitles(page)
  assert.equal(titles[1], "Pick 2", "RM03: Undo restores the title to its position")
  assert.equal(titles.length, 20)
  await page.waitForTimeout(500)
  assert.deepEqual(server.calls, ["POST 502", "DELETE 502"], "RM03: the undo is sent after the dismissal")

  // RM04: a double click dismisses one title, not the one that slid under the pointer.
  await page.locator(`${ROW} a[title="Pick 4"]`).hover()
  await page.locator(control("Pick 4")).dblclick()
  await page.waitForTimeout(500)
  titles = await rowTitles(page)
  assert.ok(!titles.includes("Pick 4") && titles.includes("Pick 5"), `RM04: only one title removed (${titles.slice(0, 6)})`)
  assert.deepEqual(server.calls.filter((c) => c.startsWith("POST")), ["POST 502", "POST 504"], "RM04: a single dismissal request")

  // The double-tap block covers only the slot just dismissed: a quick dismissal of another card goes through.
  // dispatchEvent skips Playwright's actionability waits, so the second dismissal lands well inside 600 ms.
  await page.locator(`${ROW} a[title="Pick 6"]`).hover()
  await page.locator(control("Pick 6")).click()
  await page.locator(control("Pick 8")).dispatchEvent("click")
  await page.waitForTimeout(500)
  titles = await rowTitles(page)
  assert.ok(!titles.includes("Pick 6") && !titles.includes("Pick 8"), `RM04: a different card is not blocked (${titles.slice(0, 8)})`)

  // RM01 as the UI sees it: after a reload the dismissed title is still gone.
  await page.reload()
  await page.locator(`${ROW} a[data-shelf-item]`).first().waitFor()
  titles = await rowTitles(page)
  assert.ok(!titles.includes("Pick 4") && titles.length === 20, "RM01: gone after reload")
  await context.close()
  console.log("✔ desktop row, mouse: hover reveal, 44 px target, slide-in, Undo in place, double click, another card, reload")
}

async function desktopKeyboard(browser) {
  const context = await newContext(browser, false)
  const { page, server } = await openHome(context)
  await page.locator(`${ROW} a[title="Pick 3"]`).focus()
  await page.keyboard.press("Tab")
  await page.waitForTimeout(250)
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim())
  assert.equal(await focused(), "Not interested in Pick 3", "RM05: the control follows its card in tab order")
  assert.equal(await page.locator(control("Pick 3")).evaluate((el) => getComputedStyle(el).opacity), "1",
    "RM05: the focused control is visible")

  await page.keyboard.press("Enter")
  await page.waitForTimeout(100)
  assert.equal(await focused(), "Undo", "RM05: a keyboard dismissal moves focus to Undo")
  // The toast stays while it holds focus, beyond its 5 s.
  await page.waitForTimeout(6000)
  assert.equal(await focused(), "Undo", "RM05: Undo stays reachable while focused")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(200)
  assert.equal((await rowTitles(page))[2], "Pick 3", "RM03 by keyboard: restored in place")
  assert.equal(await focused(), "Not interested in Pick 3", "RM05: focus returns to the restored card")

  // Escape keeps the dismissal and returns focus to the card now in that place.
  await page.keyboard.press("Enter")
  await page.waitForTimeout(100)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  assert.ok(!(await rowTitles(page)).includes("Pick 3"))
  assert.equal(await focused(), "Not interested in Pick 4", "RM05: focus moves to the next card")
  await page.waitForTimeout(400)
  assert.deepEqual(server.calls, ["POST 503", "DELETE 503", "POST 503"])
  await context.close()
  console.log("✔ desktop row, keyboard: tab order, Enter, focus to Undo, toast held while focused, focus return, Escape")
}

async function phoneTouch(browser) {
  const context = await newContext(browser, true)
  const { page, server } = await openHome(context)
  const first = control("Pick 1")
  assert.equal(await page.locator(first).evaluate((el) => getComputedStyle(el).opacity), "1",
    "phone: the control is visible without hover")
  await assertTarget(page, first, "phone row")
  await page.locator(first).tap()
  assert.equal((await rowTitles(page))[0], "Pick 2")
  const toast = page.getByRole("status").filter({ hasText: "Pick 1 removed" })
  await toast.waitFor()
  const box = await toast.boundingBox()
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `phone: toast inside the viewport ${JSON.stringify(box)}`)
  const undoTarget = await page.getByRole("button", { name: "Undo" }).evaluate((el) => {
    const after = getComputedStyle(el, "::after")
    return { width: Math.max(parseFloat(after.width), el.getBoundingClientRect().width), height: parseFloat(after.height) }
  })
  assert.ok(undoTarget.width >= 44 && undoTarget.height >= 44, `phone: Undo target ${JSON.stringify(undoTarget)}`)
  await page.getByRole("button", { name: "Undo" }).tap()
  assert.equal((await rowTitles(page))[0], "Pick 1", "phone: Undo restores")
  // A full page load cancels requests in flight; let the dismissal and its undo finish first.
  await page.waitForTimeout(600)
  assert.deepEqual(server.calls, ["POST 501", "DELETE 501"])

  // View all (grid) on the phone.
  await page.goto(`${app}/suggestions/for-you`)
  await page.locator("[data-poster-grid] a[aria-label]").first().waitFor()
  assert.equal((await gridTitles(page)).length, 25)
  await assertTarget(page, control("Pick 5"), "phone grid")
  await page.locator(control("Pick 5")).tap()
  let titles = await gridTitles(page)
  assert.ok(!titles.includes("Pick 5") && titles.length === 24, "View all: the card disappears")
  await page.waitForTimeout(600)
  await page.reload()
  await page.locator("[data-poster-grid] a[aria-label]").first().waitFor()
  titles = await gridTitles(page)
  assert.ok(!titles.includes("Pick 5"), "View all: gone after reload")
  assert.ok(server.calls.includes("POST 505"))
  await context.close()
  console.log("✔ phone 390: visible control, 44 px targets, toast in viewport, Undo, View all dismissal and reload")
}

async function desktopViewAllKeyboard(browser) {
  const context = await newContext(browser, false)
  const page = await context.newPage()
  await mockApi(page)
  await page.goto(`${app}/suggestions/for-you`)
  await page.locator("[data-poster-grid] a[aria-label]").first().waitFor()
  await page.locator(control("Pick 1")).focus()
  await page.keyboard.press("Space")
  await page.waitForTimeout(100)
  assert.ok(!(await gridTitles(page)).includes("Pick 1"))
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Undo")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(200)
  assert.equal((await gridTitles(page))[0], "Pick 1", "View all: Undo restores the first position")
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Not interested in Pick 1")
  await context.close()
  console.log("✔ desktop View all, keyboard: Space dismisses, Undo restores, focus returns")
}

async function failedDismissal(browser) {
  const context = await newContext(browser, false)
  const { page } = await openHome(context, { failDismiss: true })
  await page.locator(`${ROW} a[title="Pick 1"]`).hover()
  await page.locator(control("Pick 1")).click()
  await page.getByRole("status").filter({ hasText: "Could not remove Pick 1" }).waitFor()
  assert.equal((await rowTitles(page))[0], "Pick 1", "a failed dismissal puts the card back")
  // The Undo toast leaves through its 200 ms exit animation; it must be gone well within a second.
  await page.getByRole("button", { name: "Undo" }).waitFor({ state: "detached", timeout: 1000 })
  await context.close()
  console.log("✔ failed dismissal: the card returns with an error toast and the Undo toast closes")
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MOVIENIGHT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  })
  try {
    await desktopMouse(browser)
    await desktopKeyboard(browser)
    await phoneTouch(browser)
    await desktopViewAllKeyboard(browser)
    await failedDismissal(browser)
    console.log("All #40 dismissal checks passed")
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
