// Controlled browser fixtures prove UI behavior, not real API persistence.
// Run against Vite with MOVIENIGHT_PLAYWRIGHT_MODULE pointing to installed Playwright.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseUrl = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8444';
const artifactDir = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/tmp/movienight-003-browser';
const user = { id: '101', username: 'fixture', displayName: 'Fixture User' };
const movie = { id: 71, tmdbId: 900001, title: 'List-only Fixture', releaseYear: 2026,
  mediaType: 'MOVIE', genres: 'Drama', overview: 'Controlled custom-list fixture.', trailerKey: 'fixture' };
const categories = { categories: [{ id: 'popular', title: 'Most Popular', movies: [movie] }] };
const clone = (value) => JSON.parse(JSON.stringify(value));
const passed = [];
const check = (name) => { passed.push(name); console.log('PASS', name); };
const until = async (predicate) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Controlled request did not reach its expected boundary');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
let lists = [], nextId = 10, mode = 'failure', readMode = 'success', writes = 0, libraryWrites = 0;
let releaseWrite, releaseRead, heldWrite, heldRead, catalogMode = 'success';
const errors = [];

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript((u) => {
      if (!localStorage.getItem('movienight_current_user')) {
        localStorage.setItem('movienight_current_user', JSON.stringify(u));
        localStorage.setItem('movienight_token', 'fixture-token');
        // A historical cache must never supply confirmed server state.
        localStorage.setItem('movienight.customLists', JSON.stringify([{ id: 'old', userId: u.id, title: 'Phantom cache', movieIds: [] }]));
      }
    }, user);
    await context.route('http://localhost:8080/api/**', async (route) => {
      const req = route.request(), path = new URL(req.url()).pathname;
      const other = req.headers().authorization === 'Bearer other-token';
      if (path === '/api/auth/login') {
        const ownerLogin = req.postDataJSON().email === 'fixture@example.com';
        return route.fulfill({ json: { token: ownerLogin ? 'fixture-token' : 'other-token',
          id: ownerLogin ? 101 : 202, username: ownerLogin ? 'fixture' : 'other',
          displayName: ownerLogin ? 'Fixture User' : 'Other User', role: 'ROLE_USER' } });
      }
      if (path === '/api/users/profile' && req.method() === 'PUT') return route.fulfill({ json: { ...user, ...req.postDataJSON() } });
      if (path === '/api/lists' && req.method() === 'GET') {
        if (readMode === 'failure') return route.fulfill({ status: 503, json: {} });
        const snapshot = clone(other ? [] : lists);
        if (readMode === 'held') {
          readMode = 'success'; heldRead = true;
          await new Promise((resolve) => { releaseRead = resolve; });
        }
        return route.fulfill({ json: snapshot });
      }
      const listPath = path.match(/^\/api\/lists\/(\d+)(?:\/movies(?:\/(\d+))?)?$/);
      if (path.startsWith('/api/lists') && req.method() !== 'GET') {
        writes++;
        if (mode === 'offline') return route.abort('failed');
        if (mode === 'failure' || mode === 'unauthorized') return route.fulfill({ status: mode === 'failure' ? 503 : 401, json: {} });
        if (mode === 'timeout') {
          await new Promise((resolve) => setTimeout(resolve, 16000));
          return route.abort('timedout').catch(() => {});
        }
        if (mode === 'held') {
          heldWrite = true;
          await new Promise((resolve) => { releaseWrite = resolve; });
        }
        const input = req.postData() ? req.postDataJSON() : {};
        if (path === '/api/lists') {
          assert.ok((input.initialMovieIds || []).every((id) => id === movie.id), 'create uses the exact catalog key');
          const list = { id: nextId++, userId: 101, title: input.title, isPublic: false,
            entries: input.initialMovieIds?.length ? [{ id: 501, movie, position: 0 }] : [],
            createdAt: '2026-10-19T12:00:00' };
          lists.unshift(list);
          return route.fulfill({ status: 201, json: list });
        }
        const list = lists.find((list) => list.id === Number(listPath?.[1]));
        if (!list) return route.fulfill({ status: 404, json: {} });
        if (path.includes('/movies')) {
          if (req.method() === 'POST') {
            assert.equal(input.movieId, movie.id, 'membership POST uses catalog key, not TMDB ID');
            if (!list.entries.some((entry) => entry.movie.id === movie.id)) list.entries.push({ id: 501, movie, position: list.entries.length });
          } else {
            assert.equal(Number(listPath[2]), movie.id, 'membership DELETE uses catalog key');
            list.entries = [];
          }
        } else if (req.method() === 'PUT') list.title = input.title;
        else {
          lists = lists.filter((existing) => existing.id !== list.id);
          return route.fulfill({ json: { message: 'Deleted' } });
        }
        return route.fulfill({ json: list });
      }
      if (listPath) {
        const list = lists.find((list) => list.id === Number(listPath[1]));
        return route.fulfill({ status: list ? 200 : 404, json: list || {} });
      }
      if (path === '/api/movies/library') {
        if (req.method() !== 'GET') libraryWrites++;
        return route.fulfill({ json: [] });
      }
      if (path.includes('/tmdb/') || path === '/api/movies/71') return route.fulfill({ json: catalogMode === 'conflict' ? { ...movie, mediaType: 'TV' } : movie });
      if (path === '/api/movies/search') return route.fulfill({ json: [movie] });
      if (path.includes('suggestions') || path.includes('explore')) return route.fulfill({ json: categories });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => { if (msg.text().includes('Maximum update depth')) errors.push(msg.text()); });
    const menu = async (name) => {
      await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const listHeading = (name) => page.getByRole('heading', { name, exact: true });
    const reloadLists = () => page.getByRole('button', { name: 'Reload lists', exact: true });
    const openDetails = async () => {
      await page.getByRole('button', { name: 'Navigation Menu', exact: true }).hover();
      await page.getByRole('menuitem', { name: 'Explore' }).hover();
      await page.getByRole('menuitem', { name: 'Movies', exact: true }).click();
      await page.getByRole('link', { name: movie.title, exact: true }).first().click();
      await page.getByRole('button', { name: '+ Add to list', exact: true }).waitFor();
    };
    page.setDefaultTimeout(10000);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await menu('Lists');
    await page.getByText('Nothing here yet.', { exact: false }).waitFor();
    assert.equal(await listHeading('Phantom cache').count(), 0);
    await page.getByRole('button', { name: '+ New List', exact: true }).click();
    await page.getByRole('textbox', { name: 'List title', exact: true }).fill('Weekend picks');
    for (const failure of ['failure', 'unauthorized', 'offline', 'timeout']) {
      mode = failure;
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('alert').waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Create', exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'List title', exact: true }).inputValue(), 'Weekend picks');
      assert.equal(lists.length, 0);
      assert.equal(await listHeading('Weekend picks').count(), 0);
      check(`AC05: ${failure} retains create input without a phantom list`);
    }
    mode = 'held';
    const beforeHeld = writes;
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await until(() => heldWrite);
    assert.equal(await page.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true);
    assert.equal(await listHeading('Weekend picks').count(), 0);
    assert.equal(writes, beforeHeld + 1);
    mode = 'success'; releaseWrite();
    await listHeading('Weekend picks').waitFor();
    check('AC05: pending create is disabled and only becomes visible after confirmation');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await menu('Lists');
    await listHeading('Weekend picks').click();
    await page.getByRole('button', { name: 'Rename list', exact: true }).click();
    await page.getByRole('textbox', { name: 'List title', exact: true }).fill('Comfort rewatches');
    mode = 'failure';
    await page.getByRole('button', { name: 'Save name', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await listHeading('Weekend picks').waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'List title', exact: true }).inputValue(), 'Comfort rewatches');
    mode = 'success';
    await page.getByRole('button', { name: 'Save name', exact: true }).click();
    await listHeading('Comfort rewatches').waitFor();
    check('AC01/AC05: rename failure retains saved name/input; retry confirms new name');
    await openDetails();
    await page.getByRole('button', { name: '+ Add to list', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add to custom list' });
    const membership = (name) => dialog.getByRole('button', { name, exact: true });
    mode = 'failure';
    await membership('Comfort rewatches').click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await membership('Comfort rewatches').getAttribute('aria-pressed'), 'false');
    catalogMode = 'conflict'; mode = 'success';
    const beforeConflict = writes;
    await membership('Comfort rewatches').click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(writes, beforeConflict, 'conflicting resource type cannot produce a list write');
    assert.equal(await membership('Comfort rewatches').getAttribute('aria-pressed'), 'false');
    catalogMode = 'success';
    await membership('Comfort rewatches').click();
    await page.getByRole('button', { name: 'In Lists (1)', exact: true }).waitFor();
    assert.equal(await membership('Comfort rewatches').getAttribute('aria-pressed'), 'true');
    await dialog.getByRole('button', { name: /Create new list/ }).click();
    await dialog.getByRole('textbox', { name: 'New list title' }).fill('Friday night');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('button', { name: 'In Lists (2)', exact: true }).waitFor();
    mode = 'failure';
    await membership('Comfort rewatches').click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await membership('Comfort rewatches').getAttribute('aria-pressed'), 'true');
    mode = 'success';
    await membership('Comfort rewatches').click();
    await page.getByRole('button', { name: 'In Lists (1)', exact: true }).waitFor();
    assert.equal(await membership('Friday night').getAttribute('aria-pressed'), 'true');
    assert.equal(libraryWrites, 0);
    check('AC02/AC03/AC05: two lists, exact catalog keys, failed add/remove retained, no library writes');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await menu('Lists');
    await listHeading('Friday night').click();
    await page.getByRole('link', { name: movie.title, exact: true }).waitFor();
    check('AC02: list-only movie metadata and membership hydrated after reload');
    await menu('Lists');
    await page.getByRole('button', { name: 'Delete list Friday night', exact: true }).click();
    mode = 'failure';
    await page.getByRole('button', { name: 'Yes, delete', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await listHeading('Friday night').waitFor();
    mode = 'success';
    await page.getByRole('button', { name: 'Yes, delete', exact: true }).click();
    await listHeading('Friday night').waitFor({ state: 'hidden' });
    await listHeading('Comfort rewatches').waitFor();
    check('AC03/AC05: failed delete preserves list; retry removes only that list');
    readMode = 'failure';
    await reloadLists().click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Nothing here yet.', { exact: false }).count(), 0);
    readMode = 'success';
    await reloadLists().click();
    await listHeading('Comfort rewatches').waitFor();
    check('AC06: failed load is distinct from empty and reload recovers');
    lists = [];
    await reloadLists().click();
    await page.getByText('Nothing here yet.', { exact: false }).waitFor();
    assert.equal(await listHeading('Comfort rewatches').count(), 0);
    check('AC06: empty server response clears previously loaded lists');
    await page.getByRole('button', { name: '+ New List', exact: true }).click();
    await page.getByRole('textbox', { name: 'List title', exact: true }).fill('Desktop and mobile review');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await listHeading('Desktop and mobile review').waitFor();
    if (process.env.MOVIENIGHT_BROWSER_SCREENSHOTS !== '0') await page.screenshot({ path: `${artifactDir}/desktop-lists.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.MOVIENIGHT_BROWSER_SCREENSHOTS !== '0') await page.screenshot({ path: `${artifactDir}/mobile-lists.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A catalog-only movie must not collide with a discovered movie's provider ID.
    lists.push({ id: 90, userId: 101, title: 'Catalog-only list', isPublic: false,
      entries: [{ id: 601, movie: { id: 900001, title: 'Catalog-only Fixture', mediaType: 'MOVIE' }, position: 0 }],
      createdAt: '2026-10-19T12:00:00' });
    await reloadLists().click();
    await listHeading('Catalog-only list').click();
    await page.getByRole('link', { name: 'Catalog-only Fixture', exact: true }).waitFor();
    await openDetails();
    await page.getByRole('button', { name: '+ Add to list', exact: true }).click();
    assert.equal(await membership('Catalog-only list').getAttribute('aria-pressed'), 'false');
    await membership('Catalog-only list').click();
    await page.getByRole('button', { name: 'In Lists (1)', exact: true }).waitFor();
    assert.equal(lists.find((list) => list.id === 90).entries.length, 2);
    await menu('Lists');
    await listHeading('Catalog-only list').click();
    await page.getByRole('link', { name: 'Catalog-only Fixture', exact: true }).waitFor();
    await page.getByRole('link', { name: movie.title, exact: true }).waitFor();
    check('AC02: catalog-only and provider IDs with the same number remain distinct in the UI');
    await menu('Lists');
    // Saving a profile refreshes the same account while an earlier list write is pending.
    await page.getByRole('button', { name: '+ New List', exact: true }).click();
    await page.getByRole('textbox', { name: 'List title', exact: true }).fill('Survives overlapping reload');
    mode = 'held'; heldWrite = false;
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await until(() => heldWrite);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByPlaceholder('Your Display Name').fill('Updated Fixture User');
    readMode = 'held'; heldRead = false;
    await page.getByRole('button', { name: 'Save Profile', exact: true }).click();
    await until(() => heldRead);
    mode = 'success'; releaseWrite();
    await until(() => lists.some((list) => list.title === 'Survives overlapping reload'));
    releaseRead();
    await menu('Lists');
    await listHeading('Survives overlapping reload').waitFor();
    check('AC06: stale same-account refresh cannot erase a confirmed list write');
    // An old-account write must never populate the new account after sign-out/login.
    await page.getByRole('button', { name: '+ New List', exact: true }).click();
    await page.getByRole('textbox', { name: 'List title', exact: true }).fill('Previous account only');
    mode = 'held'; heldWrite = false;
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await until(() => heldWrite);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).fill('other@example.com');
    await page.getByPlaceholder('Enter your password').fill('password');
    await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Email Address', exact: true }) }).getByRole('button', { name: 'Sign In', exact: true }).click();
    await menu('Lists');
    await page.getByText('Nothing here yet.', { exact: false }).waitFor();
    mode = 'success'; releaseWrite();
    await reloadLists().click();
    await page.getByText('Nothing here yet.', { exact: false }).waitFor();
    assert.equal(await listHeading('Previous account only').count(), 0);
    assert.equal(await listHeading('Desktop and mobile review').count(), 0);
    check('AC06: late previous-account save cannot populate the new account');
    const signInAs = async (email) => {
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await page.getByRole('textbox', { name: 'Email Address', exact: true }).fill(email);
      await page.getByPlaceholder('Enter your password').fill('password');
      await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Email Address', exact: true }) }).getByRole('button', { name: 'Sign In', exact: true }).click();
      await menu('Lists');
    };
    await signInAs('fixture@example.com');
    await listHeading('Desktop and mobile review').waitFor();
    readMode = 'held'; heldRead = false;
    await reloadLists().click();
    await until(() => heldRead);
    await signInAs('other@example.com');
    await page.getByText('Nothing here yet.', { exact: false }).waitFor();
    releaseRead();
    await reloadLists().click();
    await page.getByText('Nothing here yet.', { exact: false }).waitFor();
    assert.equal(await listHeading('Desktop and mobile review').count(), 0);
    check('AC06: late previous-account read cannot restore private lists');
    assert.equal(libraryWrites, 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${artifactDir}/results.json`, JSON.stringify({ passed, libraryWrites, errors }, null, 2));
  } finally { await browser.close(); }
})().catch((err) => { console.error(err); process.exitCode = 1; });
