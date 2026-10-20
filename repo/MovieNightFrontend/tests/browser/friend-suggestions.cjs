// Controlled UI fixtures; real persistence/authorization are covered by the API suite.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const artifactDir = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/tmp/movienight-005-browser';
const user = { id: '101', username: 'fixture', displayName: 'Fixture User' };
const item = (tmdbId, title, score, imdbRating, reason) => ({ tmdbId, title, score, imdbRating, reason, mediaType: 'MOVIE', releaseYear: 2026 });
const rated = [item(501, 'Consensus A', 14, 2, 'Average 7.0/10 × 2 friends'), item(502, 'Solo B', 9, 10, 'Average 9.0/10 × 1 friend'), item(503, 'Zero C', 0, 7, 'Average 0.0/10 × 1 friend')];
const rows = { categories: [{ id: 'friends', title: 'Rated by friends', movies: rated }, { id: 'friends-watchlist', title: "On friends’ watchlists", movies: [item(504, 'Planned D', null, 8, 'On 2 friends’ watchlists')] }] };
const passed = [], errors = [];
let readMode = 'success', saveMode = 'failure', releaseRead, heldRead = false, revoked = false;
const friend = { id: 303, username: 'contributor', displayName: 'Contributor', watchedCount: 3, watchlistCount: 1, avgRating: 7 };
const library = [];
const empty = { categories: rows.categories.map((c) => ({ ...c, movies: [] })) };
const snapshot = () => ({ categories: rows.categories.map((c) => ({ ...c, movies: c.movies.filter((m) => !library.some((e) => e.movie.tmdbId === m.tmdbId)) })) });
const until = async (predicate) => { const deadline = Date.now() + 5000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Held request not reached'); await new Promise((r) => setTimeout(r, 10)); } };

const check = (name) => { passed.push(name); console.log('PASS', name); };
(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript((u) => { if (!localStorage.getItem('movienight_current_user')) { localStorage.setItem('movienight_current_user', JSON.stringify(u)); localStorage.setItem('movienight_token', 'fixture-token'); } }, user);
    await context.route('http://localhost:8080/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const req = route.request(), other = req.headers().authorization === 'Bearer other-token';
      if (path === '/api/friends') return route.fulfill({ json: other || revoked ? [] : [friend] });
      if (path === '/api/friends/303' && req.method() === 'DELETE') { revoked = true; return route.fulfill({ json: { message: 'Removed' } }); }
      if (path === '/api/friends/303/profile') return route.fulfill({ json: friend });
      if (path === '/api/auth/login') return route.fulfill({ json: { token: 'other-token', id: 202, username: 'other', displayName: 'Other User', role: 'ROLE_USER' } });
      if (path === '/api/suggestions/friends') {
        if (other || revoked) return route.fulfill({ json: empty });
        if (readMode === 'failure') return route.fulfill({ status: 503, json: {} });
        if (readMode === 'unauthorized') return route.fulfill({ status: 403, json: {} });
        if (readMode === 'offline') return route.abort('failed');
        if (readMode === 'timeout') { await new Promise((r) => setTimeout(r, 15500)); return route.abort('timedout').catch(() => {}); }
        if (readMode === 'malformed') return route.fulfill({ json: { categories: [{ id: 'popular', movies: rated }] } });
        const data = readMode === 'empty' ? empty : snapshot();
        if (readMode === 'held') { heldRead = true; await new Promise((r) => { releaseRead = r; }); }
        return route.fulfill({ json: data });
      }
      if (path === '/api/movies/library') {
        if (req.method() === 'GET') return route.fulfill({ json: other ? [] : library });
        if (saveMode === 'failure') return route.fulfill({ status: 503, json: {} });
        const data = req.postDataJSON();
        const entry = { id: 700, movie: { ...data, id: 800, tmdbId: data.tmdbId }, status: 'WATCHLIST' };
        library.push(entry);
        return route.fulfill({ status: 201, json: entry });
      }
      if (path.includes('suggestions') || path.includes('explore')) return route.fulfill({ json: { categories: [] } });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8444');
    await page.getByRole('heading', { name: 'Friend suggestions', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Consensus A', exact: true }).waitFor();
    check('AC06: Home preview uses server friend sources');
    await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
    await page.getByRole('menuitem', { name: "Friends' Recommendations", exact: true }).click();
    await page.getByRole('heading', { name: 'Rated by friends', exact: true }).waitFor();
    assert.deepEqual(await page.locator('section[aria-labelledby="friends-heading"] a[aria-label]').evaluateAll((links) => links.map((l) => l.getAttribute('aria-label'))), ['Consensus A', 'Solo B', 'Zero C']);
    await page.getByText('Average 7.0/10 × 2 friends', { exact: true }).waitFor();
    await page.getByText('Score 0', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'On friends’ watchlists', exact: true }).waitFor();
    check('AC01/AC02: consensus order overrides IMDb; zero and separate sources visible');
    await page.screenshot({ path: `${artifactDir}/desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${artifactDir}/mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const reload = () => page.getByRole('button', { name: 'Reload suggestions', exact: true });
    for (const mode of ['failure', 'unauthorized', 'offline', 'timeout', 'malformed']) {
      readMode = mode; await reload().click();
      await page.getByText('Could not load friend suggestions. Reload to try again.', { exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await page.getByRole('link', { name: 'Consensus A', exact: true }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Rated by friends', exact: true }).count(), 0);
      readMode = 'success'; await reload().click();
      await page.getByRole('link', { name: 'Consensus A', exact: true }).waitFor();
      check(`AC05: ${mode} shows error without stale/fallback results; reload recovers`);
    }
    readMode = 'held'; heldRead = false; await reload().click();
    await until(() => heldRead);
    await page.getByRole('status').filter({ hasText: 'Loading friend suggestions' }).waitFor();
    assert.equal(await reload().isDisabled(), true);
    assert.equal(await page.getByRole('link', { name: 'Consensus A', exact: true }).count(), 0);
    readMode = 'success'; releaseRead();
    await page.getByRole('link', { name: 'Consensus A', exact: true }).waitFor();
    check('AC05: held read shows loading, disables duplicate reload, clears prior results');
    readMode = 'empty'; await reload().click();
    await page.getByText('No eligible rated movies from accepted friends.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Consensus A', exact: true }).count(), 0);
    readMode = 'success'; await reload().click();
    await page.getByRole('link', { name: 'Consensus A', exact: true }).waitFor();
    check('AC05: successful empty response clears prior results with an explanation');
    await page.getByRole('button', { name: 'Add Consensus A to watchlist', exact: true }).click();
    await page.getByText('The server could not confirm the request. Please try again.', { exact: true }).first().waitFor();
    await page.getByRole('link', { name: 'Consensus A', exact: true }).waitFor();
    assert.equal(library.length, 0);
    saveMode = 'success';
    await page.getByRole('button', { name: 'Add Consensus A to watchlist', exact: true }).click();
    await page.getByRole('link', { name: 'Consensus A', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('link', { name: 'Solo B', exact: true }).waitFor();
    await reload().click();
    await page.getByRole('link', { name: 'Solo B', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Consensus A', exact: true }).count(), 0);
    check('AC03/AC06: failed save retains candidate; confirmed save refreshes and excludes it');
    await page.getByRole('link', { name: 'Manage friendships', exact: true }).click();
    await page.getByRole('link', { name: /Contributor @contributor/ }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Friend', exact: true }).click();
    await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
    await page.getByRole('menuitem', { name: "Friends' Recommendations", exact: true }).click();
    await page.getByText('No eligible rated movies from accepted friends.', { exact: false }).waitFor();
    assert.equal(revoked, true);
    assert.equal(await page.getByRole('link', { name: 'Solo B', exact: true }).count(), 0);
    check('AC04/AC06: removing a friendship then returning fetches current empty server results');
    revoked = false; await reload().click();
    await page.getByRole('link', { name: 'Solo B', exact: true }).waitFor();
    readMode = 'held'; heldRead = false; await reload().click(); await until(() => heldRead);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).fill('other@example.com');
    await page.getByPlaceholder('Enter your password').fill('password');
    await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Email Address', exact: true }) }).getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
    await page.getByRole('menuitem', { name: "Friends' Recommendations", exact: true }).click();
    await page.getByText('No eligible rated movies from accepted friends.', { exact: false }).waitFor();
    readMode = 'success'; releaseRead();
    await reload().click();
    await page.getByText('No eligible rated movies from accepted friends.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Solo B', exact: true }).count(), 0);
    check('AC05: late old-account response cannot restore private friend results');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${artifactDir}/results.json`, JSON.stringify({ passed, errors }, null, 2));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
