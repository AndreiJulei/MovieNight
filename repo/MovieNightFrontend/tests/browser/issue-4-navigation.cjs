// Browser boundary for issue #4. Run against the Vite server at MOVIENIGHT_BROWSER_URL.
const assert = require('node:assert/strict');
function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium;
  try { return require('playwright').chromium; }
  catch { return require('/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright').chromium; }
}
const chromium = loadChromium();
const app = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MOVIENIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem('movienight_token', 'fixture-token');
      localStorage.setItem('movienight_current_user', JSON.stringify({ id: '1', username: 'reader', displayName: 'Reader' }));
    });
    const page = await context.newPage();
    page.on('pageerror', error => console.error('PAGE ERROR', error));
    await page.route(url => new URL(url).pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
    await page.route(url => new URL(url).pathname === '/api/movies/explore/movies', route => route.fulfill({ json: { categories: [] } }));
    let categoryReads = 0;
    await page.route(url => new URL(url).pathname === '/api/movies/explore/movies/popular', route => {
      categoryReads++;
      const request = new URL(route.request().url());
      const cursor = Number(request.searchParams.get('cursor') || 0);
      const movies = Array.from({ length: 20 }, (_, index) => ({
        tmdbId: 301 + cursor + index,
        title: `Navigation Movie ${301 + cursor + index}`,
        mediaType: 'MOVIE', releaseYear: 2023,
        releaseDate: '2023-05-01', voteAverage: 8.2, voteCount: 500, posterUrl: null,
      }));
      return route.fulfill({ json: {
        sessionId: 'navigation-session', cursor: cursor + 20, hasMore: cursor === 0,
        totalEligibleInPool: 40, title: 'Popular films', subtitle: 'Movie discovery',
        state: 'READY', updatedAt: new Date().toISOString(), movies,
      } });
    });
    await page.route(url => /\/api\/movies\/tmdb\/\d+$/.test(new URL(url).pathname), route => {
      const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
      const type = new URL(route.request().url()).searchParams.get('mediaType') || 'MOVIE';
      return route.fulfill({ json: { id, tmdbId: id, title: `${type === 'TV' ? 'Navigation Series' : 'Navigation Movie'} ${id}`, mediaType: type, releaseYear: 2023 } });
    });
    await page.route(url => new URL(url).pathname === '/api/users/me', route => route.fulfill({ json: { id: 1, username: 'reader', displayName: 'Reader', role: 'USER' } }));
    const response = await page.goto(`${app}/settings`);
    assert.equal(response?.status(), 200);
    try { await page.getByRole('heading', { name: /settings/i }).waitFor({ timeout: 10000 }); }
    catch (error) { console.error('PAGE CONTENT', (await page.locator('body').innerText()).slice(0, 1000)); throw error; }
    assert.equal(new URL(page.url()).pathname, '/settings', 'direct screen keeps its URL');
    assert.match(await page.title(), /Settings.*Movie Night/, 'BN07: route sets meaningful page title');
    await page.reload();
    await page.getByRole('heading', { name: /settings/i }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/settings', 'reload keeps its URL');
    await page.goto(`${app}/route-that-does-not-exist`);
    await page.getByRole('heading', { name: /page not found/i }).waitFor();
    assert.match(await page.title(), /Page not found.*Movie Night/, 'BN07: 404 sets meaningful page title');
    // Real links and browser history, with the document kept alive across Back/Forward.
    await page.goto(`${app}/settings`);
    await page.evaluate(() => { window.__issue4Document = Math.random(); });
    await page.locator('a[href="/"]:visible').first().click();
    assert.equal(new URL(page.url()).pathname, '/');
    await page.goBack();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    assert.equal(await page.evaluate(() => window.__issue4Document != null), true, 'Back must not reload');
    await page.goForward();
    assert.equal(new URL(page.url()).pathname, '/');

    await page.goto(`${app}/explore/movies/popular?sort=rating&minRating=6`);
    await page.getByRole('heading', { name: /Popular films/ }).waitFor();
    await page.getByRole('link', { name: 'Navigation Movie 301' }).waitFor();
    assert.equal(new URL(page.url()).search, '?sort=rating&minRating=6');
    const initialReads = categoryReads;
    await page.reload();
    await page.getByRole('link', { name: 'Navigation Movie 301' }).waitFor();
    assert.equal(new URL(page.url()).search, '?sort=rating&minRating=6');
    assert(categoryReads > initialReads, 'reload begins a fresh pagination session');
    await page.getByRole('button', { name: 'Load more discovery titles' }).click();
    await page.getByRole('link', { name: 'Navigation Movie 321' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 450));
    await page.waitForFunction(() => window.scrollY > 300);
    const beforeTitleScroll = await page.evaluate(() => window.scrollY);
    const titleLink = page.getByRole('link', { name: 'Navigation Movie 310' });
    await titleLink.waitFor();
    const copiedUrl = await titleLink.getAttribute('href');
    assert(copiedUrl?.startsWith('/movies/'));
    const newTab = await context.newPage();
    await newTab.route(url => new URL(url).pathname === '/api/users/me', route => route.fulfill({ json: { id: 1, username: 'reader', displayName: 'Reader', role: 'USER' } }));
    await newTab.route(url => /\/api\/movies\/tmdb\/\d+$/.test(new URL(url).pathname), route => {
      const request = new URL(route.request().url());
      const id = Number(request.pathname.split('/').at(-1));
      const type = request.searchParams.get('mediaType') || 'MOVIE';
      return route.fulfill({ json: { id, tmdbId: id, title: `${type === 'TV' ? 'Navigation Series' : 'Navigation Movie'} ${id}`, mediaType: type, releaseYear: 2023 } });
    });
    await newTab.goto(new URL(copiedUrl, app).toString());
    assert.equal(new URL(newTab.url()).pathname, new URL(copiedUrl, app).pathname);
    try { await newTab.getByRole('heading', { name: /Navigation Movie 310/ }).waitFor({ timeout: 5000 }); }
    catch (error) { console.error('DIRECT TITLE', newTab.url(), (await newTab.locator('body').innerText()).slice(0, 600)); throw error; }
    await newTab.goto(`${app}/movies/tv:310?type=TV`);
    await newTab.getByRole('heading', { name: /Navigation Series 310/ }).waitFor();
    await newTab.close();
    await titleLink.click();
    await page.getByRole('heading', { name: /Navigation Movie 310/ }).waitFor();
    await page.goBack();
    await page.getByRole('link', { name: 'Navigation Movie 321' }).waitFor();
    assert.equal(new URL(page.url()).search, '?sort=rating&minRating=6');
    await page.waitForFunction(expected => Math.abs(window.scrollY - expected) < 180, beforeTitleScroll, { timeout: 10000 });
    const afterBackScroll = await page.evaluate(() => window.scrollY);
    assert(Math.abs(afterBackScroll - beforeTitleScroll) < 180, 'Back restores Explore scroll');
    await page.waitForFunction(
      expectedHref => document.activeElement?.getAttribute('href') === expectedHref,
      copiedUrl,
      { timeout: 2000 },
    ).catch(() => {});
    const activeHref = await page.evaluate(() => document.activeElement?.getAttribute('href'));
    assert.equal(activeHref, copiedUrl, 'BN07: contextual focus restored to title link on return');
    await page.goForward();
    assert.equal(new URL(page.url()).pathname, new URL(copiedUrl, app).pathname);
    await page.goBack();
    await page.getByRole('link', { name: 'Navigation Movie 302' }).click();
    await page.goBack();
    await page.locator('a[href="/"]:visible').first().click();
    await page.waitForTimeout(400);
    assert.equal(new URL(page.url()).pathname, '/', 'late title response must not override newer navigation');

    // Shelf content can return after the former 1.5-second restoration window.
    let shelfReads = 0;
    let releaseShelves;
    let delayedShelves = new Promise(resolve => { releaseShelves = resolve; });
    await page.route(url => new URL(url).pathname === '/api/movies/explore/movies', async route => {
      if (++shelfReads > 1) await delayedShelves;
      await route.fulfill({ json: { categories: Array.from({ length: 7 }, (_, shelf) => ({
        id: `shelf-${shelf}`, title: `Shelf ${shelf}`, state: 'READY', updatedAt: new Date().toISOString(),
        movies: Array.from({ length: 5 }, (_, index) => ({
          tmdbId: 501 + shelf * 5 + index, title: `Navigation Movie ${501 + shelf * 5 + index}`,
          mediaType: 'MOVIE', releaseYear: 2023,
        })),
      })) } });
    });
    await page.goto(`${app}/explore/movies`);
    const shelfTitle = page.getByRole('link', { name: 'Navigation Movie 521', exact: true });
    await shelfTitle.waitFor();
    await shelfTitle.scrollIntoViewIfNeeded();
    const shelfScroll = await page.evaluate(() => window.scrollY);
    assert(shelfScroll > 500, 'shelf fixture must require meaningful scroll restoration');
    await shelfTitle.click();
    await page.getByRole('heading', { name: 'Navigation Movie 521', exact: true }).waitFor();
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.trim() === 'Movies');
    await page.waitForTimeout(2200);
    releaseShelves();
    await shelfTitle.waitFor();
    await page.waitForFunction(expected => Math.abs(window.scrollY - expected) < 5, shelfScroll, { timeout: 5000 });
    console.log('BN04 delayed Explore shelf scroll restoration passed');

    delayedShelves = new Promise(resolve => { releaseShelves = resolve; });
    await shelfTitle.click();
    await page.getByRole('heading', { name: 'Navigation Movie 521', exact: true }).waitFor();
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.trim() === 'Movies');
    await page.locator('a[href="/"]:visible').first().click();
    await page.waitForURL(`${app}/`);
    // A tall newer screen makes a stale restoration observable rather than clamped.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '5000px';
      document.getElementById('root').append(spacer);
      window.scrollTo(0, 0);
    });
    const lateShelves = page.waitForResponse(url => new URL(url.url()).pathname === '/api/movies/explore/movies');
    releaseShelves();
    await lateShelves;
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'BN04: abandoned restoration must not scroll the newer screen');
    console.log('BN04 pending shelf restoration cancelled on newer navigation');

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${app}/movies/add?q=Dune`);
      const catalogSearch = page.getByPlaceholder('Search for a movie title…');
      await catalogSearch.waitFor();
      await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
      assert.equal(await catalogSearch.inputValue(), 'Dune');
      await catalogSearch.fill('Arrival');
      await page.waitForURL(`${app}/movies/add?q=Arrival`);
      await page.waitForTimeout(100); // Let the route's scheduled focus work finish.
      assert(await catalogSearch.evaluate(input => document.activeElement === input), 'SF03/BN07: query push preserves search focus');
      await page.keyboard.type('s');
      await page.waitForURL(`${app}/movies/add?q=Arrivals`);
      await page.waitForTimeout(100);
      assert(await catalogSearch.evaluate(input => document.activeElement === input), 'SF03/BN07: query replacement preserves search focus');
      await page.keyboard.press('Backspace');
      await page.waitForURL(`${app}/movies/add?q=Arrival`);
      await page.reload();
      await catalogSearch.waitFor();
      await page.waitForFunction(() => document.querySelector('input[placeholder="Search for a movie title…"]')?.value === 'Arrival');
      assert.equal(await catalogSearch.inputValue(), 'Arrival');
      await page.goBack();
      await page.waitForFunction(() => document.querySelector('input[placeholder="Search for a movie title…"]')?.value === 'Dune');
      assert.equal(await catalogSearch.inputValue(), 'Dune');
      await page.goForward();
      await page.waitForFunction(() => document.querySelector('input[placeholder="Search for a movie title…"]')?.value === 'Arrival');
      assert.equal(await catalogSearch.inputValue(), 'Arrival');
      console.log(`SF03/BN07 search focus and query history passed at ${viewport.width}px`);
    }
    console.log('BN01/BN02/BN04/BN05 browser navigation passed');
    await context.close();

    const guest = await browser.newContext({ reducedMotion: 'reduce' });
    const guestPage = await guest.newPage();
    await guestPage.route(url => new URL(url).pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
    await guestPage.route(url => new URL(url).pathname === '/api/auth/login', route => route.fulfill({ json: {
      id: 7, username: 'newreader', displayName: 'New Reader', email: 'new@example.test', token: 'new-token', tokenType: 'Bearer', role: 'USER',
    } }));
    await guestPage.goto(`${app}/explore/tv?category=airing`);
    await guestPage.waitForURL(/\/login\?returnTo=/);
    const destination = new URL(guestPage.url()).searchParams.get('returnTo');
    assert.equal(destination, '/explore/tv?category=airing');
    await guestPage.getByRole('textbox', { name: 'Email Address' }).fill('new@example.test');
    await guestPage.locator('form').filter({ has: guestPage.getByRole('textbox', { name: 'Email Address' }) }).locator('input[aria-label="Password"]').fill('password');
    await guestPage.getByRole('button', { name: 'Sign In', exact: true }).click();
    await guestPage.waitForURL(`${app}/explore/tv?category=airing`);
    console.log('BN03 safe login return passed');
    await guest.close();

    const expired = await browser.newContext();
    await expired.addInitScript(() => localStorage.setItem('movienight_token', 'expired-token'));
    const expiredPage = await expired.newPage();
    await expiredPage.route(url => new URL(url).pathname === '/api/users/me', route => route.fulfill({ status: 401, json: {} }));
    await expiredPage.goto(`${app}/settings`);
    await expiredPage.waitForURL(/\/login\?returnTo=/);
    assert.equal(new URL(expiredPage.url()).searchParams.get('returnTo'), '/settings');
    await expired.close();

    const unavailable = await browser.newContext();
    await unavailable.addInitScript(() => localStorage.setItem('movienight_token', 'valid-token'));
    const unavailablePage = await unavailable.newPage();
    let serverAvailable = false;
    await unavailablePage.route(url => new URL(url).pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
    await unavailablePage.route(url => new URL(url).pathname === '/api/users/me', route => serverAvailable
      ? route.fulfill({ json: { id: 1, username: 'reader', displayName: 'Reader', role: 'USER' } })
      : route.fulfill({ status: 503, json: {} }));
    await unavailablePage.goto(`${app}/settings`);
    await unavailablePage.getByRole('heading', { name: 'Session unavailable' }).waitFor();
    assert.equal(await unavailablePage.evaluate(() => localStorage.getItem('movienight_token')), 'valid-token');
    serverAvailable = true;
    await unavailablePage.getByRole('button', { name: 'Retry session' }).click();
    await unavailablePage.getByRole('heading', { name: 'Settings' }).waitFor();
    await unavailable.close();
    console.log('BN03 expired and transient auth recovery passed');

    const denied = await browser.newContext({ reducedMotion: 'reduce' });
    await denied.addInitScript(() => {
      localStorage.setItem('movienight_token', 'fixture-token');
      History.prototype.pushState = () => { throw new Error('History API denied'); };
      History.prototype.replaceState = () => { throw new Error('History API denied'); };
    });
    const deniedPage = await denied.newPage();
    await deniedPage.route(url => new URL(url).pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
    await deniedPage.route(url => new URL(url).pathname === '/api/users/me', route => route.fulfill({ json: { id: 1, username: 'reader', displayName: 'Reader', role: 'USER' } }));
    await deniedPage.route(url => new URL(url).pathname === '/api/movies/explore/movies', route => route.fulfill({ json: { categories: [] } }));
    await deniedPage.route(url => new URL(url).pathname === '/api/movies/explore/movies/popular', route => route.fulfill({ json: {
      sessionId: 'preview-session', cursor: 1, hasMore: false, totalEligibleInPool: 1,
      title: 'Popular films', subtitle: 'Movie discovery', state: 'READY', updatedAt: new Date().toISOString(),
      movies: [{ tmdbId: 301, title: 'Navigation Movie 301', mediaType: 'MOVIE', releaseYear: 2023, voteAverage: 8.2, voteCount: 500 }],
    } }));
    await deniedPage.route(url => /\/api\/movies\/tmdb\/301$/.test(new URL(url).pathname), route => route.fulfill({ json: {
      id: 301, tmdbId: 301, title: 'Navigation Movie 301', mediaType: 'MOVIE', releaseYear: 2023,
    } }));
    await deniedPage.goto(`${app}/explore/movies/popular`);
    await deniedPage.getByRole('link', { name: 'Navigation Movie 301' }).click();
    await deniedPage.getByRole('button', { name: /Back to Explore/ }).first().click();
    await deniedPage.getByRole('link', { name: 'Navigation Movie 301' }).waitFor();
    assert.equal(new URL(deniedPage.url()).pathname, '/explore/movies/popular', 'preview keeps original browser URL');
    await denied.close();
    console.log('BN06 denied-History preview fallback passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
