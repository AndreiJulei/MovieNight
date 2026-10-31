// Issue #1 Browser and Boundary Test Suite
// Covers LR01-LR06: First-open title details, partial availability, automatic read recovery,
// no routine refresh controls, session renewal on 410 with deduplication and labelled segments.
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
const artifacts = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/private/tmp/issue-1-browser';
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

function makeMovie(id, title, rating = 7.5, year = 2022, mediaType = 'MOVIE') {
  return {
    tmdbId: id,
    title,
    mediaType,
    releaseYear: year,
    releaseDate: `${year}-05-01`,
    voteAverage: rating,
    voteCount: 500,
    posterUrl: null,
  };
}

async function signup(page) {
  await page.goto(app);
  const settingsLink = page.getByRole('link', { name: 'Settings', exact: true });
  if (await settingsLink.isVisible().catch(() => false)) {
    return;
  }

  const id = `lr01${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const toggleBtn = page.locator('button[type=button]').filter({ hasText: 'Create Account' });
  await toggleBtn.waitFor({ state: 'visible', timeout: 10000 });
  await toggleBtn.click();
  const form = page.locator('form').filter({ has: page.locator('input[aria-label="Confirm Password"]') });
  await form.waitFor({ state: 'visible', timeout: 10000 });
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill(`${id}@example.test`);
  await form.getByRole('textbox', { name: 'Username', exact: true }).fill(id);
  await form.locator('input[aria-label="Password"]').fill('Demo01-pass');
  await form.locator('input[aria-label="Confirm Password"]').fill('Demo01-pass');
  await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  await settingsLink.waitFor({ state: 'visible', timeout: 15000 });
}

async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
}

async function testIssue1(browser, viewport) {
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
    page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));
    page.on('requestfailed', (req) => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));

    // Mock auth routes
    await page.route('**/api/auth/check-name*', (route) => {
      return route.fulfill({ json: { available: true, message: 'Available' } });
    });
    await page.route('**/api/auth/signup', (route) => {
      const user = { id: 1, username: 'demo', displayName: 'Demo User', email: 'demo@example.test', role: 'USER' };
      return route.fulfill({ json: { ok: true, user, token: 'mock-jwt-token', tokenType: 'Bearer' } });
    });
    await page.route('**/api/auth/login', (route) => {
      const user = { id: 1, username: 'demo', displayName: 'Demo User', email: 'demo@example.test', role: 'USER' };
      return route.fulfill({ json: { ok: true, user, token: 'mock-jwt-token', tokenType: 'Bearer' } });
    });
    await page.route('**/api/auth/me', (route) => {
      return route.fulfill({ json: { id: 1, username: 'demo', displayName: 'Demo User', email: 'demo@example.test', role: 'USER' } });
    });
    await page.route('**/api/friends*', (route) => {
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/lists*', (route) => {
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/suggestions*', (route) => {
      return route.fulfill({ json: { categories: [] } });
    });

    let libraryWriteCount = 0;
    let rebuildPostCount = 0;
    const libraryEntries = [];
    await page.route('**/api/**/refresh*', (route) => {
      if (route.request().method() === 'POST') {
        rebuildPostCount++;
      }
      return route.fulfill({ json: { categories: [] } });
    });

    await page.route('**/api/movies/library*', (route) => {
      if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
        libraryWriteCount++;
        const postData = route.request().postDataJSON() || {};
        const savedEntry = {
          id: 999,
          movie: {
            id: postData.catalogMovieId || 999,
            tmdbId: postData.tmdbId || 3001,
            mediaType: postData.mediaType || 'MOVIE',
            title: postData.title || 'Saved',
          },
          status: 'WATCHLIST',
        };
        libraryEntries.push(savedEntry);
        return route.fulfill({ json: savedEntry });
      }
      return route.fulfill({ json: libraryEntries });
    });

    await page.route('**/api/movies/explore/movies', (route) => {
      const now = new Date().toISOString();
      return route.fulfill({
        json: {
          categories: [
            { id: 'popular', title: 'Popular & well rated', state: 'READY', updatedAt: now, hasMore: true, movies: [] },
          ],
        },
      });
    });

    await signup(page);

    // -----------------------------------------------------------------------------------------
    // 1. LR01 & LR02: Uncached Title Details, Partial Availability & Decoupled Rating Enrichment
    // -----------------------------------------------------------------------------------------
    let tmdbCallCount = 0;
    let omdbEnriched = false;

    await page.route('**/api/movies/tmdb/550*', (route) => {
      tmdbCallCount++;
      // Return core details immediately; ratings are null initially, then enriched
      return route.fulfill({
        json: {
          id: 55001,
          tmdbId: 550,
          title: 'Fight Club',
          mediaType: 'MOVIE',
          releaseYear: 1999,
          overview: 'An insomniac office worker looking for a way to change his life.',
          director: 'David Fincher',
          imdbRating: omdbEnriched ? 8.8 : null,
          rottenTomatoesRating: omdbEnriched ? 79 : null,
          tmdbVoteAverage: 8.4,
          tmdbVoteCount: 26000,
        },
      });
    });

    await page.evaluate(() => window.__navigate('/movies/550?type=movie'));

    // Verify core details render immediately without waiting for enrichment
    await page.getByRole('heading', { name: 'Fight Club', exact: true }).waitFor();
    await page.getByText('(1999)').waitFor();
    await page.getByText('David Fincher').waitFor();

    // Verify strict read boundary: opening details never wrote to library
    assert.equal(libraryWriteCount, 0, 'Opening uncached title details did not write to user library');

    // Trigger enrichment check (simulating background worker completion)
    omdbEnriched = true;
    // Bounded check at 1.5s will fetch updated ratings
    await page.waitForTimeout(2000);
    // Verify ratings appeared dynamically without a full-app reload
    await page.getByText(/8\.8/).waitFor({ timeout: 5000 });
    console.log(`PASS [${viewport.width}x${viewport.height}] LR01/LR02: First-open uncached title and decoupled ratings`);

    // -----------------------------------------------------------------------------------------
    // 2. LR03: Shared Bounded Read Recovery Policy & Cancellation on Navigation
    // -----------------------------------------------------------------------------------------
    let transientFailCount = 0;
    await page.route('**/api/movies/tmdb/770*', (route) => {
      transientFailCount++;
      if (transientFailCount === 1) {
        // Return 503 Service Unavailable on first attempt
        return route.fulfill({ status: 503, json: { message: 'Provider busy' } });
      }
      return route.fulfill({
        json: {
          id: 77001,
          tmdbId: 770,
          title: 'The Godfather Part II',
          mediaType: 'MOVIE',
          releaseYear: 1974,
          tmdbVoteAverage: 9.0,
        },
      });
    });

    await page.evaluate(() => window.__navigate('/movies/770?type=movie'));
    // Should automatically retry after 500ms and succeed
    await page.getByRole('heading', { name: 'The Godfather Part II', exact: true }).waitFor({ timeout: 6000 });
    assert.equal(transientFailCount, 2, 'Transient 503 automatically retried and succeeded');
    console.log(`PASS [${viewport.width}x${viewport.height}] LR03: Transient read auto-recovery`);

    // Verify LR03: Browser reads Retry-After with CORS and respects cooldown
    let rateLimitAttempts = 0;
    let firstAttemptTime = 0;
    let secondAttemptTime = 0;
    await page.route('**/api/movies/tmdb/880*', (route) => {
      rateLimitAttempts++;
      if (rateLimitAttempts === 1) {
        firstAttemptTime = Date.now();
        return route.fulfill({
          status: 429,
          headers: {
            'Retry-After': '1',
            'Access-Control-Expose-Headers': 'Retry-After',
          },
          json: { message: 'Rate limited. Retry after 1s.' },
        });
      }
      secondAttemptTime = Date.now();
      return route.fulfill({
        json: {
          id: 88001,
          tmdbId: 880,
          title: 'Rate Limit Cooldown Movie',
          mediaType: 'MOVIE',
          releaseYear: 2021,
          tmdbVoteAverage: 7.8,
        },
      });
    });

    await page.evaluate(() => window.__navigate('/movies/880?type=movie'));
    await page.getByRole('heading', { name: 'Rate Limit Cooldown Movie', exact: true }).waitFor({ timeout: 6000 });
    assert.equal(rateLimitAttempts, 2, 'Rate limited read was retried');
    const cooldownElapsed = secondAttemptTime - firstAttemptTime;
    assert(cooldownElapsed >= 900, `Cooldown respected Retry-After: 1s header (elapsed: ${cooldownElapsed}ms)`);
    console.log(`PASS [${viewport.width}x${viewport.height}] LR03: Browser reads Retry-After with CORS and respects cooldown`);

    // Test retry exhaustion / non-transient contextual retry button
    await page.route('**/api/movies/tmdb/9999*', (route) => {
      return route.fulfill({ status: 404, json: { message: 'Title not found' } });
    });
    await page.evaluate(() => window.__navigate('/movies/9999?type=movie'));
    const retryBtn = page.getByRole('button', { name: 'Retry details', exact: true });
    await retryBtn.waitFor();
    // Verify no full-app reload instruction is present
    const bodyText = await page.locator('main').innerText();
    assert(!bodyText.toLowerCase().includes('reload your browser'), 'No instruction to reload full browser/app');

    // Test keyboard accessibility on Retry details button and read-only behavior
    await retryBtn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert.equal(rebuildPostCount, 0, 'Contextual retry strictly read-only; no POST /refresh rebuild calls made');
    console.log(`PASS [${viewport.width}x${viewport.height}] LR04: Contextual retry without reload instruction & keyboard navigation`);

    // -----------------------------------------------------------------------------------------
    // 3. LR04 & LR05: Explore Category Browsing, No Routine Refresh, Session Renewal on 410
    // -----------------------------------------------------------------------------------------
    let sessionCount = 0;
    let renewalPageRequests = 0;
    const initialSessionId = 'sess-initial-410-test';
    const renewedSessionId = 'sess-renewed-410-test';

    // Mock category explore endpoint
    await page.route('**/api/movies/explore/movies/popular*', (route) => {
      const url = new URL(route.request().url());
      const sid = url.searchParams.get('sessionId');
      const cursor = Number(url.searchParams.get('cursor') || '0');
      console.log(`[route:popular] sid=${sid} cursor=${cursor} sessionCount=${sessionCount}`);

      if (!sid) {
        // Initial page request or renewal start
        sessionCount++;
        if (sessionCount === 1) {
          // Initial session
          return route.fulfill({
            json: {
              sessionId: initialSessionId,
              cursor: 20,
              hasMore: true,
              totalEligibleInPool: 50,
              title: 'Popular & well rated',
              subtitle: 'Popular titles',
              state: 'READY',
              updatedAt: new Date().toISOString(),
              movies: Array.from({ length: 20 }, (_, i) => makeMovie(1001 + i, `Initial Movie ${i + 1}`)),
            },
          });
        } else {
          // Fresh renewal session starting at page 0
          renewalPageRequests++;
          // Page 0 returns: 15 duplicates of initial session + 5 distinct new items!
          const duplicates = Array.from({ length: 15 }, (_, i) => makeMovie(1001 + i, `Initial Movie ${i + 1}`));
          const distinct = Array.from({ length: 5 }, (_, i) => makeMovie(3001 + i, `Renewed Movie ${i + 1}`));
          return route.fulfill({
            json: {
              sessionId: renewedSessionId,
              cursor: 20,
              hasMore: true,
              totalEligibleInPool: 55,
              title: 'Popular & well rated',
              subtitle: 'Popular titles',
              state: 'READY',
              updatedAt: new Date().toISOString(),
              movies: [...duplicates, ...distinct],
            },
          });
        }
      }

      if (sid === initialSessionId) {
        // Simulate HTTP 410 Gone when Load more is clicked
        return route.fulfill({
          status: 410,
          json: { status: 410, message: 'Discovery session expired. Refresh discovery to continue.' },
        });
      }

      // Appending to renewed session
      return route.fulfill({
        json: {
          sessionId: renewedSessionId,
          cursor: cursor + 20,
          hasMore: false,
          totalEligibleInPool: 55,
          title: 'Popular & well rated',
          subtitle: 'Popular titles',
          state: 'READY',
          updatedAt: new Date().toISOString(),
          movies: Array.from({ length: 10 }, (_, i) => makeMovie(4001 + i, `Renewed Page 2 Movie ${i + 1}`)),
        },
      });
    });

    await page.evaluate(() => window.__navigate('/explore/movies/popular'));
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();

    // Verify LR04: No routine Refresh buttons are present on Explore category browsing
    const routineRefreshCount = await page.getByRole('button', { name: /Refresh discovery/i }).count();
    assert.equal(routineRefreshCount, 0, 'No routine Refresh discovery button present on category browsing');

    // 20 initial movie cards visible
    const cards = page.locator('main a[href^="/movies/"]');
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 20);
    assert.equal(await cards.count(), 20, '20 initial movie cards rendered');

    // Click "Load more" -> triggers 410 -> automatically renews without stranding!
    const loadMoreBtn = page.getByRole('button', { name: /Load more/i });
    await loadMoreBtn.waitFor();

    // Test activation on Load more
    await loadMoreBtn.click();

    // Verify automatic renewal:
    // 1. Initial 20 cards preserved.
    // 2. Distinct 5 new cards appended (total 25 cards).
    // 3. Labelled segment "Renewed Results" rendered!
    await page.getByText('Renewed Results').waitFor({ timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 25);
    assert.equal(await cards.count(), 25, 'Cards deduplicated: 20 initial + 5 distinct renewed = 25 total');

    // Check that renewed titles are present
    await page.getByRole('heading', { name: 'Renewed Movie 1' }).waitFor();
    await page.getByRole('heading', { name: 'Renewed Movie 5' }).waitFor();

    // Verify keyboard Tab navigation reaches interactive elements
    const firstCard = page.locator('main a[href^="/movies/"]').first();
    await firstCard.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'A', 'First movie card focused');
    await page.keyboard.press('Tab');
    const focusedTagAfterTab = await page.evaluate(() => document.activeElement?.tagName);
    assert(['A', 'BUTTON', 'INPUT', 'SELECT'].includes(focusedTagAfterTab), `Tab key moved focus to interactive ${focusedTagAfterTab}`);

    console.log(`PASS [${viewport.width}x${viewport.height}] LR05: Automatic session renewal on 410, deduplication and labelled segment`);

    // Mock details route for Renewed Movie 1
    await page.route('**/api/movies/tmdb/3001*', (route) => {
      return route.fulfill({
        json: {
          id: 3001,
          tmdbId: 3001,
          title: 'Renewed Movie 1',
          mediaType: 'MOVIE',
          releaseYear: 2022,
          overview: 'Details for renewed movie 1',
        },
      });
    });

    // Test LR06: Saved titles excluded when returning to Explore with multiple segments
    // Open details for "Renewed Movie 1"
    const renewedCard = page.locator('main a[href*="3001"]').first();
    await renewedCard.click();
    await page.getByRole('heading', { name: 'Renewed Movie 1', exact: true }).waitFor();

    // Save to Watchlist from the detail page
    const addToWatchlistBtn = page.getByRole('button', { name: /\+ Add to Watchlist/i });
    await addToWatchlistBtn.waitFor();
    await addToWatchlistBtn.click();
    await page.getByText(/In Watchlist/i).waitFor({ timeout: 5000 });

    // Click Back to return to Explore
    const backBtn = page.getByRole('button', { name: /Back/i }).first();
    await backBtn.click();

    // Verify returning to Explore restores segments but excludes the saved title
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 24);
    assert.equal(await cards.count(), 24, 'Restored segments excluded saved title: 25 - 1 = 24 total');
    const renewed1Count = await page.getByRole('heading', { name: 'Renewed Movie 1' }).count();
    assert.equal(renewed1Count, 0, 'Saved title Renewed Movie 1 does not reappear in restored segments');
    console.log(`PASS [${viewport.width}x${viewport.height}] LR06: Saved title excluded from multi-generation restored segments`);

    // -----------------------------------------------------------------------------------------
    // 4. Consecutive Duplicate Pages Handling with Forced Renewal (Standards Finding 3)
    // -----------------------------------------------------------------------------------------
    // If 3 consecutive renewal pages contain only visible titles, retain advanced cursor and permit explicit Load more
    let topSessionCount = 0;
    const renewalCursorsRequested = [];
    let renewalPageCallCount = 0;

    await page.route('**/api/movies/explore/movies/top-rated*', (route) => {
      const url = new URL(route.request().url());
      const cursor = Number(url.searchParams.get('cursor') || '0');
      const sid = url.searchParams.get('sessionId');

      // Initial page request
      if (topSessionCount === 0 && cursor === 0 && !sid) {
        topSessionCount++;
        return route.fulfill({
          json: {
            sessionId: 'sess-top-initial',
            cursor: 20,
            hasMore: true,
            totalEligibleInPool: 30,
            title: 'Top Rated',
            subtitle: 'Top rated titles',
            state: 'READY',
            updatedAt: new Date().toISOString(),
            movies: Array.from({ length: 20 }, (_, i) => makeMovie(5001 + i, `Top Movie ${i + 1}`)),
          },
        });
      }

      // Initial Load More request for sess-top-initial: force HTTP 410 Gone to trigger session renewal
      if (sid === 'sess-top-initial') {
        return route.fulfill({
          status: 410,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Discovery session expired (410)' }),
        });
      }

      // Inside renewal loop or subsequent pagination on renewed session
      renewalPageCallCount++;
      renewalCursorsRequested.push(cursor);

      // The first 3 renewal requests: return duplicate-only movies
      if (renewalPageCallCount <= 3) {
        return route.fulfill({
          json: {
            sessionId: 'sess-top-renewal',
            cursor: cursor + 20,
            hasMore: true,
            totalEligibleInPool: 100,
            title: 'Top Rated',
            subtitle: 'Top rated titles',
            state: 'READY',
            updatedAt: new Date().toISOString(),
            // Returns titles that are duplicates of visible items
            movies: Array.from({ length: 20 }, (_, i) => makeMovie(5001 + i, `Top Movie ${i + 1}`)),
          },
        });
      }

      // Continuation on 4th call: returns distinct items
      return route.fulfill({
        json: {
          sessionId: 'sess-top-renewal',
          cursor: cursor + 20,
          hasMore: false,
          totalEligibleInPool: 100,
          title: 'Top Rated',
          subtitle: 'Top rated titles',
          state: 'READY',
          updatedAt: new Date().toISOString(),
          movies: [
            makeMovie(5098, 'Continuation Movie 1'),
            makeMovie(5099, 'Continuation Movie 2'),
          ],
        },
      });
    });

    await page.evaluate(() => window.__navigate('/explore/movies/top-rated'));
    await page.getByRole('heading', { name: /Top Rated/i }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 20);

    // Simulate clicking loadMore: receives 410 on sess-top-initial, forcing automatic renewal loop
    const topLoadMore = page.getByRole('button', { name: /Load more/i });
    await topLoadMore.click();

    // Give loop time to try 3 renewal pages
    await page.waitForTimeout(1500);

    // Verify exact cursors requested during renewal (0 -> 20 -> 40) and stopping at 3
    assert.deepEqual(renewalCursorsRequested, [0, 20, 40], 'Renewal fetched exact cursors [0, 20, 40] across 3 duplicate pages');
    assert.equal(renewalPageCallCount, 3, 'Stopped bounded renewal loop after exactly 3 duplicate pages');
    assert(await topLoadMore.isVisible(), 'Load more is NOT stranded or marked exhausted');
    assert.equal(await cards.count(), 20, 'Existing cards preserved without duplicates');

    // Test continuation: click Load more again to continue from cursor 60
    await topLoadMore.click();
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 22);

    assert.equal(renewalCursorsRequested[3], 60, 'Continuation Load more requested retained cursor 60');
    assert.equal(await cards.count(), 22, 'New distinct movies appended (20 + 2 = 22 total)');

    // Verify continuation titles appear under the labelled segment "Renewed Results" (Spec Finding 6)
    await page.getByText('Renewed Results').waitFor();
    await page.getByRole('heading', { name: 'Continuation Movie 1' }).waitFor();
    await page.getByRole('heading', { name: 'Continuation Movie 2' }).waitFor();

    console.log(`PASS [${viewport.width}x${viewport.height}] LR05: Bounded duplicate-page limit preserves cursor and Load more`);

    // -----------------------------------------------------------------------------------------
    // 5. LR06: Freshness and 7-day Snapshot Cutoff Verification
    // -----------------------------------------------------------------------------------------
    // Stale snapshot (36 hours old) renders stale status warning
    const staleTime = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    await page.route('**/api/movies/explore/movies/stale-shelf*', (route) => {
      return route.fulfill({
        json: {
          sessionId: 'sess-stale',
          cursor: 20,
          hasMore: false,
          totalEligibleInPool: 1,
          title: 'Stale Shelf',
          subtitle: 'Stale snapshot test',
          state: 'STALE',
          updatedAt: staleTime,
          movies: [makeMovie(7001, 'Stale Movie')],
        },
      });
    });

    await page.evaluate(() => window.__navigate('/explore/movies/stale-shelf'));
    await page.getByRole('heading', { name: /Stale Shelf/i }).waitFor();
    const staleWarning = page.getByRole('status').filter({ hasText: /stale/i });
    await staleWarning.waitFor({ timeout: 5000 });
    assert(await staleWarning.isVisible(), 'Stale snapshot warning rendered for >24h snapshot');

    // Snapshot exceeding 7-day cutoff (8 days old) renders UNAVAILABLE and empties cards
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    await page.route('**/api/movies/explore/movies/expired-shelf*', (route) => {
      return route.fulfill({
        json: {
          sessionId: 'sess-expired',
          cursor: 0,
          hasMore: false,
          totalEligibleInPool: 0,
          title: 'Expired Shelf',
          subtitle: 'Expired snapshot test',
          state: 'READY',
          updatedAt: eightDaysAgo,
          movies: [makeMovie(8001, 'Should Be Excluded')],
        },
      });
    });

    await page.evaluate(() => window.__navigate('/explore/movies/expired-shelf'));
    await page.getByRole('heading', { name: /Expired Shelf/i }).waitFor();
    const unavailableAlert = page.getByRole('alert').filter({ hasText: /Discovery is unavailable/i });
    await unavailableAlert.waitFor({ timeout: 5000 });
    assert(await unavailableAlert.isVisible(), 'Exceeded 7-day cutoff renders Discovery is unavailable alert');
    const expiredCards = await page.locator('main a[href^="/movies/"]').count();
    assert.equal(expiredCards, 0, 'No cards rendered when snapshot exceeds 7-day cutoff');
    console.log(`PASS [${viewport.width}x${viewport.height}] LR06: Stale snapshot warning and 7-day cutoff`);

    // Verify responsive usability: no horizontal scroll overflow
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `issue-1-verified-${viewport.width}.png`), fullPage: true });

    console.log(`PASS Issue #1 Acceptance Criteria Matrix (${viewport.width}x${viewport.height})`);
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
    console.log('Running Issue #1 Acceptance Criteria Verification with Chrome', browser.version());
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await testIssue1(browser, viewport);
    }
    console.log('ALL ISSUE #1 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
})().catch((err) => {
  console.error('Issue #1 Browser Verification failed:', err);
  process.exitCode = 1;
});
