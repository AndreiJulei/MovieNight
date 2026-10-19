// Controlled browser acceptance checks; run against Vite, not a production site.
// Use an installed Playwright module (MOVIENIGHT_PLAYWRIGHT_MODULE) and Chrome.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseUrl = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8444';
const artifactDir = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/tmp/movienight-task-1-browser';
const movie = { id: 71, tmdbId: 900001, title: 'Reliable Fixture', releaseYear: 2026,
  mediaType: 'MOVIE', genres: 'Drama', overview: 'Controlled movie discovery fixture.' };
const categories = { categories: [{ id: 'popular', title: 'Most Popular', movies: [movie, ...[2,3,4,5].map((n) => ({...movie, tmdbId: 900001+n, title: `Other Fixture ${n}`}))] }] };
const frontendMovie = { id: '900001', tmdbId: 900001, title: movie.title, year: 2026, mediaType: 'MOVIE' };
const seedUser = { id: '101', username: 'fixture', displayName: 'Fixture User' };
const passed = [];
const check = (name) => { passed.push(name); console.log('PASS', name); };
let library = [], posts = 0, saveMode = 'success', readMode = 'success';
let releaseSave, releaseRead, heldRead, heldSave;

const until = async (predicate) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Controlled request did not reach the expected boundary');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript((user) => {
      if (!localStorage.getItem('movienight_current_user')) {
        localStorage.setItem('movienight_current_user', JSON.stringify(user));
        localStorage.setItem('movienight_token', 'fixture-token');
      }
    }, seedUser);
    await context.route('http://localhost:8080/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/login') return route.fulfill({ json: {
        token: 'other-token', id: 202, username: 'other', displayName: 'Other User', role: 'ROLE_USER',
      } });
      if (path === '/api/movies/library' && request.method() === 'GET') {
        const snapshot = request.headers().authorization === 'Bearer other-token' ? [] : JSON.parse(JSON.stringify(library));
        if (readMode === 'held') {
          readMode = 'success';
          heldRead = true;
          await new Promise((resolve) => { releaseRead = resolve; });
          return route.fulfill({ json: snapshot });
        }
        if (readMode === 'failure') return route.fulfill({ status: 503, json: { message: 'fixture read failure' } });
        return route.fulfill({ json: snapshot });
      }
      if (path === '/api/movies/library' && request.method() === 'POST') {
        posts += 1;
        if (saveMode === 'offline') return route.abort('failed');
        if (saveMode === 'timeout') {
          await new Promise((resolve) => setTimeout(resolve, 16000));
          return route.abort('timedout').catch(() => {});
        }
        if (saveMode === 'failure' || saveMode === 'unauthorized') return route.fulfill({
          status: saveMode === 'failure' ? 500 : 401, json: { message: 'fixture rejection' },
        });
        if (saveMode === 'held') {
          heldSave = true;
          await new Promise((resolve) => { releaseSave = resolve; });
        }
        const input = request.postDataJSON();
        const entry = { id: 501, movie: { ...movie, title: input.title }, status: 'WATCHLIST',
          personalRating: null, notes: input.notes ?? null, createdAt: '2026-10-13T12:00:00' };
        library = [entry];
        return route.fulfill({ status: 201, json: entry });
      }
      if (path.includes('/tmdb/') || path === '/api/movies/71') return route.fulfill({ json: movie });
      if (path === '/api/movies/search') return route.fulfill({ json: [movie] });
      if (path.includes('suggestions') || path.includes('explore')) return route.fulfill({ json: categories });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => { errors.push(err.message); console.error('BROWSER ERROR', err.message); });
    page.on('console', (msg) => { if (msg.text().includes('Maximum update depth')) errors.push(msg.text()); });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor();
    const menu = async (name) => {
      await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const explore = async () => {
      await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
      await page.getByRole('menuitem', { name: 'Explore' }).hover();
      await page.getByRole('menuitem', { name: 'Movies', exact: true }).click();
    };
    const openDetails = async () => {
      await explore();
      await page.getByRole('link', { name: movie.title, exact: true }).first().click();
      await page.getByRole('button', { name: '+ Add to Watchlist', exact: true }).waitFor();
    };
    await openDetails();
    assert.equal(posts, 0);
    assert.equal(library.length, 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await menu('Watchlist');
    await page.getByText('Nothing on your watchlist yet.', { exact: false }).waitFor();
    check('AC01: browse/details/reload creates no entry');
    await openDetails();
    const addButton = () => page.getByRole('button', { name: '+ Add to Watchlist', exact: true });
    for (const mode of ['failure', 'unauthorized', 'offline']) {
      saveMode = mode;
      await addButton().click();
      await page.getByRole('alert').waitFor();
      await addButton().waitFor({ state: 'visible' });
      assert.equal(await addButton().isEnabled(), true);
      assert.equal(library.length, 0);
      assert.equal(await page.getByText('saved to Watchlist', { exact: false }).count(), 0);
      check(`AC04: ${mode} leaves add retryable without success`);
    }
    saveMode = 'timeout';
    await addButton().click();
    await page.getByRole('alert').filter({hasText: 'Confirmation timed out'}).waitFor();
    assert.equal(await addButton().isEnabled(), true);
    assert.equal(library.length, 0);
    check('AC04: unresponsive save times out and remains retryable');
    await addButton().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      let el = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Add to Watchlist'));
      while (el) { if (getComputedStyle(el).opacity !== '1') return false; el = el.parentElement; }
      return true;
    });
    if (process.env.MOVIENIGHT_BROWSER_SCREENSHOTS !== '0') await page.screenshot({ path: `${artifactDir}/desktop-failed-save.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await addButton().scrollIntoViewIfNeeded();
    if (process.env.MOVIENIGHT_BROWSER_SCREENSHOTS !== '0') await page.screenshot({ path: `${artifactDir}/mobile-failed-save.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    saveMode = 'held';
    heldSave = false;
    const before = posts;
    await addButton().click();
    const pending = page.getByRole('button', { name: 'Saving to Watchlist…', exact: true });
    await pending.waitFor();
    assert.equal(await pending.isDisabled(), true);
    await pending.evaluate((el) => { el.click(); el.click(); });
    assert.equal(library.length, 0);
    await page.waitForFunction(() => !document.body.textContent.includes('saved to Watchlist'));
    await until(() => heldSave);
    assert.equal(posts - before, 1);
    releaseSave();
    await page.getByText(`"${movie.title}" saved to Watchlist`, { exact: true }).waitFor();
    assert.equal(library.length, 1);
    check('AC03/AC05: pending disables duplicate clicks; retry confirms one save');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await menu('Watchlist');
    await page.getByRole('link', { name: movie.title, exact: true }).waitFor();
    check('AC02: confirmed watchlist survives browser reload');
    readMode = 'failure';
    await explore();
    await menu('Watched');
    await page.getByRole('button', { name: 'Retry loading', exact: true }).waitFor();
    assert.equal(await page.getByText('Nothing here yet.', { exact: false }).count(), 0);
    readMode = 'success';
    library = [];
    await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
    await menu('Watchlist');
    await page.getByText('Nothing on your watchlist yet.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: movie.title, exact: true }).count(), 0);
    check('AC06: failed read has retry; successful empty read removes stale entries');

    await explore();
    await page.getByRole('link', { name: 'View all', exact: false }).first().click();
    saveMode = 'failure';
    const gridAdd = page.getByRole('button', { name: `Add ${movie.title} to watchlist`, exact: true });
    await gridAdd.click();
    await page.getByRole('status').filter({ hasText: 'The server could not confirm' }).first().waitFor();
    assert.equal(await gridAdd.isEnabled(), true);
    assert.equal(library.length, 0);
    saveMode = 'success';
    await gridAdd.click();
    await gridAdd.waitFor({ state: 'hidden' });
    assert.equal(library.length, 1);
    check('Discovery grid add handles failure/retry and confirmed membership');
    library = [];
    await explore();
    await menu('Watchlist');
    await page.getByText('Nothing on your watchlist yet.', { exact: false }).waitFor();
    await page.getByRole('link', { name: '+ Add', exact: true }).click();
    await page.getByPlaceholder('Search for a movie title…').fill('Reliable');
    await page.getByRole('button', { name: /Reliable Fixture 2026/ }).click();
    await page.locator('label').filter({ has: page.locator('input[name="target_list"][value="watchlist"]') }).click();
    await page.getByPlaceholder('Personal notes, favorite scenes, or review...').fill('Preserved form note');
    saveMode = 'failure';
    await page.getByRole('button', { name: 'Add movie', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByPlaceholder('e.g. Interstellar').inputValue(), movie.title);
    saveMode = 'success';
    await page.getByRole('button', { name: 'Add movie', exact: true }).click();
    await page.getByRole('link', { name: movie.title, exact: true }).waitFor();
    assert.equal(library[0].notes, 'Preserved form note');
    check('Add movie watchlist form retains fields on failure and saves notes on retry');
    library = [];

    // Mount the real store in an ephemeral browser harness for overlapping requests.
    // This avoids adding test controls or exposing the store in the shipped app.
    const harnessUrl = `${baseUrl}/acceptance-harness`;
    await context.route(harnessUrl, (route) => route.fulfill({ contentType: 'text/html', body: `
      <div id="root"></div>
      <script type="module">
      import {injectIntoGlobalHook} from '/@react-refresh';
      injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
      </script>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import {MovieStoreProvider,useStore} from '/src/store/MovieStore.tsx';
      function Probe(){window.acceptanceStore=useStore();return null;}
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MovieStoreProvider,null,React.createElement(Probe)));
      </script>` }));
    await page.goto(harnessUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.acceptanceStore && !window.acceptanceStore.libraryLoading);
    readMode = 'held'; heldRead = false;
    await page.evaluate(() => { window.pendingRead = window.acceptanceStore.refreshLibrary(); });
    await until(() => heldRead);
    saveMode = 'success';
    const beforeConcurrentSave = posts;
    await page.evaluate((m) => Promise.all([window.acceptanceStore.addToWatchlist(m.id, m), window.acceptanceStore.addToWatchlist(m.id, m)]), frontendMovie);
    assert.equal(posts - beforeConcurrentSave, 1);
    check('Store coalesces simultaneous saves into one request');
    readMode = 'success'; releaseRead();
    await page.evaluate(() => window.pendingRead);
    await page.waitForFunction(() => window.acceptanceStore.entriesFor('101', 'watchlist').length === 1);
    check('AC09: pre-save empty response cannot erase confirmed save');
    library = [];
    await page.evaluate(() => window.acceptanceStore.refreshLibrary());
    saveMode = 'held'; heldSave = false;
    await page.evaluate((m) => { window.pendingSave = window.acceptanceStore.addToWatchlist(m.id, m); }, frontendMovie);
    await until(() => heldSave);
    await page.evaluate(() => window.acceptanceStore.logout());
    await page.evaluate(() => window.acceptanceStore.login('other', 'test-only'));
    releaseSave();
    const oldSave = await page.evaluate(() => window.pendingSave);
    assert.equal(oldSave.ok, false);
    await page.waitForFunction(() => window.acceptanceStore.currentUser?.id === '202');
    assert.equal(await page.evaluate(() => window.acceptanceStore.entriesFor('202', 'watchlist').length), 0);
    check('AC09: late save response does not populate another account');
    assert.deepEqual(errors, []);
    check('No browser exceptions or React update-depth errors');
    fs.writeFileSync(`${artifactDir}/results.json`, JSON.stringify({ passed, browser: browser.version() }, null, 2));
  } finally { await browser.close(); }
})().catch((err) => { console.error(err); process.exitCode = 1; });
