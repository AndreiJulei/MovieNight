// Ticket #34 (PD-18) offline read-only library: OF01–OF03.
// Controlled API fixtures prove UI behavior, not real API persistence. The service worker
// exists only in production builds, so run against `vite preview` of `vite build`:
//   npx vite build && PORT=8455 npx vite preview &
//   MOVIENIGHT_BROWSER_URL=http://127.0.0.1:8455 MOVIENIGHT_PLAYWRIGHT_MODULE=/path/to/playwright \
//     node tests/browser/offline-library.cjs
// Poster images are fetched from the real image.tmdb.org, so the first (online) visit needs internet.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseUrl = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8455';
const poster = 'https://image.tmdb.org/t/p/w342/qJ2tW6WMUDux911r6m7haRef0WH.jpg';
const user = { id: 101, username: 'fixture', displayName: 'Fixture User', email: 'fixture@example.com', role: 'ROLE_USER' };
const movie = (id, title, extra = {}) => ({ id, tmdbId: 900000 + id, title, releaseYear: 2020, mediaType: 'MOVIE', posterUrl: null, ...extra });
const library = [
  { id: 1, status: 'WATCHED', personalRating: 8, createdAt: '2026-11-01T10:00:00Z', movie: movie(11, 'Watched Fixture', { posterUrl: poster }) },
  { id: 2, status: 'WATCHLIST', createdAt: '2026-11-02T10:00:00Z', movie: movie(12, 'Watchlist Fixture') },
];
const list = { id: 31, userId: 101, username: 'fixture', displayName: 'Fixture User', title: 'Offline List', shared: false,
  movieCount: 1, entries: [{ id: 1, position: 0, addedAt: '2026-11-03', movie: movie(13, 'List Fixture') }], createdAt: '2026-11-03T10:00:00Z' };

const writes = [];
let meStatus = 200; // the session check's answer
const check = (name) => console.log('PASS', name);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript((u) => {
      if (!localStorage.getItem('movienight_token')) {
        localStorage.setItem('movienight_token', 'fixture-token');
        localStorage.setItem('movienight_current_user', JSON.stringify({ ...u, id: String(u.id) }));
      }
    }, user);
    await context.route('http://localhost:8080/api/**', (route) => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (req.method() !== 'GET') { writes.push(`${req.method()} ${path}`); return route.fulfill({ status: 503, json: {} }); }
      if (path === '/api/users/me') return route.fulfill(meStatus === 200 ? { json: user } : { status: meStatus, json: {} });
      if (path === '/api/movies/library') return route.fulfill({ json: library });
      if (path === '/api/lists') return route.fulfill({ json: [{ ...list, entries: undefined, previewPosterUrls: [] }] });
      if (path === '/api/lists/31') return route.fulfill({ json: list });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();

    // One online visit: the service worker installs and the snapshot is saved.
    await page.goto(`${baseUrl}/movies`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.getByText('Watched Fixture').first().waitFor();
    await page.waitForFunction(() => navigator.serviceWorker.controller != null);
    await page.waitForFunction(() => document.querySelector('img[alt*="Watched Fixture"]')?.complete);
    await page.waitForTimeout(800); // debounced snapshot save
    assert.equal(await page.getByText(/^Offline: showing your library/).count(), 0, 'no banner while online');

    // OF01: network disabled after one online visit.
    await context.setOffline(true);
    await page.reload();
    await page.getByText(/^Offline: showing your library as of /).waitFor();
    await page.getByText('Watched Fixture').first().waitFor();
    const posterLoaded = await page.waitForFunction(() => {
      const img = document.querySelector('img[alt*="Watched Fixture"]');
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 5000 }).then(() => true, () => false);
    assert.ok(posterLoaded, 'the poster seen online comes from the runtime cache offline');
    await page.goto(`${baseUrl}/movies?status=watchlist`);
    await page.getByText('Watchlist Fixture').first().waitFor();
    await page.goto(`${baseUrl}/lists/31`);
    await page.getByText('List Fixture').first().waitFor();
    check('OF01 Watched, Watchlist and a custom list show last-known content offline, with the poster');

    // OF02: edits, Explore and search are blocked with a message.
    assert.equal(await page.getByRole('button', { name: /Rename/i }).isDisabled(), true, 'rename is disabled offline');
    await page.getByText('Lists are read-only offline.', { exact: false }).waitFor();
    await page.goto(`${baseUrl}/lists`);
    await page.getByText('Offline List').first().waitFor();
    assert.equal(await page.getByRole('button', { name: /New list|Create/i }).first().isDisabled(), true, 'create is disabled offline');
    assert.equal(await page.getByRole('searchbox', { name: 'Search titles' }).first().isDisabled(), true, 'search is disabled offline');
    await page.goto(`${baseUrl}/explore/movies`);
    await page.getByRole('heading', { name: 'This screen needs a connection' }).waitFor();
    await page.goto(`${baseUrl}/movies/movie-tmdb-900011`);
    await page.getByRole('heading', { name: 'This screen needs a connection' }).waitFor();
    await page.goto(`${baseUrl}/settings`);
    await page.getByText('Account and integration changes need a connection').waitFor();
    assert.ok(await page.locator('fieldset[disabled] button').count() > 0, 'account and integration controls are disabled');
    assert.equal(await page.getByRole('button', { name: 'Log out' }).isEnabled(), true, 'sign-out stays available offline');
    // Back online: nothing was queued while offline.
    await context.setOffline(false);
    await page.goto(`${baseUrl}/movies`);
    await page.getByText('Watched Fixture').first().waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('Offline: showing your library'));
    assert.deepEqual(writes, [], 'no write reached the API');
    check('OF02 offline edits, Explore and search are blocked with a message and nothing is queued');

    // ADR 0002: only a missing answer opens the snapshot. A 500 is an answer; a 503 gateway error is not.
    meStatus = 500;
    await page.reload();
    await page.getByText('Could not verify your session', { exact: false }).waitFor({ timeout: 20000 });
    assert.equal(await page.getByText('Watched Fixture').count(), 0, 'a server error does not open the snapshot');
    meStatus = 503;
    await page.reload();
    await page.getByText(/^Offline: showing your library as of /).waitFor({ timeout: 60000 });
    await page.getByText('Watched Fixture').first().waitFor();
    meStatus = 200;
    await page.reload();
    await page.waitForFunction(() => !document.body.innerText.includes('Offline: showing your library'));
    check('a 500 shows the retry screen; a sleeping server (503) opens the read-only snapshot');

    // OF03: signing out removes the snapshot.
    await page.goto(`${baseUrl}/settings`);
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL(/\/login/);
    const remaining = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('movienight-offline', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('library');
      open.onsuccess = () => {
        const get = open.result.transaction('library').objectStore('library').get('snapshot');
        get.onsuccess = () => { open.result.close(); resolve(get.result ?? null); };
        get.onerror = () => reject(get.error);
      };
      open.onerror = () => reject(open.error);
    }));
    assert.equal(remaining, null, 'snapshot deleted at sign-out');
    await context.setOffline(true);
    await page.goto(`${baseUrl}/movies`);
    await page.waitForTimeout(500);
    assert.equal(await page.getByText('Watched Fixture').count(), 0, 'no library offline after sign-out');
    check('OF03 signing out removes the offline snapshot');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
