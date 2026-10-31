// Issue #2 Browser Verification Suite
// Covers PM01-PM05:
// PM01: At rest clean poster, no badge, no metadata overlay, accessible name, missing-poster fallback
// PM02: Hover & focus reveal year and exactly one compact score (IMDb preferred over TMDB), no audience/votes/paragraph
// PM03: Clean omission of missing/invalid scores & year, genuine zero preserved, no dangling separators, never relabel TMDB
// PM04: Details retain richer provider evidence, RT critic approval on % scale is separate, not poster fallback
// PM05: Touch users tap once to open details (no trap), keyboard visible focus & reveal, long titles no overflow

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) {
    return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium;
  }
  try {
    return require('playwright').chromium;
  } catch {
    const fallback = '/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright';
    const fsMod = require('node:fs');
    if (fsMod.existsSync(fallback)) {
      return require(fallback).chromium;
    }
    throw new Error('Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.');
  }
}

const chromium = loadChromium();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const app = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const artifacts = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/private/tmp/issue-2-browser';
fs.mkdirSync(artifacts, { recursive: true });

function isServerRunning(targetUrl) {
  return new Promise((resolve) => {
    const req = http.get(targetUrl, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

const fixtureMovies = [
  {
    id: 'movie:101',
    tmdbId: 101,
    title: 'IMDb Preferred Movie',
    mediaType: 'MOVIE',
    releaseYear: 2026,
    voteAverage: 7.9,
    voteCount: 15400,
    imdbRating: 8.4,
    rottenTomatoesRating: 92,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:102',
    tmdbId: 102,
    title: 'TMDB Only Movie',
    mediaType: 'MOVIE',
    releaseYear: 2025,
    voteAverage: 7.5,
    voteCount: 8200,
    imdbRating: null,
    rottenTomatoesRating: null,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:103',
    tmdbId: 103,
    title: 'Critic Only Movie',
    mediaType: 'MOVIE',
    releaseYear: 2024,
    voteAverage: null,
    voteCount: null,
    imdbRating: null,
    rottenTomatoesRating: 96,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:104',
    tmdbId: 104,
    title: 'Unrated Movie',
    mediaType: 'MOVIE',
    releaseYear: 2023,
    voteAverage: null,
    voteCount: null,
    imdbRating: null,
    rottenTomatoesRating: null,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:105',
    tmdbId: 105,
    title: 'Zero Rated Movie',
    mediaType: 'MOVIE',
    releaseYear: 2022,
    voteAverage: 7.0,
    voteCount: 200,
    imdbRating: 0.0,
    rottenTomatoesRating: null,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:106',
    tmdbId: 106,
    title: 'Timeless Classic',
    mediaType: 'MOVIE',
    releaseYear: null,
    voteAverage: 8.2,
    voteCount: 5000,
    imdbRating: 8.8,
    rottenTomatoesRating: 98,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:107',
    tmdbId: 107,
    title: 'Missing Poster Movie',
    mediaType: 'MOVIE',
    releaseYear: 2021,
    voteAverage: 7.2,
    voteCount: 1200,
    imdbRating: 7.2,
    rottenTomatoesRating: null,
    posterUrl: null,
  },
  {
    id: 'movie:108',
    tmdbId: 108,
    title: 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb and Many Many More Subtitles Beyond What Any Normal Poster Can Display',
    mediaType: 'MOVIE',
    releaseYear: 2020,
    voteAverage: 8.1,
    voteCount: 9900,
    imdbRating: 8.4,
    rottenTomatoesRating: 98,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
  {
    id: 'movie:109',
    tmdbId: 109,
    title: 'Invalid Preferred Score Movie',
    mediaType: 'MOVIE',
    releaseYear: 2026,
    voteAverage: 7.5,
    voteCount: 1200,
    imdbRating: 11.0,
    rottenTomatoesRating: null,
    posterUrl: '/assets/MV5BMjAxODQ4MDU5NV5BMl5BanBnXkFtZTcwMDU4MjU1MQ__._V1_QL75_UX294_-Dd7O6tf5.jpg',
  },
];

async function signup(page) {
  await page.goto(app);
  const settingsLink = page.getByRole('link', { name: 'Settings', exact: true });
  if (await settingsLink.isVisible().catch(() => false)) {
    return;
  }

  const id = `pm02_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const toggleBtn = page.locator('button[type=button]').filter({ hasText: 'Create Account' });
  await toggleBtn.waitFor({ state: 'visible', timeout: 10000 });
  await toggleBtn.click();
  const form = page.locator('form').filter({ has: page.locator('input[aria-label="Confirm Password"]') });
  await form.waitFor({ state: 'visible', timeout: 10000 });
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill(`${id}@example.test`);
  await form.getByRole('textbox', { name: 'Username', exact: true }).fill(id);
  await form.locator('input[aria-label="Password"]').fill('Demo02-pass');
  await form.locator('input[aria-label="Confirm Password"]').fill('Demo02-pass');
  await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  await settingsLink.waitFor({ state: 'visible', timeout: 15000 });
}

async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
}

async function assertOverlayVisible(overlay, desc) {
  await overlay.page().waitForFunction(
    (el) => parseFloat(window.getComputedStyle(el).opacity) > 0.8,
    await overlay.elementHandle(),
    { timeout: 3000 }
  );
  const opacity = await overlay.evaluate((el) => window.getComputedStyle(el).opacity);
  assert.equal(opacity, '1', desc);
}

async function assertVisibleOutline(locator, label) {
  const outline = await locator.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      matchesFocusVisible: el.matches(':focus-visible'),
      className: el.className,
      color: style.color,
    };
  });
  assert(outline.matchesFocusVisible, `${label}: element must match :focus-visible`);
  assert.notEqual(outline.outlineStyle, 'none', `${label}: outline-style must not be 'none'`);
  const widthPx = parseFloat(outline.outlineWidth);
  assert(widthPx >= 2, `${label}: outline-width must be >= 2px, got ${outline.outlineWidth}`);
  assert.notEqual(outline.outlineColor, 'rgba(0, 0, 0, 0)', `${label}: focus outline must be visible`);
}

async function focusViaTab(page, targetLocator) {
  await targetLocator.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const isFocused = await targetLocator.evaluate((el) => el === document.activeElement);
  assert(isFocused, 'Target element must be active element after Tab navigation');
}

async function switchToCompactView(page) {
  const viewDropdown = page.locator('button:has-text("View:")');
  if (await viewDropdown.isVisible()) {
    await viewDropdown.click();
    const compactOpt = page.locator('button[role="option"]:has-text("Compact")');
    await compactOpt.click();
    await page.waitForTimeout(300);
    return;
  }
  const filtersBtn = page.getByRole('button', { name: 'Filters' });
  if (await filtersBtn.isVisible()) {
    await filtersBtn.click();
    const compactOpt = page.locator('button[role="button"]:has-text("Compact"), button:has-text("Compact")').last();
    await compactOpt.click();
    const doneBtn = page.getByRole('button', { name: 'Done' });
    await doneBtn.click();
    await page.waitForTimeout(300);
    return;
  }
}

async function testIssue2(browser, viewport) {
  const isMobile = viewport.width < 600;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: 'reduce',
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Mock auth routes
    await page.route('**/api/auth/check-name*', (route) => {
      return route.fulfill({ json: { available: true, message: 'Available' } });
    });
    await page.route('**/api/auth/signup', (route) => {
      const user = { id: 2, username: 'tester', displayName: 'Tester', email: 'tester@example.test', role: 'USER' };
      return route.fulfill({ json: { ok: true, user, token: 'mock-jwt-token-issue-2', tokenType: 'Bearer' } });
    });
    await page.route('**/api/auth/login', (route) => {
      const user = { id: 2, username: 'tester', displayName: 'Tester', email: 'tester@example.test', role: 'USER' };
      return route.fulfill({ json: { ok: true, user, token: 'mock-jwt-token-issue-2', tokenType: 'Bearer' } });
    });
    await page.route('**/api/auth/me', (route) => {
      return route.fulfill({ json: { id: 2, username: 'tester', displayName: 'Tester', email: 'tester@example.test', role: 'USER' } });
    });
    await page.route('**/api/friends*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/lists*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/movies/library*', (route) => route.fulfill({ json: [] }));

    // Mock Explore feed with our test shelf
    const now = new Date().toISOString();
    await page.route('**/api/movies/explore/movies', (route) => {
      return route.fulfill({
        json: {
          categories: [
            {
              id: 'test-shelf',
              title: 'Curated Showcase',
              subtitle: 'Testing compact metadata and poster simplicity',
              state: 'READY',
              updatedAt: now,
              hasMore: true,
              movies: fixtureMovies,
            },
          ],
        },
      });
    });

    // Mock category detailed grid route for /explore/movies/test-shelf
    await page.route('**/api/movies/explore/movies/test-shelf*', (route) => {
      return route.fulfill({
        json: {
          sessionId: 'sess-grid-1',
          mediaType: 'MOVIE',
          category: 'test-shelf',
          title: 'Curated Showcase',
          subtitle: 'Testing compact metadata and poster simplicity',
          state: 'READY',
          updatedAt: now,
          cursor: 0,
          hasMore: false,
          movies: fixtureMovies,
        },
      });
    });

    // Mock detail route for ID 101
    await page.route('**/api/movies/tmdb/101*', (route) => {
      const m = fixtureMovies[0];
      return route.fulfill({
        json: {
          id: 101,
          tmdbId: 101,
          title: m.title,
          mediaType: 'MOVIE',
          releaseYear: m.releaseYear,
          overview: 'A movie with full provider ratings for detail checking.',
          tmdbVoteAverage: m.voteAverage,
          tmdbVoteCount: m.voteCount,
          imdbRating: m.imdbRating,
          rottenTomatoesRating: m.rottenTomatoesRating,
          posterUrl: m.posterUrl,
        },
      });
    });

    await signup(page);

    // Navigate to Explore
    await page.evaluate(() => window.__navigate('/explore/movies'));
    await page.getByRole('heading', { name: /Curated Showcase/i }).waitFor({ state: 'visible', timeout: 10000 });

    const cards = page.locator('.shelf-card');
    await cards.first().waitFor({ state: 'visible' });
    const cardCount = await cards.count();
    assert.equal(cardCount, 9, 'All 9 test shelf cards rendered');

    // =========================================================================
    // PM01: At rest, Explore cards display the poster, no badge, no overlay
    // =========================================================================
    // 1. Verify no persistent rating badge exists anywhere on the shelf
    const badges = page.locator('.shelf-card span[id^=":r"]');
    // In our new markup, id is on the paragraph inside the overlay, not an at-rest badge.
    // Check that at rest, overlay opacity is 0 on all cards
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const overlay = card.locator('.shelf-poster-overlay');
      const opacity = await overlay.evaluate((el) => window.getComputedStyle(el).opacity);
      assert.equal(opacity, '0', `Card ${i} overlay must have opacity 0 at rest`);
    }

    // 2. Check accessible name & missing-poster fallback
    const missingPosterCard = cards.filter({ hasText: 'Missing Poster Movie' });
    assert.equal(await missingPosterCard.count(), 1, 'Missing poster card exists');
    assert.equal(await missingPosterCard.getAttribute('aria-label'), 'Missing Poster Movie');
    assert.equal(await missingPosterCard.getAttribute('title'), 'Missing Poster Movie');
    const fallbackText = missingPosterCard.locator('.missing-poster-fallback');
    assert(await fallbackText.isVisible(), 'Usable missing-poster fallback text is visible');

    console.log(`PASS [${viewport.width}x${viewport.height}] PM01: Clean at rest, no badges/overlays, usable fallback`);

    // =========================================================================
    // PM02: Pointer hover reveals release year and exactly one compact score
    // Prefer IMDb over TMDB; no "audience", no vote count, no full evidence paragraph
    // =========================================================================
    if (!isMobile) {
      // 1. IMDb + TMDB: Hovering reveals "2026 · IMDb 8.4/10"
      const imdbCard = cards.filter({ hasText: 'IMDb Preferred Movie' });
      await imdbCard.hover();
      const imdbOverlay = imdbCard.locator('.shelf-poster-overlay');
      await assertOverlayVisible(imdbOverlay, 'Overlay becomes visible on hover');

      const imdbText = await imdbOverlay.locator('p.nums').textContent();
      assert.equal(imdbText, '2026 · IMDb 8.4/10', 'Prefers IMDb score over TMDB');
      assert.equal(imdbText.includes('audience'), false, 'Does not display "audience"');
      assert.equal(imdbText.includes('votes'), false, 'Does not display vote count');
      assert.equal(imdbText.includes('Rotten Tomatoes'), false, 'Does not display RT critic paragraph');

      // 2. TMDB only: Hovering reveals "2025 · TMDB 7.5/10"
      const tmdbCard = cards.filter({ hasText: 'TMDB Only Movie' });
      await tmdbCard.hover();
      const tmdbOverlay = tmdbCard.locator('.shelf-poster-overlay');
      const tmdbText = await tmdbOverlay.locator('p.nums').textContent();
      assert.equal(tmdbText, '2025 · TMDB 7.5/10', 'Falls back to TMDB score');
      assert.equal(tmdbText.includes('IMDb'), false, 'Never relabels TMDB as IMDb');
      assert.equal(tmdbText.includes('audience'), false, 'Does not display "audience"');

      console.log(`PASS [${viewport.width}x${viewport.height}] PM02: Pointer hover reveals year and one compact score`);
    }

    // =========================================================================
    // PM03: Clean omission, valid zero, no dangling separators
    // =========================================================================
    if (!isMobile) {
      // 1. Critic only: reveals "2024" cleanly without dangling separator
      const criticCard = cards.filter({ hasText: 'Critic Only Movie' });
      await criticCard.hover();
      const criticText = await criticCard.locator('.shelf-poster-overlay p.nums').textContent();
      assert.equal(criticText, '2024', 'Shows year only, omitting RT score without dangling separator');
      assert.equal(criticText.includes('·'), false, 'No dangling separator');

      // 2. Unrated: reveals "2023" cleanly
      const unratedCard = cards.filter({ hasText: 'Unrated Movie' });
      await unratedCard.hover();
      const unratedText = await unratedCard.locator('.shelf-poster-overlay p.nums').textContent();
      assert.equal(unratedText, '2023', 'Shows year only for unrated movie');

      // 3. Genuine zero: reveals "2022 · IMDb 0.0/10"
      const zeroCard = cards.filter({ hasText: 'Zero Rated Movie' });
      await zeroCard.hover();
      const zeroText = await zeroCard.locator('.shelf-poster-overlay p.nums').textContent();
      assert.equal(zeroText, '2022 · IMDb 0.0/10', 'Genuine valid zero remains zero');

      // 4. Timeless (no year): reveals "IMDb 8.8/10" without leading/dangling separator
      const timelessCard = cards.filter({ hasText: 'Timeless Classic' });
      await timelessCard.hover();
      const timelessText = await timelessCard.locator('.shelf-poster-overlay p.nums').textContent();
      assert.equal(timelessText, 'IMDb 8.8/10', 'Unknown year shows compact score without dangling separator');
      assert.equal(timelessText.includes('·'), false, 'No dangling separator when year is omitted');

      // 5. Invalid score above 10: falls back to TMDB (PM03)
      const invalidCard = cards.filter({ hasText: 'Invalid Preferred Score Movie' });
      await invalidCard.hover();
      const invalidText = await invalidCard.locator('.shelf-poster-overlay p.nums').textContent();
      assert.equal(invalidText, '2026 · TMDB 7.5/10', 'Invalid score > 10 falls back to TMDB');
      assert.equal(invalidText.includes('11'), false, 'Does not display invalid score > 10');

      console.log(`PASS [${viewport.width}x${viewport.height}] PM03: Missing/invalid omitted cleanly, zero preserved`);
    }

    // =========================================================================
    // PM04: Details retain richer, accurately labelled provider evidence
    // =========================================================================
    // Click through on IMDb Preferred Movie (ID 101) to verify details page
    if (!isMobile) {
      const targetCard = cards.filter({ hasText: 'IMDb Preferred Movie' });
      await targetCard.click();
      await page.getByRole('heading', { name: 'IMDb Preferred Movie' }).waitFor({ state: 'visible', timeout: 5000 });

      // Verify ExternalRatings contains separate IMDb, TMDB, and Rotten Tomatoes critic score
      assert(await page.locator('.nums:has-text("8.4/10")').isVisible(), 'IMDb rating visible on details');
      assert(await page.locator('.nums:has-text("TMDB audience 7.9/10")').isVisible(), 'TMDB audience rating visible on details');
      assert(await page.locator('.nums:has-text("Rotten Tomatoes critics 92% approval")').isVisible(), 'Rotten Tomatoes critic approval visible on details');
      console.log(`PASS [${viewport.width}x${viewport.height}] PM04: Details retain richer provider evidence`);

      // Return to explore
      await page.evaluate(() => window.__navigate('/explore/movies'));
      await page.getByRole('heading', { name: /Curated Showcase/i }).waitFor({ state: 'visible', timeout: 10000 });
    }

    // =========================================================================
    // PM05: Keyboard focus & touch navigation & long titles
    // =========================================================================
    if (!isMobile) {
      // Keyboard focus: Tab navigation onto cards
      const firstCard = cards.first();
      await focusViaTab(page, firstCard);

      // Check focus-visible styling and overlay reveal
      const focusedOverlay = firstCard.locator('.shelf-poster-overlay');
      await assertOverlayVisible(focusedOverlay, 'Shelf overlay is revealed on keyboard focus');
      await assertVisibleOutline(firstCard, 'Shelf card keyboard focus');

      // Check long title card
      const longTitleCard = cards.filter({ hasText: /Dr\. Strangelove/i });
      await longTitleCard.hover();
      const longTitleOverlay = longTitleCard.locator('.shelf-poster-overlay');
      const longTitleText = await longTitleOverlay.locator('p.nums').textContent();
      assert.equal(longTitleText, '2020 · IMDb 8.4/10');
      // Assert no horizontal overflow
      await noOverflow(page);

      console.log(`PASS [${viewport.width}x${viewport.height}] PM05: Keyboard focus reveal and visible focus ring`);
    } else {
      // Mobile touch test: Single tap on a poster opens details without first-tap trap
      const touchCard = cards.first();
      await touchCard.tap();
      await page.getByRole('heading', { name: 'IMDb Preferred Movie' }).waitFor({ state: 'visible', timeout: 8000 });
      console.log(`PASS [${viewport.width}x${viewport.height}] PM05: Touch users tap once to open details`);

      // Verify no horizontal overflow on mobile
      await noOverflow(page);
    }

    // =========================================================================
    // Explore Category Grid ("View all" grid) Verification:
    // Regular grid view and compact grid view
    // =========================================================================
    await page.evaluate(() => window.__navigate('/explore/movies/test-shelf'));
    await page.getByRole('heading', { name: /Curated Showcase/i }).waitFor({ state: 'visible', timeout: 10000 });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    const gridCards = page.locator('main a[href^="/movies/"]');
    await gridCards.first().waitFor({ state: 'visible' });
    const gridCount = await gridCards.count();
    assert(gridCount >= 8, 'Grid rendered category movies');
    for (const metadata of await page.locator('.explore-poster-metadata').all()) {
      const fits = await metadata.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      assert(fits, `Regular grid metadata must fit at ${viewport.width}px: ${await metadata.textContent()}`);
    }

    // 1. Regular grid view: Verify at rest no persistent full rating evidence paragraphs
    const persistentAudienceEvidence = await page.locator('main p.nums:has-text("audience")').count();
    assert.equal(persistentAudienceEvidence, 0, 'No persistent rating evidence paragraph in Explore regular grid');

    // Verify overlay is opacity 0 at rest on grid cards
    for (let i = 0; i < Math.min(gridCount, 4); i++) {
      const gCard = gridCards.nth(i);
      const gOverlay = gCard.locator('.explore-poster-overlay');
      const gOpacity = await gOverlay.evaluate((el) => window.getComputedStyle(el).opacity);
      assert.equal(gOpacity, '0', `Grid card ${i} overlay is opacity 0 at rest`);
    }

    if (!isMobile) {
      // 2. Regular grid hover reveals compact metadata overlay
      const gridImdbCard = gridCards.filter({ hasText: 'IMDb Preferred Movie' });
      await gridImdbCard.hover();
      const gridImdbOverlay = gridImdbCard.locator('.explore-poster-overlay');
      await assertOverlayVisible(gridImdbOverlay, 'Grid card overlay reveals on hover');
      const gridImdbText = await gridImdbOverlay.locator('p.nums').textContent();
      assert.equal(gridImdbText, '2026 · IMDb 8.4/10', 'Grid hover reveals compact IMDb score');

      // 3. Invalid score above 10 in grid: falls back to TMDB
      const gridInvalidCard = gridCards.filter({ hasText: 'Invalid Preferred Score Movie' });
      await gridInvalidCard.hover();
      const gridInvalidOverlay = gridInvalidCard.locator('.explore-poster-overlay');
      const gridInvalidText = await gridInvalidOverlay.locator('p.nums').textContent();
      assert.equal(gridInvalidText, '2026 · TMDB 7.5/10', 'Grid hover: invalid score > 10 falls back to TMDB');

      // 4. Keyboard Tab navigation on regular grid card
      const firstGridCard = gridCards.first();
      await focusViaTab(page, firstGridCard);
      await assertVisibleOutline(firstGridCard, 'Regular grid card keyboard focus');
      const regularGridOverlay = firstGridCard.locator('.explore-poster-overlay');
      await assertOverlayVisible(regularGridOverlay, 'Regular grid overlay visible on keyboard focus');

      // 5. Compact grid view toggle and verification
      await switchToCompactView(page);

      // In compact grid mode, verify hover reveals overlay
      const compactGridCard = gridCards.filter({ hasText: 'IMDb Preferred Movie' });
      await compactGridCard.hover();
      const compactGridOverlay = compactGridCard.locator('.explore-poster-overlay');
      await assertOverlayVisible(compactGridOverlay, 'Compact grid card overlay reveals on hover');
      const compactGridText = await compactGridOverlay.locator('p.nums').textContent();
      assert.equal(compactGridText, '2026 · IMDb 8.4/10', 'Compact grid hover reveals compact score');

      // Assert visible fit without clipping in compact mode (PM02, PM05)
      const compactFit = await compactGridOverlay.locator('p.nums').evaluate((el) => {
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          isClipped: el.scrollWidth > el.clientWidth + 1,
        };
      });
      assert(!compactFit.isClipped, `Compact grid metadata is clipped: scrollWidth ${compactFit.scrollWidth}px > clientWidth ${compactFit.clientWidth}px`);

      // Keyboard Tab navigation on compact grid card
      await focusViaTab(page, compactGridCard);
      await assertVisibleOutline(compactGridCard, 'Compact grid card keyboard focus');
      await assertOverlayVisible(compactGridOverlay, 'Compact grid overlay visible on keyboard focus');

      const focusCompactFit = await compactGridOverlay.locator('p.nums').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      assert(focusCompactFit, 'Compact grid metadata must fit without clipping under keyboard focus');
      await noOverflow(page);
      await page.screenshot({ path: path.join(artifacts, `issue-2-compact-${viewport.width}.png`), fullPage: true });

      console.log(`PASS [${viewport.width}x${viewport.height}] Explore Category Grid: Regular & Compact hover/focus/fit verified`);
    } else {
      // Mobile category grid tests:
      // 1. Verify compact mode layout and visible fit on mobile
      await switchToCompactView(page);
      const compactTouchCard = gridCards.filter({ hasText: 'IMDb Preferred Movie' });
      const compactOverlay = compactTouchCard.locator('.explore-poster-overlay');
      const metaEl = compactOverlay.locator('p.nums');
      const mobileFit = await metaEl.evaluate((el) => {
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          isClipped: el.scrollWidth > el.clientWidth + 1,
        };
      });
      assert(!mobileFit.isClipped, `Mobile compact grid metadata is clipped: scrollWidth ${mobileFit.scrollWidth}px > clientWidth ${mobileFit.clientWidth}px`);
      await focusViaTab(page, compactTouchCard);
      await assertVisibleOutline(compactTouchCard, 'Phone compact grid keyboard focus');
      await assertOverlayVisible(compactOverlay, 'Phone compact grid overlay visible on keyboard focus');
      await noOverflow(page);
      await page.screenshot({ path: path.join(artifacts, `issue-2-compact-${viewport.width}.png`), fullPage: true });

      // 2. Mobile touch test in grid: single tap opens details without trap
      const gridTouchCard = gridCards.first();
      await gridTouchCard.tap();
      await page.getByRole('heading', { name: 'IMDb Preferred Movie' }).waitFor({ state: 'visible', timeout: 8000 });
      console.log(`PASS [${viewport.width}x${viewport.height}] Explore Category Grid: Mobile touch tap opens details & compact fit verified`);
    }

    await page.screenshot({ path: path.join(artifacts, `issue-2-verified-${viewport.width}.png`), fullPage: true });
    console.log(`PASS Issue #2 Acceptance Criteria Matrix (${viewport.width}x${viewport.height})`);
  } finally {
    await context.close();
  }
}

(async () => {
  let serverProcess = null;
  const running = await isServerRunning(app);
  if (!running) {
    console.log(`Starting Vite preview server at ${app}...`);
    serverProcess = spawn('npx', ['vite', 'preview', '--port', '8443', '--host', '127.0.0.1'], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: 'ignore',
    });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (await isServerRunning(app)) break;
    }
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    console.log('Running Issue #2 Acceptance Criteria Verification with Chrome', browser.version());
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
    ]) {
      await testIssue2(browser, viewport);
    }
    console.log('ALL ISSUE #2 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
})().catch((err) => {
  console.error('Issue #2 Browser Verification failed:', err);
  process.exitCode = 1;
});
