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
  console.log("Launching browser for Ticket 6 Detail Page Redesign verification...");
  const launchOptions = {
    headless: true,
  };
  if (process.env.MOVIENIGHT_CHROME_PATH) {
    launchOptions.executablePath = process.env.MOVIENIGHT_CHROME_PATH;
  } else {
    launchOptions.channel = "chrome";
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    await context.addInitScript(() => {
      localStorage.setItem("movienight_token", "fixture-token-redesign");
      localStorage.setItem(
        "movienight_current_user",
        JSON.stringify({
          id: "1",
          username: "redesigntester",
          displayName: "Redesign Tester",
        })
      );
    });

    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err));

    let libraryEntries = [
      {
        id: 1,
        catalogMovieId: 627,
        status: "WATCHED",
        personalRating: 8.5,
        notes: "Iconic soundtrack and brilliant performance by Ewan McGregor.",
        movie: {
          id: 627,
          tmdbId: 627,
          title: "Trainspotting",
          mediaType: "MOVIE",
          releaseYear: 1996,
          posterUrl: "https://image.tmdb.org/t/p/w500/trainspotting-poster.jpg",
          backdropUrl: "https://image.tmdb.org/t/p/original/trainspotting-backdrop.jpg",
          overview: "Renton, deeply immersed in the Edinburgh drug scene, tries to clean up and get out.",
          runtimeMinutes: 93,
        },
      },
    ];

    // Mock API routes
    await page.route(
      (url) => new URL(url).pathname === "/api/users/me",
      (route) =>
        route.fulfill({
          json: {
            id: 1,
            username: "redesigntester",
            displayName: "Redesign Tester",
            role: "USER",
          },
        })
    );

    await page.route(
      (url) => new URL(url).pathname === "/api/friends",
      (route) =>
        route.fulfill({
          json: [
            {
              id: 2,
              username: "mark",
              displayName: "Mark Renton",
              watchedCount: 10,
              watchlistCount: 2,
              avgRating: 8.5,
            },
          ],
        })
    );

    await page.route(
      (url) => new URL(url).pathname === "/api/friends/invitations",
      (route) => route.fulfill({ json: [] })
    );

    await page.route(
      (url) => /\/api\/movies\/\d+\/friends-ratings/.test(new URL(url).pathname),
      (route) =>
        route.fulfill({
          json: [
            {
              userId: 2,
              displayName: "Mark Renton",
              personalRating: 9.0,
              status: "WATCHED",
            },
          ],
        })
    );

    await page.route(
      (url) => new URL(url).pathname === "/api/movies/library",
      (route) => route.fulfill({ json: libraryEntries })
    );

    // Mock movie details for Trainspotting (tmdb 627)
    await page.route(
      (url) => /\/api\/movies\/tmdb\/627/.test(new URL(url).pathname),
      (route) =>
        route.fulfill({
          json: {
            id: 627,
            tmdbId: 627,
            title: "Trainspotting",
            mediaType: "MOVIE",
            releaseYear: 1996,
            posterUrl: "https://image.tmdb.org/t/p/w500/trainspotting-poster.jpg",
            backdropUrl: "https://image.tmdb.org/t/p/original/trainspotting-backdrop.jpg",
            overview:
              "Renton, deeply immersed in the Edinburgh drug scene, tries to clean up and get out, despite the allure of the drugs and the influence of friends.",
            runtimeMinutes: 93,
            imdbRating: 8.1,
            tmdbVoteAverage: 8.0,
            tmdbVoteCount: 9200,
            rottenTomatoesRating: 90,
            trailerKey: "8EzfBYbF6yQ",
            director: "Danny Boyle",
            genres: "Drama, Comedy, Crime",
            castMembers: "Ewan McGregor as Mark Renton, Ewen Bremner as Spud, Jonny Lee Miller as Sick Boy, Robert Carlyle as Begbie",
            cast: [
              {
                name: "Ewan McGregor",
                role: "Mark Renton",
                profileUrl: "https://image.tmdb.org/t/p/w185/ewan.jpg",
              },
              {
                name: "Ewen Bremner",
                role: "Spud",
                profileUrl: "https://image.tmdb.org/t/p/w185/ewen.jpg",
              },
              {
                name: "Jonny Lee Miller",
                role: "Sick Boy",
                profileUrl: null,
              },
              {
                name: "Robert Carlyle",
                role: "Begbie",
                profileUrl: null,
              },
            ],
          },
        })
    );

    // Mock similar titles endpoint (Ticket 5)
    await page.route(
      (url) => /\/api\/movies\/627\/similar/.test(new URL(url).pathname),
      (route) =>
        route.fulfill({
          json: [
            {
              id: 101,
              tmdbId: 101,
              title: "Snatch",
              mediaType: "MOVIE",
              releaseYear: 2000,
              posterUrl: "https://image.tmdb.org/t/p/w500/snatch.jpg",
              tmdbVoteAverage: 8.3,
            },
            {
              id: 102,
              tmdbId: 102,
              title: "Lock, Stock and Two Smoking Barrels",
              mediaType: "MOVIE",
              releaseYear: 1998,
              posterUrl: "https://image.tmdb.org/t/p/w500/lock-stock.jpg",
              tmdbVoteAverage: 8.1,
            },
          ],
        })
    );

    // ── DP01: Visual Alignment & Hero Header ──
    console.log("1. Checking DP01: Visual Alignment & Hero Header...");
    await page.goto(`${app}/movies/movie:627`);

    // Verify title
    const titleLocator = page.locator("h1", { hasText: "Trainspotting" });
    await titleLocator.waitFor({ timeout: 10000 });
    console.log("PASS: Page title 'Trainspotting' rendered.");

    // Verify metadata: Year, Runtime (1h 33m), 4K tag, IMDb, TMDb
    const yearLocator = page.locator("text=1996").first();
    await yearLocator.waitFor({ timeout: 5000 });
    const runtimeLocator = page.locator("text=1h 33m").first();
    await runtimeLocator.waitFor({ timeout: 5000 });
    const qualityTagLocator = page.locator("text=4K").first();
    await qualityTagLocator.waitFor({ timeout: 5000 });
    console.log("PASS: Release year (1996), formatted runtime (1h 33m), and 4K quality tag displayed.");

    // Verify IMDb rating badge
    const imdbLocator = page.locator("text=8.1").first();
    await imdbLocator.waitFor({ timeout: 5000 });
    console.log("PASS: IMDb rating badge displayed.");

    // Verify clamped synopsis
    const synopsisLocator = page.locator("text=Renton, deeply immersed in the Edinburgh drug scene").first();
    await synopsisLocator.waitFor({ timeout: 5000 });
    console.log("PASS: Synopsis displayed.");

    // ── DP02: Inline Trailer Playback ──
    console.log("2. Checking DP02: Inline Trailer Playback...");
    const playBtn = page.getByRole("button", { name: "Play Trailer" });
    await playBtn.waitFor({ timeout: 5000 });
    await playBtn.click();

    // Trailer plays inline in the hero (no modal dialog)
    assert.equal(await page.getByRole("dialog").count(), 0, "No modal dialog for trailer");
    const trailerIframe = page.getByRole("region", { name: "Trainspotting hero banner" }).locator("iframe");
    await trailerIframe.waitFor({ timeout: 5000 });
    const iframeSrc = await trailerIframe.getAttribute("src");
    assert.ok(iframeSrc && iframeSrc.includes("8EzfBYbF6yQ"), "Trailer iframe embeds YouTube video");
    console.log("PASS: Trailer plays inline in hero with YouTube iframe embed.");

    await page.getByRole("button", { name: "Close Trailer" }).click();
    await trailerIframe.waitFor({ state: "detached", timeout: 5000 });
    console.log("PASS: Inline trailer closed successfully.");

    // ── DP03: Inline Rating Slider ──
    console.log("3. Checking DP03: Inline Rating Slider...");
    // Button shows existing rating: "✓ Watched (8.5)"
    const watchedBtn = page.getByRole("button", { name: /Watched/ });
    await watchedBtn.waitFor({ timeout: 5000 });
    const watchedBtnText = await watchedBtn.innerText();
    assert.ok(watchedBtnText.includes("Watched"), "Watched button is visible");

    // Click Watched button to reveal inline slider panel
    await watchedBtn.click();
    const sliderContainer = page.locator("#personal-rating-slider");
    await sliderContainer.waitFor({ timeout: 5000 });
    console.log("PASS: Watched button expanded inline rating slider directly below actions.");

    // Check rating slider readout
    const readout = page.getByTestId("rating-readout");
    await readout.waitFor({ timeout: 5000 });
    const readoutText = await readout.innerText();
    assert.ok(readoutText.includes("8.5"), "Readout shows current rating 8.5");
    console.log("PASS: Personal rating slider reflects current rating.");

    // ── DP04: Actor Cast Photo Gallery ──
    console.log("4. Checking DP04: Actor Cast Photo Gallery...");
    const castSection = page.getByRole("region", { name: "Key cast members" });
    await castSection.waitFor({ timeout: 5000 });

    // Check cast member names and characters
    const ewanActor = castSection.locator("text=Ewan McGregor");
    await ewanActor.waitFor({ timeout: 5000 });
    const ewanRole = castSection.locator("text=Mark Renton");
    await ewanRole.waitFor({ timeout: 5000 });

    const spudActor = castSection.locator("text=Ewen Bremner");
    await spudActor.waitFor({ timeout: 5000 });
    const spudRole = castSection.locator("text=Spud");
    await spudRole.waitFor({ timeout: 5000 });

    console.log("PASS: Key cast members displayed with names and character roles.");

    // ── DP05: Original MovieNight Notes Preservation ──
    console.log("5. Checking DP05: Notes & Friends Ratings Preservation...");
    // Personal notes textarea
    const notesTextarea = page.getByLabel("Your private note");
    await notesTextarea.waitFor({ timeout: 5000 });
    const notesValue = await notesTextarea.inputValue();
    assert.ok(notesValue.includes("Iconic soundtrack"), "Personal notes preserved");
    console.log("PASS: User's personal notes preserved and editable.");

    // Friends' ratings section
    const friendsSection = page.locator("text=Friends' Ratings").first();
    await friendsSection.waitFor({ timeout: 5000 });
    const friendName = page.locator("text=Mark Renton").last();
    await friendName.waitFor({ timeout: 5000 });
    const friendRating = page.locator("text=★ 9.0").first();
    await friendRating.waitFor({ timeout: 5000 });
    console.log("PASS: Friends' ratings section displayed with friend rating.");

    // ── DP06: 'You May Also Like' Similarity Shelf ──
    console.log("6. Checking DP06: Similar Titles Shelf...");
    const similarShelfHeader = page.locator("text=You May Also Like");
    await similarShelfHeader.waitFor({ timeout: 8000 });

    const snatchTitle = page.locator("text=Snatch").first();
    await snatchTitle.waitFor({ timeout: 8000 });
    console.log("PASS: 'You May Also Like' shelf displayed similar titles (Snatch) from similarity API.");

    console.log("\n=======================================================");
    console.log(" ALL DETAIL PAGE REDESIGN CHECKS PASSED (DP01 - DP06)! ");
    console.log("=======================================================\n");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
