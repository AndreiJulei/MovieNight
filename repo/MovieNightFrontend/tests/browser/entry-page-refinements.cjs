// Browser verification for Ticket 6: Movie Detail Page Redesign (DP01-DP06).
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) {
    return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium;
  }
  try {
    return require("playwright").chromium;
  } catch {
    const npxDir = path.join(os.homedir(), ".npm", "_npx");
    if (fs.existsSync(npxDir)) {
      const entries = fs.readdirSync(npxDir);
      for (const entry of entries) {
        const candidate = path.join(npxDir, entry, "node_modules", "playwright");
        if (fs.existsSync(candidate)) {
          return require(candidate).chromium;
        }
      }
    }
    throw new Error("Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.");
  }
}

const chromium = loadChromium();
const app = process.env.MOVIENIGHT_BROWSER_URL || "http://127.0.0.1:8443";

async function main() {
  console.log("Launching browser for Ticket 8 entry page refinements...");
  const launchOptions = { headless: true };
  if (process.env.MOVIENIGHT_CHROME_PATH) launchOptions.executablePath = process.env.MOVIENIGHT_CHROME_PATH;
  else launchOptions.channel = "chrome";

  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem("movienight_token", "fixture-token-ticket8");
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({ id: "1", username: "t8", displayName: "Ticket Eight" }),
      );
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err));

    let library = [
      {
        id: 1,
        catalogMovieId: 627,
        status: "WATCHED",
        personalRating: 8.5,
        notes: "",
        movie: { id: 627, tmdbId: 627, title: "Trainspotting", mediaType: "MOVIE", releaseYear: 1996 },
      },
    ];
    const pathIs = (re) => (url) => re.test(new URL(url).pathname);

    await page.route(pathIs(/^\/api\/users\/me$/), (r) =>
      r.fulfill({ json: { id: 1, username: "t8", displayName: "Ticket Eight", role: "USER" } }));
    await page.route(pathIs(/^\/api\/friends(\/invitations)?$/), (r) => r.fulfill({ json: [] }));
    await page.route(pathIs(/^\/api\/movies\/library$/), (r) => r.fulfill({ json: library }));
    await page.route(pathIs(/^\/api\/movies\/library\/\d+$/), (r) => {
      if (r.request().method() === "DELETE") {
        library = [];
        return r.fulfill({ json: {} });
      }
      return r.continue();
    });
    await page.route(pathIs(/\/api\/movies\/\d+\/similar/), (r) =>
      r.fulfill({ json: [{ id: 101, tmdbId: 101, title: "Snatch", mediaType: "MOVIE", releaseYear: 2000 }] }));
    await page.route(pathIs(/\/api\/movies\/tmdb\/627/), (r) =>
      r.fulfill({
        json: {
          id: 627, tmdbId: 627, title: "Trainspotting", mediaType: "MOVIE", releaseYear: 1996,
          logoUrl: "https://image.tmdb.org/t/p/w500/logo-ok.png",
          backdropUrl: "https://image.tmdb.org/t/p/original/b.jpg",
          overview: "Renton tries to clean up.", runtimeMinutes: 93, imdbRating: 8.1,
          rottenTomatoesRating: 90, trailerKey: "8EzfBYbF6yQ", genres: "Drama",
          cast: [{ name: "Ewan McGregor", role: "Mark Renton", profileUrl: "https://image.tmdb.org/t/p/w185/e.jpg" }],
        },
      }));
    // Logo image fails to load -> typographic fallback (ET02)
    await page.route(/logo-ok\.png/, (r) => r.abort());

    await page.goto(`${app}/movies/movie:627`);
    const hero = page.getByRole("region", { name: "Trainspotting hero banner" });
    await hero.waitFor({ timeout: 10000 });

    // ET02 fallback: failed logo -> text heading
    await page.locator("h1", { hasText: "Trainspotting" }).waitFor({ timeout: 5000 });
    assert.equal(await hero.locator("h1 img").count(), 0, "Failed logo falls back to text");
    console.log("PASS ET02: logo load failure falls back to typographic title.");

    // ET08: scrims lighter, no brightness filter, no top scrim
    const backdropFilter = await hero.locator("img[aria-hidden='true']").first().evaluate((el) => getComputedStyle(el).filter);
    assert.equal(backdropFilter, "none", "Backdrop has no brightness filter");
    assert.equal(await hero.locator(".h-28.bg-gradient-to-b").count(), 0, "No top scrim");
    console.log("PASS ET08: hero backdrop has no brightness filter or top scrim.");

    // ET07: squircle cast cards
    const castCard = page.getByRole("region", { name: "Key cast members" }).locator("div.aspect-\\[3\\/4\\]").first();
    await castCard.waitFor({ timeout: 5000 });
    const box = await castCard.boundingBox();
    assert.ok(box.height > box.width, "Cast photo is portrait");
    const radius = await castCard.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    assert.ok(radius > 0 && radius < box.width / 2, "Cast photo is rounded-rect, not circle");
    console.log("PASS ET07: cast cards are portrait squircles.");

    // Actions sit below the hero banner
    const heroBox = await hero.boundingBox();
    const playBox = await page.getByRole("button", { name: "Play Trailer" }).boundingBox();
    assert.ok(playBox.y >= heroBox.y + heroBox.height - 1, "Action buttons are below the hero");
    // ET01: inline trailer
    await page.getByRole("button", { name: "Play Trailer" }).click();
    assert.equal(await page.getByRole("button", { name: "Play Trailer" }).count(), 0, "Play button turned into Close");
    const iframe = hero.locator("iframe");
    await iframe.waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole("dialog").count(), 0, "No modal dialog");
    await page.waitForTimeout(700);
    const detailsOpacity = await page.getByTestId("hero-details").evaluate((el) => getComputedStyle(el).opacity);
    assert.equal(detailsOpacity, "0", "Hero details fade out while trailer plays");
    await page.getByRole("button", { name: "Close Trailer" }).click();
    await iframe.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(700);
    assert.equal(
      await page.getByTestId("hero-details").evaluate((el) => getComputedStyle(el).opacity),
      "1",
      "Hero details return after closing trailer",
    );
    console.log("PASS ET01: trailer plays inline and can be closed.");

    // ET04: shelf header + subtitle
    await page.locator("text=Based on community similarity patterns").waitFor({ timeout: 8000 });
    const shelf = page.getByRole("region", { name: "Similar movie recommendations" });
    const cols = await shelf.locator("div.grid").evaluate((el) => getComputedStyle(el).display);
    assert.equal(cols, "grid", "Recommendations use the compact wrapped grid");
    await page.getByRole("button", { name: "Reload You May Also Like list" }).waitFor({ timeout: 5000 });
    if (process.env.MOVIENIGHT_SCREENSHOT_DIR) {
      await page.getByRole("region", { name: "Similar movie recommendations" }).screenshot({ path: process.env.MOVIENIGHT_SCREENSHOT_DIR + "/shelf.png" });
    }
    console.log("PASS ET04: shelf has Explore-style header and subtitle.");

    // ET05: removal keeps user on detail page
    await page.getByRole("button", { name: "Remove from library" }).click();
    await page.getByRole("button", { name: "Yes, remove" }).click();
    await page.getByRole("button", { name: "Mark as Watched" }).waitFor({ timeout: 5000 });
    assert.ok(new URL(page.url()).pathname.startsWith("/movies/"), "Still on the detail page");
    console.log("PASS ET05: removal stays on detail page and resets actions.");

    console.log("\nALL TICKET 8 BROWSER CHECKS PASSED\n");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
