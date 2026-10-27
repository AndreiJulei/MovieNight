// Feature 012 Chrome checks. Real app + deterministic provider; controlled API responses are labelled below.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const fixture = 'http://127.0.0.1:18081';
const artifacts = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/private/tmp/mn012-browser';
fs.mkdirSync(artifacts, { recursive: true });

async function signup(page) {
  const id = `dq012${Date.now()}${Math.floor(Math.random() * 10000)}`;
  await page.goto(app);
  await page.locator('button[type=button]').filter({ hasText: 'Create Account' }).click();
  const form = page.locator('form').filter({ has: page.locator('input[aria-label="Confirm Password"]') });
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill(`${id}@example.test`);
  await form.getByRole('textbox', { name: 'Username', exact: true }).fill(id);
  await form.locator('input[aria-label="Password"]').fill('Demo012-pass');
  await form.locator('input[aria-label="Confirm Password"]').fill('Demo012-pass');
  await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).waitFor();
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

async function realApp(browser, viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await signup(page); await explore(page);
    const popular = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Popular & well rated' }) });
    await popular.getByText('Popular among TMDB viewers').waitFor();
    assert((await popular.locator('a').first().getAttribute('href')).includes('movie:863'));
    await page.getByRole('heading', { name: 'Top Rated', exact: true }).waitFor();
    await noOverflow(page);
    await fetch(`${fixture}/__mode?value=failure`);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/suggestions/explore/movies/popular/refresh') && response.status() >= 500),
      popular.getByRole('button', { name: 'Refresh' }).click(),
    ]);
    await page.getByRole('alert').filter({ hasText: /server could not confirm|provider|refresh/i }).waitFor();
    await popular.getByText('Refresh failed · showing last successful snapshot from').waitFor();
    assert(await popular.getByText('Demo Candidate').count() > 0, 'Failed refresh keeps the last successful shelf');
    await fetch(`${fixture}/__mode?value=success`);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/suggestions/explore/movies/popular/refresh') && response.status() === 200),
      popular.getByRole('button', { name: 'Refresh' }).click(),
    ]);
    await page.getByRole('status', { name: /Refreshing discovery/ }).waitFor({ state: 'hidden' }).catch(() => {});
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `real-${viewport.width}.png`), fullPage: true });
    await popular.locator('a[href*="movie:862"]').click();
    await page.getByRole('button', { name: '+ Add to Watchlist', exact: true }).click();
    await page.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Watched', exact: true }).click();
    await page.getByRole('button', { name: /^(Menu|Navigation Menu)$/ }).click();
    await page.getByRole('menuitem', { name: 'Personal Recommendations', exact: true }).click();
    await page.getByText('Because you watched Demo Seed', { exact: false }).first().waitFor();
    assert(await page.getByText('TMDB audience 7.5/10', { exact: false }).count() > 0);
    await page.screenshot({ path: path.join(artifacts, `personal-${viewport.width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Log Out', exact: true }).click();
    await signup(page);
    await page.getByRole('button', { name: /^(Menu|Navigation Menu)$/ }).click();
    await page.getByRole('menuitem', { name: 'Personal Recommendations', exact: true }).click();
    await page.getByText('No watched movies', { exact: false }).first().waitFor();
    assert.equal(await page.getByText('Because you watched Demo Seed', { exact: false }).count(), 0,
      'Another account sees no previous owner explanation');
    console.log('PASS real app/provider fixture', `${viewport.width}x${viewport.height}`);
  } finally {
    await fetch(`${fixture}/__mode?value=success`);
    await context.close();
  }
}

function controlledRows() {
  const movie = (id, title, rating) => ({ tmdbId: id, title, mediaType: 'MOVIE', releaseYear: 2020 + id % 5,
    voteAverage: rating, voteCount: rating == null ? null : 200, posterUrl: null });
  return { categories: [
    { id: 'newest', title: 'Newest Releases', state: 'EMPTY', movies: [] },
    { id: 'popular', title: 'Popular & well rated', state: 'READY', updatedAt: new Date().toISOString(), movies: [
      movie(101, 'Zulu', 7.2), movie(102, 'Alpha', 8.5), movie(103, 'Bravo', null), movie(104, 'Echo', 5.5), movie(105, 'Delta', 7.0),
    ] },
    { id: 'top-rated', title: 'Top Rated', state: 'EMPTY', movies: [] },
    { id: 'upcoming', title: 'Upcoming Movies', state: 'EMPTY', movies: [] },
  ] };
}

async function controlledBrowser(browser, viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await signup(page);
    let mode = 'READY';
    await page.route('**/api/movies/explore/movies', route => {
      const data = controlledRows();
      const shelf = data.categories[1];
      shelf.state = mode;
      if (mode === 'STALE') shelf.updatedAt = new Date(Date.now() - 30 * 3600000).toISOString();
      if (mode === 'UNAVAILABLE') shelf.movies = [];
      return route.fulfill({ json: data });
    });
    await explore(page);
    const popular = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Popular & well rated' }) });
    await popular.getByRole('link', { name: /View all/ }).click();
    const cards = page.locator('main a[href^="/movies/"]');
    assert((await cards.first().getAttribute('href')).includes('101'), 'Default preserves server order');
    if (viewport.width < 600) {
      await page.getByRole('button', { name: 'Filters' }).click();
      await page.getByRole('dialog', { name: 'Filter Options' }).getByRole('button', { name: 'Title', exact: true }).click();
      await page.getByRole('button', { name: 'Done' }).click();
    } else {
      await page.getByRole('button', { name: /Sort:/ }).click();
      await page.getByRole('option', { name: 'Title' }).click();
    }
    assert((await cards.first().getAttribute('href')).includes('102'), 'Title sort is explicit');
    const choose = async (group, label) => {
      if (viewport.width < 600) {
        await page.getByRole('button', { name: 'Filters' }).click();
        await page.getByRole('dialog', { name: 'Filter Options' }).getByRole('button', { name: label, exact: true }).click();
        await page.getByRole('button', { name: 'Done' }).click();
      } else {
        await page.getByRole('button', { name: new RegExp(`${group}:`) }).click();
        await page.getByRole('option', { name: label, exact: true }).click();
      }
    };
    await choose('Sort', 'TMDB audience rating');
    if (viewport.width >= 600) {
      assert.match(await page.getByRole('button', { name: /Sort:/ }).innerText(), /TMDB audience rating/, 'Desktop sort button label shows TMDB audience rating');
    }
    assert((await cards.first().getAttribute('href')).includes('102'), 'Highest known audience rating is first');
    assert((await cards.last().getAttribute('href')).includes('103'), 'Unknown audience rating sorts last');
    await choose('Rating', 'TMDB audience 6+/10');
    assert.equal(await cards.count(), 3, 'Minimum excludes unknown and low audience ratings');
    await choose('Rating', 'All TMDB ratings');
    await choose('Sort', 'Recommendation order');
    assert((await cards.first().getAttribute('href')).includes('101'), 'Default restores server order');
    assert(await page.getByText('TMDB audience 8.5/10').count() > 0, 'Rating source and scale visible');
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, `controlled-${viewport.width}.png`), fullPage: true });
    mode = 'STALE';
    await page.reload(); await explore(page);
    await page.getByText('Stale snapshot · updated', { exact: false }).waitFor();
    mode = 'UNAVAILABLE';
    await page.reload(); await explore(page);
    await page.getByText('Unavailable · try refreshing').waitFor();
    mode = 'READY';
    await page.reload(); await explore(page);
    let releaseRefresh;
    await page.route('**/api/suggestions/explore/movies/popular/refresh', async route => {
      await new Promise(resolve => { releaseRefresh = resolve; });
      await route.fulfill({ status: 503, json: { message: 'Controlled failure' } });
    });
    const shelf = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Popular & well rated' }) });
    await Promise.all([
      page.waitForRequest(request => request.url().includes('/api/suggestions/explore/movies/popular/refresh')),
      shelf.getByRole('button', { name: 'Refresh' }).click(),
    ]);
    await page.getByText('Refreshing discovery…').waitFor();
    assert(await shelf.getByRole('button', { name: 'Refresh' }).isDisabled(), 'Duplicate refresh is disabled while pending');
    releaseRefresh();
    await shelf.getByText('Refresh failed · showing last successful snapshot from').waitFor();
    console.log('PASS controlled browser responses', `${viewport.width}x${viewport.height}`);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    console.log('Chrome', browser.version());
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await realApp(browser, viewport);
      await controlledBrowser(browser, viewport);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
