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
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');

const app = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const artifacts = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/private/tmp/issue-3-5-controls';
fs.mkdirSync(artifacts, { recursive: true });
const serverReady = () => new Promise(resolve => {
  const request = http.get(app, () => resolve(true));
  request.on('error', () => resolve(false));
  request.setTimeout(800, () => { request.destroy(); resolve(false); });
});

async function signIn(page) {
  await page.route('**/api/auth/**', route => {
    if (new URL(route.request().url()).pathname.startsWith('/src/')) return route.continue();
    const user = { id: 37, username: 'controls', displayName: 'Controls', email: 'controls@example.test', role: 'USER' };
    const url = route.request().url();
    route.fulfill({ json: url.includes('check-name') ? { available: true } : url.endsWith('/me') ? user : { ok: true, user, token: 'controls-token', tokenType: 'Bearer' } });
  });
  await page.route('**/api/friends*', route => new URL(route.request().url()).pathname.startsWith('/src/') ? route.continue() : route.fulfill({
    json: [{ id: 1, friendId: 99, username: 'alice', displayName: 'Alice', status: 'ACCEPTED' }]
  }));
  await page.route('**/api/lists*', route => new URL(route.request().url()).pathname.startsWith('/src/') ? route.continue() : route.fulfill({
    json: [{ id: 10, title: 'Favorites', description: 'Best movies', movieCount: 1, updatedAt: '2026-10-31' }]
  }));
  await page.route('**/api/movies/library*', route => new URL(route.request().url()).pathname.startsWith('/src/') ? route.continue() : route.fulfill({
    json: [{ id: 1, movieId: '301', movie: { id: 301, tmdbId: 301, title: 'Search Result', mediaType: 'MOVIE', releaseYear: 2025 }, status: 'WATCHED', rating: 9 }]
  }));
  await page.route('**/api/movies/301*', route => new URL(route.request().url()).pathname.startsWith('/src/') ? route.continue() : route.fulfill({
    json: { id: 301, tmdbId: 301, title: 'Search Result', mediaType: 'MOVIE', releaseYear: 2025, overview: 'Sample overview', runtime: 120, imdb: 8.5, tmdbRating: 8.2 }
  }));
  await page.route('**/api/movies/explore/**', route => new URL(route.request().url()).pathname.startsWith('/src/') ? route.continue() : route.fulfill({
    json: []
  }));
  await page.route('**/api/movies/search*', route => {
    if (new URL(route.request().url()).pathname.startsWith('/src/')) return route.continue();
    const q = new URL(route.request().url()).searchParams.get('query') || '';
    if (q.includes('explode')) return route.fulfill({ status: 503, json: { message: 'Catalog unavailable' } });
    return route.fulfill({ json: q.includes('missing') ? [] : [{ id: 301, tmdbId: 301, title: 'Search Result', mediaType: 'MOVIE', releaseYear: 2025 }] });
  });
  await page.goto(app);
  await page.getByRole('button', { name: 'Create Account', exact: true }).first().click();
  const form = page.locator('form').filter({ has: page.locator('input[aria-label="Confirm Password"]') });
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill('controls@example.test');
  await form.getByRole('textbox', { name: 'Username', exact: true }).fill('controls');
  await form.locator('input[aria-label="Password"]').fill('Demo-pass');
  await form.locator('input[aria-label="Confirm Password"]').fill('Demo-pass');
  await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).waitFor();
}

async function verify(browser, viewport) {
  const mobile = viewport.width < 600;
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    page.setDefaultTimeout(15000);
    await signIn(page);
    if (!mobile) {
      await page.getByRole('button', { name: 'Navigation Menu' }).click();
      await page.getByRole('menuitem', { name: 'Friends', exact: true }).click();
      await page.getByRole('heading', { name: 'Friends', exact: true }).waitFor();
      const friendInput = page.getByRole('textbox', { name: 'Username, display name, or email' });
      await friendInput.focus();
      assert(await friendInput.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 2), 'Other text inputs retain a focus ring');
      await page.getByRole('button', { name: 'Navigation Menu' }).click();
      assert.equal(await page.getByRole('menuitem', { name: 'Friends', exact: true }).getAttribute('aria-current'), 'page', 'Current destination is announced');
      await page.getByRole('menuitem', { name: 'Friends', exact: true }).click();
    }
    if (mobile) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      const watched = page.getByRole('menuitem', { name: 'Watched', exact: true });
      assert.equal(await watched.evaluate(el => el.tagName), 'A', 'Phone navigation destination uses an anchor');
      assert((await watched.boundingBox()).height >= 44, 'Phone navigation target is touch sized');
    }
    const search = page.getByRole('textbox', { name: 'Search titles' });
    const field = search.locator('xpath=..');
    const before = await field.boundingBox();
    await search.click();
    const pointer = await field.evaluate(el => getComputedStyle(el).boxShadow);
    assert(pointer === 'none' || pointer === 'rgba(0, 0, 0, 0) 0px 0px 0px 0px', 'Pointer focus stays calm');
    await search.pressSequentially('test');
    const pointerTyping = await field.evaluate(el => getComputedStyle(el).boxShadow);
    assert(pointerTyping === 'none' || pointerTyping === 'rgba(0, 0, 0, 0) 0px 0px 0px 0px', 'Pointer focus stays calm while typing');
    await search.fill('');
    await search.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const keyboard = await field.evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderColor }));
    assert.notEqual(keyboard.shadow, 'none', 'Keyboard focus gives the field one visible ring');
    const after = await field.boundingBox();
    assert.equal(after.width, before.width, 'Focus must not resize search');
    await page.screenshot({ path: path.join(artifacts, `search-${viewport.width}.png`) });
    await search.fill('Search Result '.repeat(25));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Long query does not overflow');
    await page.getByRole('button', { name: 'Clear search' }).click();
    assert.equal(await search.inputValue(), '', 'Clear action empties query');
    await search.fill('missing');
    await page.getByRole('link', { name: /Search full online catalog/ }).waitFor();
    assert(await page.getByText('No results for “missing”').isVisible(), 'Empty result message remains usable');
    await search.fill('explode');
    try {
      await page.getByRole('alert').filter({ hasText: /Change the search to retry/ }).waitFor();
    } catch (error) {
      console.error('Search popover on failure:', (await page.getByRole('listbox', { name: 'Search results' }).innerText()).slice(0, 500));
      throw error;
    }
    assert(await page.getByRole('link', { name: /Search full online catalog/ }).isVisible(), 'Full search remains available on error');
    await search.press('Escape');
    assert.equal(await page.getByRole('listbox', { name: 'Search results' }).count(), 0, 'Escape closes suggestions');
    if (mobile) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const finalSearch = mobile ? page.getByRole('textbox', { name: 'Search titles' }) : search;
    await finalSearch.fill('Search Result');
    const result = page.getByRole('option', { name: /Search Result/ });
    await result.waitFor();
    assert.equal(await result.evaluate(el => el.tagName), 'A', 'Search result is a native anchor');
    await finalSearch.press('ArrowDown');
    assert.equal(await result.getAttribute('aria-selected'), 'true', 'Arrow key selects result');
    await finalSearch.press('Enter');
    await page.waitForURL('**/movies/**');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'No page overflow');
    console.log(`PASS controls/search ${viewport.width}x${viewport.height}`);
  } finally { await context.close(); }
}

async function verifyCoreScreensAndZoom(browser) {
  // Test layout reflow at 640px width (exact 200% zoom reflow equivalent of 1280px desktop per WCAG 1.4.10)
  const context = await browser.newContext({ viewport: { width: 640, height: 800 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // 1. Authentication (/login)
    await page.goto(`${app}/login`);
    await page.getByRole('button', { name: 'Sign In', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2), 'Login has no horizontal overflow at 200% zoom reflow');

    // Test strict keyboard focus ring on an interactive login input
    const loginInput = page.getByRole('textbox', { name: 'Email Address' });
    await loginInput.focus();
    const loginFocusResult = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { valid: false, reason: 'body focused' };
      const s = getComputedStyle(el);
      const outlineWidth = parseFloat(s.outlineWidth) || 0;
      const hasOutline = outlineWidth >= 2 && s.outlineStyle !== 'none' && s.outlineColor !== 'transparent';
      const hasShadow = s.boxShadow !== 'none' && s.boxShadow.includes('rgb');
      return { valid: hasOutline || hasShadow, outlineWidth, boxShadow: s.boxShadow };
    });
    assert(loginFocusResult.valid, `Login input must have visible focus ring >= 2px or focus shadow: got outline ${loginFocusResult.outlineWidth}px, shadow ${loginFocusResult.boxShadow}`);

    // Verify unclipped controls on login
    const loginClipping = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll('button, a[href], input'));
      const viewportWidth = document.documentElement.clientWidth;
      const failures = [];
      for (const el of interactive) {
        if (!el.isConnected || el.offsetParent === null) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > viewportWidth + 3) {
          failures.push({ tag: el.tagName, text: el.innerText?.slice(0, 30), reason: 'exceeds viewport right edge' });
        }
      }
      return failures;
    });
    assert.equal(loginClipping.length, 0, `Login controls must not be clipped: ${JSON.stringify(loginClipping)}`);
    await page.screenshot({ path: path.join(artifacts, 'zoom200-login.png') });

    // Sign in to access authenticated core screens
    await signIn(page);

    const coreScreens = [
      { name: 'Home', path: '/', selector: 'main' },
      { name: 'Explore', path: '/explore/movies', selector: 'main' },
      { name: 'Details', path: '/movies/301', selector: 'main' },
      { name: 'Library', path: '/movies', selector: 'main' },
      { name: 'Lists', path: '/lists', selector: 'main' },
      { name: 'Friends', path: '/friends', selector: 'main' },
      { name: 'Settings', path: '/settings', selector: 'main' },
    ];

    for (const screen of coreScreens) {
      await page.goto(`${app}${screen.path}`);
      await page.locator(screen.selector).first().waitFor();

      // Reflow assertion: zero page-level horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      assert(!overflow, `${screen.name} (${screen.path}) must not have horizontal document overflow at 200% zoom reflow`);

      // Clipping assertion: all visible interactive buttons, links, and inputs must stay within viewport boundaries
      const clipping = await page.evaluate(() => {
        const interactive = Array.from(document.querySelectorAll('button, a[href], input'));
        const viewportWidth = document.documentElement.clientWidth;
        const failures = [];
        for (const el of interactive) {
          if (!el.isConnected || el.offsetParent === null) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > viewportWidth + 3) {
            failures.push({ tag: el.tagName, text: el.innerText?.slice(0, 30), reason: 'clipped beyond viewport right edge', right: rect.right, viewportWidth });
          }
          const s = getComputedStyle(el);
          if (s.overflow !== 'visible' && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) {
            failures.push({ tag: el.tagName, text: el.innerText?.slice(0, 30), reason: 'internal text overflow clipped without ellipsis', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
          }
        }
        return failures;
      });
      assert.equal(clipping.length, 0, `Controls on ${screen.name} must not be clipped: ${JSON.stringify(clipping)}`);

      // Keyboard focus assertion: focused element must NOT be body, must have >= 2px outline or focus shadow (not ordinary border)
      const target = page.locator('button:visible, a[href]:visible, input:visible').first();
      await target.focus();
      const focusResult = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { valid: false, reason: 'body or null is focused' };
        const s = getComputedStyle(el);
        const outlineWidth = parseFloat(s.outlineWidth) || 0;
        const hasOutline = outlineWidth >= 2 && s.outlineStyle !== 'none' && s.outlineColor !== 'transparent';
        const hasShadow = s.boxShadow !== 'none' && s.boxShadow.includes('rgb');
        return { valid: hasOutline || hasShadow, tagName: el.tagName, outlineWidth, boxShadow: s.boxShadow };
      });
      assert(focusResult.valid, `${screen.name} active element <${focusResult.tagName}> must have visible focus ring (outline >= 2px or focus shadow): got outline ${focusResult.outlineWidth}px, shadow ${focusResult.boxShadow}`);

      await page.screenshot({ path: path.join(artifacts, `zoom200-${screen.name.toLowerCase()}.png`) });
    }
    console.log('PASS core screens walkthrough, clipping checks, and 200% zoom reflow verification');
  } finally {
    await context.close();
  }
}

(async () => {
  let server;
  if (!(await serverReady())) {
    server = spawn('npx', ['vite', '--port', new URL(app).port || '8443', '--host', '127.0.0.1'], { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' });
    for (let i = 0; i < 40 && !(await serverReady()); i++) await new Promise(resolve => setTimeout(resolve, 250));
    assert(await serverReady(), `Vite did not start at ${app}`);
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await verify(browser, { width: 1440, height: 900 });
    await verify(browser, { width: 390, height: 844 });
    await verifyCoreScreensAndZoom(browser);
  } finally { await browser.close(); server?.kill('SIGTERM'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
