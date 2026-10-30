// Feature 013 Chrome checks. Controlled API responses and UI interaction at 1440x900 and 390x844.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const app = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const artifacts = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/private/tmp/mn013-browser';
fs.mkdirSync(artifacts, { recursive: true });

function isServerRunning(targetUrl) {
  return new Promise((resolve) => {
    const req = http.get(targetUrl, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function makeMovie(id, title, rating = 7.5, year = 2022) {
  return {
    tmdbId: id,
    title,
    mediaType: 'MOVIE',
    releaseYear: year,
    releaseDate: `${year}-05-01`,
    voteAverage: rating,
    voteCount: 500,
    posterUrl: null,
  };
}

function makeExploreRows() {
  const now = new Date().toISOString();
  return {
    categories: [
      { id: 'newest', title: 'Newest Releases', state: 'READY', updatedAt: now, movies: [makeMovie(101, 'New Movie 1')] },
      {
        id: 'popular',
        title: 'Popular & well rated',
        state: 'READY',
        updatedAt: now,
        hasMore: true,
        totalEligibleInPool: 45,
        movies: Array.from({ length: 6 }, (_, i) => makeMovie(200 + i, `Popular Movie ${i + 1}`, 7.5 + (i % 3) * 0.5)),
      },
      { id: 'top-rated', title: 'Top Rated', state: 'READY', updatedAt: now, movies: [makeMovie(301, 'Top Movie 1', 9.0)] },
      { id: 'upcoming', title: 'Upcoming Movies', state: 'READY', updatedAt: now, movies: [makeMovie(401, 'Upcoming Movie 1')] },
    ],
  };
}

async function signup(page) {
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  const settingsLink = page.getByRole('link', { name: 'Settings', exact: true });
  if (await settingsLink.isVisible().catch(() => false)) {
    return;
  }

  const id = `dq013${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const toggleBtn = page.locator('button[type=button]').filter({ hasText: 'Create Account' });
  if (await toggleBtn.isVisible().catch(() => false)) {
    await toggleBtn.click();
    const form = page.locator('form').filter({ has: page.locator('input[aria-label="Confirm Password"]') });
    await form.waitFor({ state: 'visible', timeout: 10000 });
    await form.getByRole('textbox', { name: 'Email', exact: true }).fill(`${id}@example.test`);
    await form.getByRole('textbox', { name: 'Username', exact: true }).fill(id);
    await form.locator('input[aria-label="Password"]').fill('Demo013-pass');
    await form.locator('input[aria-label="Confirm Password"]').fill('Demo013-pass');
    await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  }
  await settingsLink.waitFor({ state: 'visible', timeout: 15000 });
}

async function explore(page) {
  await page.getByRole('button', { name: /^(Menu|Navigation Menu)$/ }).click();
  await page.getByRole('menuitem', { name: /^Explore/ }).click();
  const submenu = page.getByRole('button', { name: 'Movies', exact: true });
  if (await submenu.count()) await submenu.click();
  else await page.getByRole('menuitem', { name: 'Movies', exact: true }).click();
  await page.getByRole('heading', { name: 'Movies', exact: true }).waitFor();
}

async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
}

async function testAdditionalDiscovery(browser, viewport) {
  const isMobile = viewport.width < 600;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((user) => {
    try {
      localStorage.setItem('movienight_current_user', JSON.stringify(user));
      localStorage.setItem('movienight_token', 'mock-jwt-token');
      sessionStorage.setItem('movienight_current_user', JSON.stringify(user));
    } catch {}
  }, { id: 13, username: 'dq013', displayName: 'Demo 013', role: 'USER' });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Mock auth routes
    await page.route('**/api/auth/check-name*', (route) => {
      return route.fulfill({ json: { available: true, message: 'Available' } });
    });
    await page.route('**/api/auth/signup', (route) => {
      const user = { id: 13, username: 'dq013', displayName: 'Demo 013', role: 'USER' };
      return route.fulfill({ json: { ok: true, user, token: 'mock-jwt-token', tokenType: 'Bearer' } });
    });
    await page.route('**/api/auth/login', (route) => {
      const user = { id: 13, username: 'dq013', displayName: 'Demo 013', role: 'USER' };
      return route.fulfill({ json: { ok: true, user, token: 'mock-jwt-token', tokenType: 'Bearer', id: 13, username: 'dq013', displayName: 'Demo 013', role: 'USER' } });
    });
    await page.route('**/api/auth/me', (route) => {
      return route.fulfill({ json: { id: 13, username: 'dq013', displayName: 'Demo 013', role: 'USER' } });
    });
    const mockLibrary = [];
    await page.route('**/api/movies/library*', (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON() || {};
        const tmdbId = postData.tmdbId || 1001;
        const entry = {
          id: 990 + mockLibrary.length + 1,
          status: postData.status || 'WATCHLIST',
          createdAt: new Date().toISOString(),
          movie: {
            id: 990 + mockLibrary.length + 1,
            tmdbId,
            title: postData.title || 'Saved Movie',
            mediaType: postData.mediaType || 'MOVIE',
            releaseYear: postData.releaseYear || 2022,
          },
        };
        mockLibrary.push(entry);
        return route.fulfill({ json: entry });
      }
      return route.fulfill({ json: mockLibrary });
    });
    await page.route('**/api/movies/my-library*', (route) => {
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/friends*', (route) => {
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/lists*', (route) => {
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/movies/watchlist/**', (route) => {
      return route.fulfill({ json: { status: 'WATCHLIST' } });
    });
    await page.route('**/api/movies/watched/**', (route) => {
      return route.fulfill({ json: { status: 'WATCHED' } });
    });
    await page.route('**/api/movies/tmdb/**', (route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split('/');
      const tmdbId = parseInt(parts[parts.length - 1], 10);
      return route.fulfill({
        json: {
          id: tmdbId,
          tmdbId,
          title: `Batch1 Movie 01`,
          mediaType: 'MOVIE',
          releaseYear: 2022,
          overview: 'Overview of Batch1 Movie 01',
          voteAverage: 8.0,
          voteCount: 500,
        },
      });
    });
    await page.route('**/api/movies/*/reviews*', (route) => {
      return route.fulfill({ json: [] });
    });

    // Controlled explore shelves response
    await page.route('**/api/movies/explore/movies', (route) => {
      return route.fulfill({ json: makeExploreRows() });
    });
    await page.route('**/api/suggestions/explore/**/refresh*', (route) => {
      return route.fulfill({ json: makeExploreRows() });
    });

    // Controlled category page state
    let categoryCallCount = 0;
    let failNextCategoryCall = false;

    await page.route('**/api/movies/explore/movies/popular*', (route) => {
      categoryCallCount++;
      const url = new URL(route.request().url());
      const cursor = parseInt(url.searchParams.get('cursor') || '0', 10);
      const sortBy = url.searchParams.get('sortBy') || 'default';
      const minRating = url.searchParams.get('minRating') || '0';

      if (failNextCategoryCall) {
        failNextCategoryCall = false;
        return route.fulfill({ status: 500, json: { message: 'Controlled load more failure' } });
      }

      if (cursor === 0) {
        const savedIds = new Set(mockLibrary.map((e) => e.movie.tmdbId));
        const movies = [];
        let id = 1001;
        while (movies.length < 20) {
          if (!savedIds.has(id)) {
            movies.push(
              makeMovie(id, `Batch1 Movie ${String(id - 1000).padStart(2, '0')}`, 8.0 - (id - 1001) * 0.1, 2020 + ((id - 1001) % 4))
            );
          }
          id++;
        }
        return route.fulfill({
          json: {
            sessionId: 'sess-popular-013',
            cursor: 20,
            hasMore: true,
            totalEligibleInPool: 45,
            title: 'Popular & well rated',
            subtitle: 'Movies with strong audience reception',
            state: 'READY',
            updatedAt: new Date().toISOString(),
            terminalReason: null,
            underlyingLimit: 'SELECTION_LIMIT_REACHED',
            movies,
          },
        });
      } else if (cursor === 20) {
        const movies = Array.from({ length: 20 }, (_, i) =>
          makeMovie(1021 + i, `Batch2 Movie ${String(i + 1).padStart(2, '0')}`, 7.0 - i * 0.1, 2018 + (i % 4))
        );
        return route.fulfill({
          json: {
            sessionId: 'sess-popular-013',
            cursor: 40,
            hasMore: true,
            totalEligibleInPool: 45,
            title: 'Popular & well rated',
            subtitle: 'Movies with strong audience reception',
            state: 'READY',
            updatedAt: new Date().toISOString(),
            terminalReason: null,
            underlyingLimit: 'SELECTION_LIMIT_REACHED',
            movies,
          },
        });
      } else {
        const movies = Array.from({ length: 5 }, (_, i) =>
          makeMovie(1041 + i, `Batch3 Movie ${String(i + 1).padStart(2, '0')}`, 6.5, 2015)
        );
        return route.fulfill({
          json: {
            sessionId: 'sess-popular-013',
            cursor: 45,
            hasMore: false,
            totalEligibleInPool: 45,
            title: 'Popular & well rated',
            subtitle: 'Movies with strong audience reception',
            state: 'READY',
            updatedAt: new Date().toISOString(),
            terminalReason: 'SELECTION_LIMIT_REACHED',
            underlyingLimit: 'SELECTION_LIMIT_REACHED',
            movies,
          },
        });
      }
    });

    await signup(page);
    await explore(page);

    // 1. Check shelf preview and navigate to category page via "View all"
    const popularShelf = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Popular & well rated' }) });
    const viewAllLink = popularShelf.getByRole('link', { name: /View all/ });
    await viewAllLink.waitFor();
    await viewAllLink.click();

    // 2. Category grid initial view (20 cards)
    await page.getByRole('heading', { name: 'Popular & well rated' }).waitFor();
    const cards = page.locator('main a[href^="/movies/"]');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 20, 'Initial category page loads 20 cards');

    // 3. Verify "Load more" button is visible and click it
    const loadMoreBtn = page.getByRole('button', { name: /Load more/i });
    await loadMoreBtn.waitFor();
    assert(await loadMoreBtn.isVisible(), 'Load more button is visible when hasMore is true');

    // Capture baseline scroll position before clicking load more (DR01)
    await loadMoreBtn.scrollIntoViewIfNeeded();
    const initialScrollY = await page.evaluate(() => window.scrollY);
    await loadMoreBtn.click({ force: true });

    // 4. Batch 2 appends: cards count becomes 40
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 40);
    assert.equal(await cards.count(), 40, 'Load more appends 20 additional cards without replacing earlier cards');

    // Assert scroll position was preserved across append (DR01)
    const afterLoadMoreScrollY = await page.evaluate(() => window.scrollY);
    assert(Math.abs(afterLoadMoreScrollY - initialScrollY) <= 10, 'Load more preserves scroll position without jumping');

    // Verify first card is still Batch1 Movie 01
    assert((await cards.first().getAttribute('href')).includes('1001'), 'Earlier cards remain intact');
    // Verify 21st card is Batch2 Movie 01
    assert((await cards.nth(20).getAttribute('href')).includes('1021'), 'New cards appended sequentially');

    // 5. Test failure and retry
    failNextCategoryCall = true;
    await loadMoreBtn.click();

    // Error banner appears with Retry button; earlier cards preserved
    const retryBtn = page.getByRole('button', { name: /Retry/i });
    await retryBtn.waitFor();
    assert(await retryBtn.isVisible(), 'Retry button visible after failure');
    assert.equal(await cards.count(), 40, 'Usable cards retained on request failure');

    // Clicking retry recovers and fetches batch 3
    await retryBtn.click();
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 45);
    assert.equal(await cards.count(), 45, 'Batch 3 appends 5 remaining cards (total 45)');

    // 6. Terminal state: SELECTION_LIMIT_REACHED
    await page.getByText(/Selection limit reached/i).waitFor();
    assert(await page.getByText(/At least one provider stream reached its 10-page bound/i).isVisible());
    assert.equal(await page.getByRole('button', { name: /Load more/i }).count(), 0, 'Load more button removed at terminal state');

    // 7. Confirmed save library removal without auto-filling gaps and scroll restoration
    // Scroll down to a lower card before navigating to details to test restoration (DR06)
    const targetCard = cards.nth(10);
    await targetCard.scrollIntoViewIfNeeded();
    const scrollBeforeDetails = await page.evaluate(() => window.scrollY);
    assert(scrollBeforeDetails > 50, 'Scroll position is non-zero before opening details');

    // Save this movie to watchlist and wait for confirmation
    await targetCard.click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/movies/library') && r.request().method() === 'POST'),
      page.getByRole('button', { name: '+ Add to Watchlist', exact: true }).click(),
    ]);
    // Navigate back to category page using in-app back button
    const backBtn = page.getByRole('button', { name: /Back to/i });
    await backBtn.waitFor();
    await backBtn.click();
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();

    // The saved card (1011) is immediately removed from the rendered category grid
    await page.waitForFunction(() => !document.querySelector('main a[href*="1011"]'));
    assert.equal(await cards.count(), 44, 'Saved movie immediately removed without auto-filling gaps');

    // Assert that details-and-back restores previous scroll position (DR06)
    await page.waitForFunction((expected) => Math.abs(window.scrollY - expected) <= 20, scrollBeforeDetails);
    const restoredScrollY = await page.evaluate(() => window.scrollY);
    assert(Math.abs(restoredScrollY - scrollBeforeDetails) <= 20, 'Details-and-back restores previous scroll position');

    // 8. Cross-Tab / Cross-Device Sync on Window Focus (DR04, Q9)
    // Simulate another tab adding Batch2 Movie 01 (tmdbId 1021) to the user's library
    mockLibrary.push({
      id: 998,
      status: 'WATCHLIST',
      createdAt: new Date().toISOString(),
      movie: {
        id: 998,
        tmdbId: 1021,
        title: 'Batch2 Movie 01',
        mediaType: 'MOVIE',
        releaseYear: 2018,
      },
    });

    // Trigger window focus event
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    // Batch2 Movie 01 (1021) is immediately pruned from the view without reloading
    await page.waitForFunction(() => !document.querySelector('main a[href*="1021"]'));
    assert.equal(await cards.count(), 43, 'Cross-tab saved movie immediately pruned on window focus');

    // 9. Ordinary category navigation resets pagination (Q6)
    const backToExplore = page.getByRole('link', { name: /Back to Movies/i });
    await backToExplore.waitFor();
    await backToExplore.click();
    await page.getByRole('heading', { name: 'Movies', exact: true }).waitFor();

    // Re-enter category page from shelf
    const viewAllAgain = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Popular & well rated' }) }).getByRole('link', { name: /View all/ });
    await viewAllAgain.waitFor();
    await viewAllAgain.click();
    await page.getByRole('heading', { name: 'Popular & well rated' }).waitFor();
    await cards.first().waitFor();
    assert.equal(await cards.count(), 20, 'Ordinary category navigation resets pagination to initial batch');

    // Test filter/sort change and details-and-back restoration (Spec Finding 10 & DR06)
    if (!isMobile) {
      await page.getByRole('button', { name: /Sort:/ }).click();
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('sortBy=title')),
        page.getByRole('option', { name: 'Title', exact: true }).click(),
      ]);

      await page.getByRole('button', { name: /Rating:/ }).click();
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('minRating=6')),
        page.getByRole('option', { name: 'TMDB audience 6+/10', exact: true }).click(),
      ]);

      // Verify selected controls are rendered
      assert(await page.getByRole('button', { name: /Sort:.*Title/i }).isVisible());
      assert(await page.getByRole('button', { name: /Rating:.*6\+/i }).isVisible());

      // Open details of first card
      const sortedFirstCard = cards.first();
      await sortedFirstCard.click();
      const backFromSortedDetails = page.getByRole('button', { name: /Back to/i });
      await backFromSortedDetails.waitFor();
      await backFromSortedDetails.click();

      // Upon details-and-back, verify controls are restored from saved session
      await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
      assert(await page.getByRole('button', { name: /Sort:.*Title/i }).isVisible(), 'Sort restored upon details-and-back');
      assert(await page.getByRole('button', { name: /Rating:.*6\+/i }).isVisible(), 'Rating filter restored upon details-and-back');

      // Reset controls back to default recommendation
      await page.getByRole('button', { name: /Sort:/ }).click();
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('sortBy=recommendation')),
        page.getByRole('option', { name: 'Recommendation order', exact: true }).click(),
      ]);
      await page.getByRole('button', { name: /Rating:/ }).click();
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('minRating=0')),
        page.getByRole('option', { name: 'All TMDB ratings', exact: true }).click(),
      ]);
    }

    // A failed Refresh must not extend an active pool's lifetime (Q6).
    const categoryOpenedAt = Date.now();
    await page.clock.install({ time: new Date(categoryOpenedAt) });
    await page.clock.setSystemTime(new Date(categoryOpenedAt + 29 * 60 * 1000));
    await page.route('**/api/suggestions/explore/**/refresh*', route =>
      route.fulfill({ status: 500, json: { message: 'Active session refresh failed' } }),
      { times: 1 });
    await page.getByRole('button', { name: 'Refresh discovery', exact: true }).click();
    await page.getByText('Active session refresh failed', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Load more/i }).click();
    // Exclusions and overlaps above leave fewer than 40 cards after appending.
    await page.locator('main a[href*="1040"]').waitFor();
    const loadedBeforeExpiration = await cards.evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert(loadedBeforeExpiration.length > 20, 'Load more retained earlier batches after failed Refresh');

    await page.clock.setSystemTime(new Date(categoryOpenedAt + 31 * 60 * 1000));
    const callsBeforeExpiredReturn = categoryCallCount;
    await cards.first().click();
    await page.getByRole('button', { name: /Back to/i }).click();
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
    await page.getByText('Discovery session expired. Refresh discovery to continue.', { exact: true }).waitFor();
    assert.deepEqual(await cards.evaluateAll(links => links.map(link => link.getAttribute('href'))), loadedBeforeExpiration,
      'Failed Refresh does not discard loaded batches on expired return');
    assert.equal(categoryCallCount, callsBeforeExpiredReturn, 'Expired return does not silently replace the pool');
    assert.equal(await page.getByRole('button', { name: /Load more/i }).count(), 0, 'Expired pool cannot append');

    // Successful Refresh starts a new lifetime, which survives details-and-back.
    await page.getByRole('button', { name: 'Refresh discovery', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('main a[href^="/movies/"]').length === 20);
    await cards.first().click();
    await page.getByRole('button', { name: /Back to/i }).click();
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
    assert.equal(await page.getByText('Discovery session expired. Refresh discovery to continue.', { exact: true }).count(), 0,
      'Successful Refresh starts a fresh session lifetime');
    assert(await page.getByRole('button', { name: /Load more/i }).isVisible(), 'Replacement pool can append');
    await page.clock.setSystemTime(new Date());

    // 10. DR05 Session expiration (HTTP 410) recovery via Refresh discovery
    await page.route('**/api/movies/explore/movies/popular*', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('sessionId')) {
        return route.fulfill({
          status: 410,
          json: { status: 410, message: 'Discovery session expired. Refresh discovery to continue.' },
        });
      }
      return route.fulfill({
        json: {
          sessionId: 'sess-popular-recovered-013',
          cursor: 20,
          hasMore: false,
          totalEligibleInPool: 20,
          title: 'Popular & well rated',
          subtitle: 'Recovered pool',
          state: 'READY',
          updatedAt: new Date().toISOString(),
          terminalReason: 'SELECTION_LIMIT_REACHED',
          movies: Array.from({ length: 20 }, (_, i) => makeMovie(2001 + i, `Recovered Movie ${i + 1}`)),
        },
      });
    });

    // Test: Session expiration measured from category opening: details-and-back retains usable cards and offers Refresh discovery (Q6)
    const cardForExpiredTest = cards.first();
    await cardForExpiredTest.click();
    const backBtnFromExpiredTest = page.getByRole('button', { name: /Back to/i });
    await backBtnFromExpiredTest.waitFor();

    // Fast-forward category opening timestamp to 35 minutes ago in sessionStorage (> 30 min lifetime)
    await page.evaluate(() => {
      const key = 'explore_session_movies_popular';
      const stored = JSON.parse(sessionStorage.getItem(key));
      stored.timestamp = Date.now() - 35 * 60 * 1000;
      sessionStorage.setItem(key, JSON.stringify(stored));
    });

    // Navigate back after category session expired
    await backBtnFromExpiredTest.click();
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();

    // Assert that usable loaded results are retained and not silently replaced
    assert.equal(await cards.count(), 20, 'After expiration, Back retains usable loaded results rather than silently replacing pool');

    // Assert that session expired banner and Refresh discovery button are offered
    await page.getByText(/Discovery session expired. Refresh discovery to continue./i).waitFor();
    const refreshBtn = page.getByRole('button', { name: /Refresh discovery/i });
    await refreshBtn.waitFor();
    assert(await refreshBtn.isVisible(), 'Refresh discovery button offered on expired session');

    // Spec Finding 1 / Finding 1: Verify expired-session restoration does NOT purge sessionStorage
    // and saving a retained card prunes it while preserving storage for repeated returns
    assert(await page.evaluate(() => sessionStorage.getItem('explore_session_movies_popular') !== null), 'Expired session retains storage for multiple details-and-back visits');
    const secondCard = cards.nth(1);
    await secondCard.click();
    // Save this retained card to watchlist from details view
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/movies/library') && r.request().method() === 'POST'),
      page.getByRole('button', { name: '+ Add to Watchlist', exact: true }).click(),
    ]);
    const backBtnFromSecondCard = page.getByRole('button', { name: /Back to/i });
    await backBtnFromSecondCard.waitFor();
    await backBtnFromSecondCard.click();
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
    assert.equal(await cards.count(), 19, 'Saving a retained card removes it from expired view');
    assert(await page.evaluate(() => sessionStorage.getItem('explore_session_movies_popular') !== null), 'Saving a retained card does NOT delete the expired snapshot from storage');
    await page.getByText(/Discovery session expired. Refresh discovery to continue./i).waitFor();

    // Return to details of a third card and back: verify remaining 19 cards and storage remain intact
    const thirdCard = cards.nth(1);
    await thirdCard.click();
    const backBtnFromThirdCard = page.getByRole('button', { name: /Back to/i });
    await backBtnFromThirdCard.waitFor();
    await backBtnFromThirdCard.click();
    await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
    assert.equal(await cards.count(), 19, 'Second details-and-back visit after saving still retains remaining loaded results');
    assert(await page.evaluate(() => sessionStorage.getItem('explore_session_movies_popular') !== null), 'Storage remains intact across subsequent visits');
    await page.getByText(/Discovery session expired. Refresh discovery to continue./i).waitFor();

      // Test failed Refresh preserves cards and details-and-back restoration (Q6)
      let failRefresh = true;
      await page.route('**/api/suggestions/explore/**/refresh*', (route) => {
        if (failRefresh) {
          failRefresh = false;
          return route.fulfill({ status: 500, json: { message: 'Controlled refresh failure' } });
        }
        return route.fulfill({ json: makeExploreRows() });
      });

      await refreshBtn.click();
      await page.getByText(/Controlled refresh failure|Could not refresh discovery/i).waitFor();
      assert.equal(await cards.count(), 19, 'Failed refresh retains visible cards');

      // Navigate to details of a card and back: verify cards are restored after failed refresh
      const testCard = cards.first();
      await testCard.click();
      const backBtnFromFailedRefresh = page.getByRole('button', { name: /Back to/i });
      await backBtnFromFailedRefresh.waitFor();
      await backBtnFromFailedRefresh.click();
      await page.getByRole('heading', { name: /Popular & well rated/i }).waitFor();
      assert.equal(await cards.count(), 19, 'Details-and-back restores cards even after failed refresh');

      // Now click refresh/retry which succeeds and replaces with new recovered pool
      const retryRefreshBtn = page.getByRole('button', { name: /(Retry|Refresh discovery)/i });
      await retryRefreshBtn.waitFor();
      await retryRefreshBtn.click();
      await page.waitForFunction(() => document.querySelectorAll('main a[href*="2001"]').length > 0);
      assert.equal(await cards.count(), 20, 'Recovered from expired session via Refresh discovery');

    // 10b. Test: Terminal explanation and empty state when all candidates are excluded by library (Spec Finding 11)
    await page.route('**/api/movies/explore/movies/top-rated*', (route) => {
      return route.fulfill({
        json: {
          sessionId: 'sess-toprated-all-saved',
          cursor: 0,
          hasMore: false,
          totalEligibleInPool: 0,
          title: 'Top Rated',
          subtitle: 'Acclaimed films with high ratings',
          state: 'READY',
          updatedAt: new Date().toISOString(),
          terminalReason: 'ALL_CANDIDATES_EXCLUDED_BY_LIBRARY',
          underlyingLimit: 'SELECTION_LIMIT_REACHED',
          movies: [],
        },
      });
    });

    await page.evaluate(() => window.__navigate('/explore/movies/top-rated'));
    await page.getByRole('heading', { name: /Top Rated/i }).waitFor();
    await page.getByText(/All titles in this category are already in your watchlist or watched history/i).waitFor();
    await page.getByText(/All candidate titles are already in your library/i).waitFor();
    await page.getByText(/Provider selection limit reached/i).waitFor();

    // Verify shelf overview reflects authoritative terminalReason when !hasMore,
    // distinguishes empty preview with hasMore (Spec Finding 1, Finding 2),
    // and continuously visible shelf enforces 7-day expiration timer without focus events (Q12)
    await page.route('**/api/movies/explore/movies', (route) => {
      const rows = makeExploreRows();
      const topRatedShelf = rows.categories.find((c) => c.id === 'top-rated');
      if (topRatedShelf) {
        topRatedShelf.movies = [];
        topRatedShelf.hasMore = false;
        topRatedShelf.terminalReason = 'ALL_CANDIDATES_EXCLUDED_BY_LIBRARY';
        topRatedShelf.underlyingLimit = 'SELECTION_LIMIT_REACHED';
      }
      const upcomingShelf = rows.categories.find((c) => c.id === 'upcoming');
      if (upcomingShelf) {
        upcomingShelf.movies = [];
        upcomingShelf.hasMore = true;
        upcomingShelf.terminalReason = null;
      }
      const popShelf = rows.categories.find((c) => c.id === 'popular');
      if (popShelf) {
        popShelf.updatedAt = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 - 600)).toISOString();
        popShelf.movies = [makeMovie(9901, 'Expiring Shelf Movie')];
      }
      return route.fulfill({ json: rows });
    });
    await page.evaluate(() => window.__navigate('/explore/movies'));
    await page.getByRole('heading', { name: 'Movies', exact: true }).waitFor();
    await page.getByText(/All candidate titles in this shelf are already in your library/i).waitFor();
    await page.getByText(/Preview titles are in your library. Explore category to see more./i).waitFor();
    await page.getByText(/Provider selection limit reached/i).waitFor();
    await page.getByRole('link', { name: 'Expiring Shelf Movie' }).first().waitFor();

    // Without user focus or interaction, timer fires once 7-day boundary passes and clears expiring shelf cards
    await page.waitForTimeout(800);
    await page.waitForFunction(() => !document.body.innerText.includes('Expiring Shelf Movie'));

    // 10c. Test: Snapshot older than 7 days / UNAVAILABLE renders explicit unavailable state with retry (Spec Finding 4)
    await page.route('**/api/movies/explore/movies/upcoming*', (route) => {
      return route.fulfill({
        json: {
          sessionId: 'sess-upcoming-unavailable',
          cursor: 0,
          hasMore: false,
          totalEligibleInPool: 0,
          title: 'Upcoming Movies',
          subtitle: 'Upcoming releases',
          state: 'UNAVAILABLE',
          updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          terminalReason: 'UNAVAILABLE',
          movies: [],
        },
      });
    });

    await page.evaluate(() => window.__navigate('/explore/movies/upcoming'));
    await page.getByRole('heading', { name: /Upcoming Movies/i }).waitFor();
    await page.getByRole('alert').filter({ hasText: /Discovery is unavailable. Retry this category./i }).waitFor();
    const retryUnavailableBtn = page.getByRole('button', { name: /Retry discovery/i });
    await retryUnavailableBtn.waitFor();
    assert(await retryUnavailableBtn.isVisible(), 'Retry discovery button visible in unavailable state');
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem('explore_session_movies_upcoming')),
      null,
      'Unavailable session is never persisted in sessionStorage'
    );

    // Test: Mounted category rechecks snapshot age on focus / visibility change / timer (Q12 / Finding 3)
    // Snapshot opened 800ms before reaching 7-day staleness boundary
    await page.route('**/api/movies/explore/movies/airing*', (route) => {
      return route.fulfill({
        json: {
          sessionId: 'sess-airing-fresh',
          cursor: 0,
          hasMore: false,
          totalEligibleInPool: 5,
          title: 'Currently Airing',
          subtitle: 'Airing now',
          state: 'READY',
          updatedAt: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 - 800)).toISOString(),
          movies: Array.from({ length: 5 }, (_, i) => makeMovie(3001 + i, `Airing Movie ${i + 1}`)),
        },
      });
    });
    await page.evaluate(() => window.__navigate('/explore/movies/airing'));
    await page.getByRole('heading', { name: /Currently Airing/i }).waitFor();
    assert.equal(await page.locator('main a[href*="/movies/"]').count(), 5, 'Initially renders 5 titles before 7-day limit');

    // Wait for the mounted timer/focus to transition snapshot to unavailable once 7-day boundary passes
    await page.waitForTimeout(900);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('alert').filter({ hasText: /Discovery is unavailable. Retry this category./i }).waitFor({ timeout: 5000 });
    assert.equal(await page.locator('main a[href*="/movies/"]').count(), 0, 'Cards cleared when snapshot exceeds 7 days');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('explore_session_movies_airing')), null, 'Storage purged when snapshot exceeds 7 days');

    // 11. Invalidate and purge stored explore sessions from sessionStorage on logout
    assert(await page.evaluate(() => sessionStorage.getItem('explore_session_movies_popular') !== null), 'Explore session present before logout');
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Password"]') !== null);

    const remainingExploreKeys = await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith('explore_session_') || k === 'details_return_target')
    );
    assert.equal(remainingExploreKeys.length, 0, 'All explore sessions and return targets purged on logout');

    // 12. Screenshot and overflow check
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `category-grid-${viewport.width}.png`), fullPage: true });

    console.log(`PASS additional discovery category grid (${viewport.width}x${viewport.height})`);
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
    console.log('Testing Additional Discovery with Chrome', browser.version());
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await testAdditionalDiscovery(browser, viewport);
    }
    console.log('ALL BROWSER CHECKS PASSED');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
})().catch((err) => {
  console.error('Browser check failed:', err);
  process.exitCode = 1;
});
