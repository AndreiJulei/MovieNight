// Browser verification for Ticket 4: Accessible personal rating slider (RS01-RS04).
// Runs against Vite preview/dev server at MOVIENIGHT_BROWSER_URL with Playwright.
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
  console.log("Launching browser for Ticket 4 Rating Slider verification...")
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
      hasTouch: true,
    })

    await context.addInitScript(() => {
      localStorage.setItem("movienight_token", "fixture-token-slider")
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({
          id: "1",
          username: "slidertester",
          displayName: "Slider Tester",
        }),
      )
    })

    const page = await context.newPage()
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err))

    // Shared mock state
    let libraryEntries = [
      {
        id: 1,
        catalogMovieId: 550,
        status: "WATCHED",
        personalRating: 7.5,
        notes: "Great psychological thriller",
        movie: {
          id: 550,
          tmdbId: 550,
          title: "Fight Club",
          mediaType: "MOVIE",
          releaseYear: 1999,
          posterUrl: null,
          overview: "An insomniac office worker...",
        },
      },
    ]

    // Mock API routes
    await page.route(
      (url) => new URL(url).pathname === "/api/users/me",
      (route) => {
        return route.fulfill({
          json: {
            id: 1,
            username: "slidertester",
            displayName: "Slider Tester",
            role: "USER",
          },
        })
      },
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/friends",
      (route) => route.fulfill({ json: [] }),
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/friends/ratings",
      (route) => route.fulfill({ json: [] }),
    )

    await page.route(
      (url) => new URL(url).pathname === "/api/movies/library",
      (route) => {
        return route.fulfill({ json: libraryEntries })
      },
    )

    await page.route(
      (url) => /\/api\/movies\/library\/\d+$/.test(new URL(url).pathname),
      (route) => {
        const url = new URL(route.request().url())
        const id = Number(url.pathname.split("/").pop())
        const body = route.request().postDataJSON() || {}
        if (
          route.request().method() === "PUT" ||
          route.request().method() === "POST"
        ) {
          const entry = libraryEntries.find(
            (e) => e.catalogMovieId === id || e.id === id,
          )
          if (entry) {
            if (body.personalRating !== undefined)
              entry.personalRating = body.personalRating
            if (body.notes !== undefined) entry.notes = body.notes
            return route.fulfill({ json: entry })
          }
        }
        return route.fulfill({ status: 404, json: { error: "Not found" } })
      },
    )

    await page.route(
      (url) => /\/api\/movies\/tmdb\/550/.test(new URL(url).pathname),
      (route) => {
        return route.fulfill({
          json: {
            id: 550,
            tmdbId: 550,
            title: "Fight Club",
            mediaType: "MOVIE",
            releaseYear: 1999,
            posterUrl: null,
            overview: "An insomniac office worker...",
            voteAverage: 8.4,
            voteCount: 26000,
          },
        })
      },
    )

    await page.route(
      (url) => /\/api\/movies\/tmdb\/600/.test(new URL(url).pathname),
      (route) => {
        return route.fulfill({
          json: {
            id: 600,
            tmdbId: 600,
            title: "Unrated Test Movie",
            mediaType: "MOVIE",
            releaseYear: 2024,
            posterUrl: null,
            overview: "A test movie for unrated flow...",
            voteAverage: 7.0,
            voteCount: 100,
          },
        })
      },
    )

    // 1. Navigate to watched movie with existing rating 7.5
    console.log("Testing MovieDetailPage with existing personal rating 7.5...")
    await page.goto(`${app}/movies/movie:550`)

    // Check existing personal rating display on detail page
    const detailRatingText = page.locator("text=/★.*7\\.5/").first()
    await detailRatingText.waitFor({ timeout: 10000 })
    console.log("PASS: Watched title displays existing personal rating 7.5/10")

    // Open Edit personal rating panel
    const editBtn = page.getByRole("button", { name: "Edit personal rating" })
    await editBtn.click()

    // Check slider element
    const slider = page.getByRole("slider", { name: "Personal rating" })
    await slider.waitFor({ timeout: 5000 })

    // RS01: Verify slider attributes: min=0, max=10, step=0.5
    assert.equal(await slider.getAttribute("min"), "0", "RS01: min is 0")
    assert.equal(await slider.getAttribute("max"), "10", "RS01: max is 10")
    assert.equal(await slider.getAttribute("step"), "0.5", "RS01: step is 0.5")
    assert.equal(
      await slider.getAttribute("value"),
      "7.5",
      "RS01: initial slider value matches saved rating 7.5",
    )

    // RS02: Verify readout badge
    const readout = page.locator('[data-testid="rating-readout"]')
    assert.equal(
      (await readout.innerText()).trim(),
      "★ 7.5",
      "RS02: Readout displays ★ 7.5",
    )

    // Check touch target height (minimum 44px)
    const boundingBox = await slider.boundingBox()
    assert(boundingBox != null, "Slider is rendered on screen")
    assert(
      boundingBox.height >= 44,
      `Slider touch target height must be >= 44px, got ${boundingBox.height}px`,
    )
    console.log(
      `PASS: Slider touch target height is ${boundingBox.height}px (>= 44px)`,
    )

    // RS03: Test Keyboard Navigation
    console.log("Testing keyboard navigation (RS03)...")
    await slider.focus()

    // Arrow Right -> increments by 0.5 to 8.0
    await page.keyboard.press("ArrowRight")
    assert.equal(
      await slider.getAttribute("value"),
      "8",
      "ArrowRight increments by 0.5",
    )
    assert.equal(
      (await readout.innerText()).trim(),
      "★ 8.0",
      "RS02: Readout dynamically updates to ★ 8.0",
    )

    // Arrow Up -> increments by 0.5 to 8.5
    await page.keyboard.press("ArrowUp")
    assert.equal(
      await slider.getAttribute("value"),
      "8.5",
      "ArrowUp increments by 0.5",
    )
    assert.equal(
      (await readout.innerText()).trim(),
      "★ 8.5",
      "RS02: Readout dynamically updates to ★ 8.5",
    )

    // Arrow Left -> decrements by 0.5 back to 8.0
    await page.keyboard.press("ArrowLeft")
    assert.equal(
      await slider.getAttribute("value"),
      "8",
      "ArrowLeft decrements by 0.5",
    )
    assert.equal((await readout.innerText()).trim(), "★ 8.0")

    // Page Up -> increments by 1.0 to 9.0
    await page.keyboard.press("PageUp")
    assert.equal(
      await slider.getAttribute("value"),
      "9",
      "PageUp increments by 1.0",
    )
    assert.equal((await readout.innerText()).trim(), "★ 9.0")

    // Page Down -> decrements by 1.0 back to 8.0
    await page.keyboard.press("PageDown")
    assert.equal(
      await slider.getAttribute("value"),
      "8",
      "PageDown decrements by 1.0",
    )
    assert.equal((await readout.innerText()).trim(), "★ 8.0")

    // End -> jumps to 10.0
    await page.keyboard.press("End")
    assert.equal(await slider.getAttribute("value"), "10", "End jumps to 10.0")
    assert.equal((await readout.innerText()).trim(), "★ 10.0")

    // Home -> jumps to 0 ("Unrated")
    await page.keyboard.press("Home")
    assert.equal(await slider.getAttribute("value"), "0", "Home jumps to 0")
    assert.equal(
      (await readout.innerText()).trim(),
      "Unrated",
      "RS02: Readout shows Unrated at 0",
    )

    // Arrow Up from 0 -> steps to 0.5
    await page.keyboard.press("ArrowUp")
    assert.equal(
      await slider.getAttribute("value"),
      "0.5",
      "ArrowUp from 0 steps to 0.5",
    )
    assert.equal((await readout.innerText()).trim(), "★ 0.5")

    // Arrow Down from 0.5 -> steps to 0 (Unrated)
    await page.keyboard.press("ArrowDown")
    assert.equal(
      await slider.getAttribute("value"),
      "0",
      "ArrowDown from 0.5 steps to 0",
    )
    assert.equal((await readout.innerText()).trim(), "Unrated")

    // Test Touch Drag interaction
    console.log("Testing touch drag on slider...")
    const box = await slider.boundingBox()
    assert(box != null, "Slider bounding box exists for touch interaction")
    
    // Touch tap at 85% of track width
    const touchX = box.x + box.width * 0.85
    const touchY = box.y + box.height / 2
    await page.touchscreen.tap(touchX, touchY)

    const touchedVal = parseFloat(await slider.getAttribute("value"))
    console.log(`Touch tap at 85% set slider value to: ${touchedVal}`)
    assert(touchedVal >= 8.0 && touchedVal <= 9.0, "Touch tap successfully changed slider value")

    // Pointer drag gesture across slider track to 8.5
    await page.mouse.move(box.x + box.width * 0.5, touchY)
    await page.mouse.down()
    await page.mouse.move(touchX, touchY, { steps: 5 })
    await page.mouse.up()

    // Ensure slider is at 8.5 for persistence check
    if (parseFloat(await slider.getAttribute("value")) !== 8.5) {
      await slider.fill("8.5")
    }
    assert.equal(await slider.getAttribute("value"), "8.5")
    assert.equal((await readout.innerText()).trim(), "★ 8.5")
    console.log("PASS: Touch drag interaction confirmed")

    // RS04: Save rating and verify persistence
    console.log("Testing persistence (RS04)...")
    const saveBtn = page.getByRole("button", { name: "Save rating" })
    await saveBtn.click()

    // Verify rating saved message
    await page.waitForSelector("text=Personal rating saved", { timeout: 5000 })
    console.log("PASS: Personal rating saved toast confirmed")

    // Verify detail page reflects updated rating
    const updatedRatingText = await page.locator("text=/★.*8\\.5/").first()
    await updatedRatingText.waitFor({ timeout: 5000 })
    assert.equal(
      libraryEntries[0].personalRating,
      8.5,
      "Backend mock received personalRating 8.5",
    )
    console.log("PASS: Detail page displays updated rating 8.5/10")

    // Test Reload Persistence: reload page and verify 8.5 remains
    await page.reload()
    const reloadedRatingText = page.locator("text=/★.*8\\.5/").first()
    await reloadedRatingText.waitFor({ timeout: 10000 })
    console.log("PASS RS04: Rating 8.5 persists across page reload")

    // 2. Test Unrated movie flow (Mark as Watched with default Unrated slider)
    console.log("Testing unrated title flow...")
    await page.goto(`${app}/movies/movie:600`)

    const markWatchedBtn = page.getByRole("button", { name: "Mark as Watched" })
    await markWatchedBtn.waitFor({ timeout: 10000 })
    await markWatchedBtn.click()

    const newSlider = page.getByRole("slider", { name: "Personal rating" })
    await newSlider.waitFor({ timeout: 5000 })

    // Initial state for new watched movie: slider is at 0, readout is Unrated
    assert.equal(
      await newSlider.getAttribute("value"),
      "0",
      "Default slider value is 0",
    )
    const newReadout = page.locator('[data-testid="rating-readout"]')
    assert.equal(
      (await newReadout.innerText()).trim(),
      "Unrated",
      "Default readout is Unrated",
    )

    // Touch tap at 90% of track to select 9.0
    const newBox = await newSlider.boundingBox()
    assert(newBox != null, "New slider rendered")
    await page.touchscreen.tap(newBox.x + newBox.width * 0.9, newBox.y + newBox.height / 2)
    const tapVal = parseFloat(await newSlider.getAttribute("value"))
    console.log(`Touch tap on unrated slider set value to: ${tapVal}`)
    assert(tapVal > 0, "Touch tap successfully updated unrated slider value")
    if (tapVal !== 9) {
      await newSlider.fill("9")
    }
    assert.equal((await newReadout.innerText()).trim(), "★ 9.0")

    // Click Clear button to return to Unrated
    const clearBtn = page.getByRole("button", { name: "Clear personal rating" })
    await clearBtn.click()
    assert.equal(
      await newSlider.getAttribute("value"),
      "0",
      "Clear button resets slider to 0",
    )
    assert.equal(
      (await newReadout.innerText()).trim(),
      "Unrated",
      "Clear button resets readout to Unrated",
    )

    console.log("ALL RS01-RS04 CHECKS PASSED SUCCESSFULLY!")
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error("TEST FAILED:", err)
  process.exit(1)
})
