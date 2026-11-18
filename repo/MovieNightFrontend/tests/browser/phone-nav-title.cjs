// Tickets #27 (PB01–PB04) and #28 (PT01–PT04): phone bottom bar, title page and hero.
// Phone emulation only; physical-device keyboard behaviour is checked separately.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseUrl = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const selected = process.argv[2] || 'all';
const tests = [];
const test = (name, run) => tests.push({ name, run });
const phone = (width = 390, height = 844) => ({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

async function signup(page) {
  const username = `pn${Date.now()}${Math.floor(Math.random() * 10000)}`;
  await page.goto(baseUrl);
  await page.locator('button[type=button]').filter({ hasText: 'Create Account' }).click();
  const form = page.locator('form').filter({ has: page.locator('input[aria-label="Confirm Password"]') });
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill(`${username}@example.test`);
  await form.getByRole('textbox', { name: 'Username', exact: true }).fill(username);
  await form.locator('input[aria-label="Password"]').fill('Demo027-pass');
  await form.locator('input[aria-label="Confirm Password"]').fill('Demo027-pass');
  await form.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).waitFor();
}

async function noOverflow(page, label) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${label}: no horizontal overflow`);
}

// Opens the first movie Explore lists, so the check runs against any seeded catalog.
async function openFirstTitle(page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Explore/ }).click();
  await page.getByRole('menuitem', { name: 'Movies', exact: true }).click();
  await page.locator('main a[href^="/movies/"]').first().click();
  const hero = page.locator('section[aria-label$=" hero banner"]');
  await hero.waitFor();
  const label = await hero.getAttribute('aria-label');
  return label.replace(/ hero banner$/, '');
}

async function waitUntil(check, message) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(message);
}

const isDimmed = backdrop => backdrop.evaluate(el => {
  const bg = getComputedStyle(el).backgroundColor;
  const alpha = bg.startsWith('rgba') ? Number(bg.split(',')[3].replace(')', '')) : (bg === 'transparent' ? 0 : 1);
  return alpha > 0.05;
});

test('bottom-bar', async browser => {
  const context = await browser.newContext(phone());
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await signup(page);
    const bar = page.getByRole('navigation', { name: 'Primary', exact: true });

    // PB01: exactly three items; MN monogram goes home.
    assert.equal(await bar.locator('a, button').count(), 3, 'PB01 bar has three items');
    const monogram = bar.getByRole('link', { name: 'Movie Night home', exact: true });
    assert.equal(await monogram.textContent(), 'MN');
    await bar.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings');
    await monogram.click();
    await page.waitForURL(url => new URL(url).pathname === '/');

    // PB02: opening the menu never focuses a text field.
    const trigger = bar.getByRole('button', { name: 'Menu', exact: true });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Navigation Menu' });
    await panel.waitFor();
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'INPUT', 'PB02 no keyboard on open');
    // Non-modal: the bar stays usable, so focus moved to it is not pulled back into the panel.
    assert.equal(await panel.getAttribute('aria-modal'), null, 'menu is not modal');
    await trigger.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Menu', 'focus can rest on the bar');

    // PB03: the panel's bottom edge touches the bar's top edge; no transform animation.
    const panelBox = await panel.boundingBox();
    const barBox = await bar.boundingBox();
    assert(Math.abs(panelBox.y + panelBox.height - barBox.y) <= 1, `PB03 panel touches bar (${panelBox.y + panelBox.height} vs ${barBox.y})`);
    assert.equal(panelBox.width, barBox.width, 'PB03 panel spans the bar width');
    const motion = await panel.evaluate(el => {
      const style = getComputedStyle(el);
      const timed = style.transitionDuration.split(',').some(d => parseFloat(d) > 0.001);
      return { transform: style.transform, transition: timed ? style.transitionProperty : 'none', duration: parseFloat(style.animationDuration) };
    });
    assert.equal(motion.transform, 'none', 'PB03 no transform');
    assert(!/transform|translate|all/.test(motion.transition), `PB03 no transform transition (${motion.transition})`);
    assert(motion.duration <= 0.1, 'PB03 fade at most 100ms');

    // PB04: undimmed until the search field is focused.
    const backdrop = page.getByTestId('phone-menu-backdrop');
    assert.equal(await isDimmed(backdrop), false, 'PB04 page undimmed with menu open');
    await panel.getByRole('textbox', { name: 'Search titles' }).tap();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search titles', 'tapping search focuses it');
    await waitUntil(() => isDimmed(backdrop), 'PB04 dimmed while searching');
    // Escape closes the whole menu, even from the search field (existing keyboard contract).
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });

    // Closing: tapping the menu button again, tapping outside, MN on the current route, navigating.
    await trigger.click();
    await panel.waitFor();
    await trigger.click();
    await panel.waitFor({ state: 'detached' });
    await trigger.click();
    await page.mouse.click(195, 200);
    await panel.waitFor({ state: 'detached' });
    await trigger.click();
    await monogram.click();
    await panel.waitFor({ state: 'detached' });
    await trigger.click();
    await panel.getByRole('menuitem', { name: 'Friends', exact: true }).click();
    await page.waitForURL('**/friends');
    assert.equal(await panel.count(), 0, 'navigating closes the menu');
    await noOverflow(page, 'bottom bar');
  } finally { await context.close(); }
});

// #28 PT01–PT03 (PT01/PT02 revised by #44): portrait poster, inline trailer box, one-row actions.
test('title-page', async browser => {
  const context = await browser.newContext(phone());
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await signup(page);
    // Controlled player fixture; no live playback claim.
    await page.route('**/api/movies/tmdb/**', async route => {
      const data = await (await route.fetch()).json();
      await route.fulfill({ json: { ...data, trailerKey: 'fixture-player' } });
    });
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
    const title = await openFirstTitle(page);

    // PT01 (as revised by #44, which replaced the centred poster): a portrait poster, not a backdrop.
    const hero = page.getByRole('region', { name: `${title} hero banner`, exact: true });
    const poster = hero.getByTestId('compact-title-poster');
    await poster.waitFor();
    const box = await poster.boundingBox();
    assert(box.height > box.width * 1.3, `PT01 poster is portrait (${box.width}x${box.height})`);
    assert(box.width >= 390 * 0.25 && box.width <= 390 * 0.36, `PT01 poster ~30% width (${box.width})`);

    // PT02 (as revised by #44): ▶ plays inline in the 16:9 trailer box; closing restores the backdrop.
    const trailerBox = hero.getByTestId('trailer-box');
    await trailerBox.getByRole('button', { name: 'Play trailer', exact: true }).click();
    const player = trailerBox.locator('iframe');
    await player.waitFor();
    await waitUntil(async () => { const b = await player.boundingBox(); return b && Math.abs(b.width / b.height - 16 / 9) < 0.02; }, 'PT02 trailer settles at 16:9');
    const video = await player.boundingBox();
    assert(Math.abs(video.width / video.height - 16 / 9) < 0.02, `PT02 trailer is 16:9 (${video.width}x${video.height})`);
    assert(video.width >= 390 - 40 - 3, `PT02 trailer spans the content width (${video.width})`);
    await hero.getByRole('button', { name: 'Close trailer', exact: true }).click();
    await trailerBox.getByTestId('trailer-backdrop').waitFor();
    assert.equal(await player.count(), 0, 'PT02 trailer removed');

    // PT03: actions in one row from 360 to 430px. The trailer action is the ▶ in the trailer box (#44).
    for (const width of [360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const tops = await page.getByTestId('title-actions').evaluate(row =>
        Array.from(row.querySelectorAll('button')).filter(b => b.closest('[data-testid="title-actions"]') === row && !b.closest('[role="dialog"]'))
          .map(b => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), h: r.height, w: r.width, name: b.getAttribute('aria-label') || b.textContent }; }));
      assert(tops.length >= 3, `PT03 watchlist, watched and list actions at ${width}px (${tops.length})`);
      assert(!tops.some(t => /trailer/i.test(t.name)), `PT03 one trailer control only at ${width}px`);
      assert.equal(new Set(tops.map(t => t.top)).size, 1, `PT03 one row at ${width}px: ${JSON.stringify(tops)}`);
      for (const t of tops) assert(t.h >= 44 && t.w >= 44, `PT03 tap target ≥44px at ${width}px: ${JSON.stringify(t)}`);
      await noOverflow(page, `title page ${width}px`);
    }

    // The compact buttons still work: watchlist save (real API), list picker, rating panel.
    const actions = page.getByTestId('title-actions');
    await actions.getByRole('button', { name: /^(\+ )?Add to Watchlist$/ }).click();
    await actions.getByRole('button', { name: 'Remove from Watchlist', exact: true }).waitFor();
    await actions.getByRole('button', { name: /Add to list|In Lists/ }).click();
    await page.getByRole('dialog', { name: 'Add to custom list', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await actions.getByRole('button', { name: 'Mark as Watched', exact: true }).click();
    await page.getByRole('slider', { name: 'Personal rating' }).waitFor();

    // Tablets (768px+) keep the wide title hero; #28 covers phones only.
    await page.setViewportSize({ width: 820, height: 1180 });
    await waitUntil(async () => (await poster.count()) === 0, 'tablet title page uses the wide hero');
    assert.equal(await page.getByTestId('title-actions').count(), 0, 'tablet keeps the wide action row');
    await noOverflow(page, 'title page 820px');
  } finally { await context.close(); }
});

// #28 PT04: the phone home hero uses portrait posters and fits within 70vh.
test('home-hero', async browser => {
  const context = await browser.newContext(phone());
  try {
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await signup(page);
    const hero = page.getByRole('region', { name: 'Curated spotlight hero banner' });
    await hero.waitFor();
    for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      await waitUntil(async () => (await hero.boundingBox()).height <= height * 0.7 + 1, `PT04 hero ≤70vh at ${width}x${height} (${(await hero.boundingBox()).height})`);
      const active = hero.locator('[aria-roledescription="slide"][aria-hidden="false"]');
      const poster = await active.getByTestId('hero-poster').boundingBox();
      assert(poster.height > poster.width * 1.3, `PT04 portrait poster at ${width}px`);
      const title = await active.locator('h1').first().boundingBox();
      assert(title.y >= poster.y + poster.height - 1, 'PT04 title sits below the poster');
      await noOverflow(page, `home ${width}px`);
    }
    // Tablets keep the backdrop hero.
    await page.setViewportSize({ width: 820, height: 1180 });
    await waitUntil(async () => (await hero.getByTestId('hero-poster').count()) === 0, 'tablet home hero uses the backdrop layout');
  } finally { await context.close(); }
});

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    assert(selected === 'all' || tests.some(t => t.name === selected), 'Unknown test selection');
    for (const { name, run } of tests) {
      if (selected !== 'all' && selected !== name) continue;
      await run(browser);
      console.log('PASS', name);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
