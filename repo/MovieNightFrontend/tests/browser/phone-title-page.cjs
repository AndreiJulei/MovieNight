// Ticket #44 (TP01–TP04): IMDb-style phone title page top with a trailer box.
// API responses are mocked, so no backend is needed. Phone emulation only.
//   node tests/browser/phone-title-page.cjs [phone|desktop|all]
//   PHONE_TITLE_BASELINE=print prints the desktop fingerprint used by TP04.
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

function loadChromium() {
  if (process.env.MOVIENIGHT_PLAYWRIGHT_MODULE) return require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE).chromium;
  try { return require('playwright').chromium; } catch {
    const npxDir = path.join(os.homedir(), '.npm', '_npx');
    for (const entry of fs.existsSync(npxDir) ? fs.readdirSync(npxDir) : []) {
      const candidate = path.join(npxDir, entry, 'node_modules', 'playwright');
      if (fs.existsSync(candidate)) return require(candidate).chromium;
    }
    throw new Error('Playwright not found. Set MOVIENIGHT_PLAYWRIGHT_MODULE.');
  }
}

const chromium = loadChromium();
const app = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const selected = process.argv[2] || 'all';

// 1x1 PNG so artwork loads instead of showing broken-image boxes.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const titles = {
  627: {
    id: 627, tmdbId: 627, title: 'Trainspotting', mediaType: 'MOVIE', releaseYear: 1996,
    posterUrl: 'https://image.tmdb.org/t/p/w500/trainspotting-poster.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/trainspotting-backdrop.jpg',
    overview: 'Renton, deeply immersed in the Edinburgh drug scene, tries to clean up and get out, despite the allure of the drugs and the influence of friends.',
    runtimeMinutes: 93, imdbRating: 8.1, tmdbVoteAverage: 8.0, tmdbVoteCount: 9200, rottenTomatoesRating: 90,
    trailerKey: 'fixture-player', director: 'Danny Boyle',
    genres: 'Drama, Comedy, Crime, Dark Comedy, Independent, British Cinema',
    cast: [{ name: 'Ewan McGregor', role: 'Mark Renton', profileUrl: null }],
  },
  101: {
    id: 101, tmdbId: 101, title: 'The Extraordinarily Long Wrapping Title Without Any Trailer', mediaType: 'MOVIE', releaseYear: 2000,
    posterUrl: 'https://image.tmdb.org/t/p/w500/snatch.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/snatch-backdrop.jpg',
    overview: 'Unscrupulous boxing promoters, violent bookmakers and amateur robbers converge on a priceless diamond.',
    runtimeMinutes: 104, imdbRating: 8.2, tmdbVoteAverage: 7.8, tmdbVoteCount: 8000, rottenTomatoesRating: 74,
    trailerKey: null, genres: 'Crime, Comedy',
    cast: [{ name: 'Jason Statham', role: 'Turkish', profileUrl: null }],
  },
};

async function newPage(browser, viewport, isMobile) {
  const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('movienight_token', 'fixture-token-tp');
    localStorage.setItem('movienight_current_user', JSON.stringify({ id: '1', username: 'tptester', displayName: 'TP Tester' }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', err => console.error('PAGE ERROR:', err));
  const json = body => route => route.fulfill({ json: body });
  await page.route(url => new URL(url).hostname === 'image.tmdb.org', route => route.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
  await page.route(url => new URL(url).pathname === '/api/users/me', json({ id: 1, username: 'tptester', displayName: 'TP Tester', role: 'USER' }));
  await page.route(url => new URL(url).pathname === '/api/friends', json([]));
  await page.route(url => new URL(url).pathname === '/api/friends/invitations', json([]));
  await page.route(url => /\/api\/movies\/\d+\/friends-ratings/.test(new URL(url).pathname), json([]));
  await page.route(url => new URL(url).pathname === '/api/movies/library', json([]));
  await page.route(url => /\/api\/movies\/tmdb\/\d+/.test(new URL(url).pathname), route => {
    const id = new URL(route.request().url()).pathname.match(/tmdb\/(\d+)/)[1];
    return titles[id] ? route.fulfill({ json: titles[id] }) : route.fulfill({ status: 404, json: {} });
  });
  await page.route(url => /\/api\/movies\/\d+\/similar/.test(new URL(url).pathname), route => {
    const id = new URL(route.request().url()).pathname.match(/movies\/(\d+)\/similar/)[1];
    const other = titles[id === '627' ? 101 : 627];
    return route.fulfill({ json: [{ ...other, tmdbVoteAverage: 8 }] });
  });
  return { page, context };
}

async function waitUntil(check, message) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(typeof message === 'function' ? await message() : message);
}

async function noOverflow(page, label) {
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert(widths[0] <= widths[1] + 1, `${label}: no horizontal overflow (${widths})`);
}

async function openTitle(page, id, name) {
  await page.goto(`${app}/movies/movie:${id}`);
  await page.locator('h1', { hasText: name }).first().waitFor();
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

// TP01–TP03 and no overflow 360–430px.
test('phone', async browser => {
  const { page, context } = await newPage(browser, { width: 390, height: 844 }, true);
  try {
    await openTitle(page, 627, 'Trainspotting');
    const hero = page.getByRole('region', { name: 'Trainspotting hero banner', exact: true });
    const box = hero.getByTestId('trailer-box');
    await box.waitFor();

    // TP01: title → meta → trailer box → poster + chips + overview → actions.
    const r = async loc => { const b = await loc.boundingBox(); assert(b, 'element is visible'); return b; };
    const h1 = await r(hero.locator('h1'));
    const meta = hero.getByTestId('title-meta');
    assert.equal((await meta.innerText()).replace(/\s+/g, ' ').trim(), '1996 · 1h 33m', 'TP01 meta is year · runtime (no certification known)');
    const metaBox = await r(meta);
    const trailerBox = await r(box);
    const poster = hero.getByTestId('compact-title-poster');
    const posterBox = await r(poster);
    const chips = hero.getByTestId('title-genres');
    const chipsBox = await r(chips);
    const overviewBox = await r(hero.getByTestId('title-overview'));
    const actionsBox = await r(page.getByTestId('title-actions'));
    assert(h1.y + h1.height <= metaBox.y + 1, 'TP01 meta below title');
    assert(metaBox.y + metaBox.height <= trailerBox.y + 1, 'TP01 trailer box below meta');
    assert(trailerBox.y + trailerBox.height <= posterBox.y + 1, 'TP01 poster row below trailer box');
    assert(Math.abs(trailerBox.width - (390 - 40)) <= 2, `TP01 trailer box spans the content width (${trailerBox.width})`);
    assert(Math.abs(trailerBox.width / trailerBox.height - 16 / 9) < 0.02, `TP01 trailer box is 16:9 (${trailerBox.width}x${trailerBox.height})`);
    assert(parseFloat(await box.evaluate(el => getComputedStyle(el).borderTopLeftRadius)) >= 8, 'TP01 trailer box is rounded');
    assert(posterBox.height > posterBox.width * 1.3, 'TP01 poster is portrait');
    assert(posterBox.width >= 390 * 0.25 && posterBox.width <= 390 * 0.36, `TP01 poster ~30% width (${posterBox.width})`);
    assert(posterBox.x <= 21, 'TP01 poster on the left');
    assert(chipsBox.x >= posterBox.x + posterBox.width, 'TP01 chips right of poster');
    assert(overviewBox.x >= posterBox.x + posterBox.width, 'TP01 overview right of poster');
    assert(chipsBox.y + chipsBox.height <= overviewBox.y + 1, 'TP01 chips above overview');
    assert(Math.abs(chipsBox.y - posterBox.y) <= 4, 'TP01 chips start at the poster top');
    assert(actionsBox.y >= Math.max(posterBox.y + posterBox.height, overviewBox.y + overviewBox.height) - 1, 'TP01 actions below the poster row');
    const chipFacts = await chips.evaluate(el => ({
      overflowX: getComputedStyle(el).overflowX,
      tops: Array.from(el.children).map(c => Math.round(c.getBoundingClientRect().top)),
      scrollable: el.scrollWidth > el.clientWidth,
    }));
    assert(['auto', 'scroll'].includes(chipFacts.overflowX), 'TP01 chips scroll horizontally');
    assert.equal(new Set(chipFacts.tops).size, 1, 'TP01 chips sit on one line');
    assert(chipFacts.scrollable, 'TP01 long genre list scrolls instead of wrapping');
    await poster.getByRole('button', { name: 'Add to Watchlist', exact: true }).waitFor();
    assert.equal(await page.locator('.poster-hero-target').count(), 1, '#29 one transition target');
    assert.equal(await poster.evaluate(el => el.classList.contains('poster-hero-target')), true, '#29 transition lands on the new poster');

    // TP02: ▶ plays inside the box; closing restores the backdrop.
    const backdrop = box.getByTestId('trailer-backdrop');
    await backdrop.waitFor();
    await box.getByRole('button', { name: 'Play trailer', exact: true }).click();
    const player = box.locator('iframe');
    await player.waitFor();
    const playing = await r(box);
    assert(Math.abs(playing.width - trailerBox.width) <= 1 && Math.abs(playing.height - trailerBox.height) <= 1, 'TP02 box keeps its size while playing');
    const video = await r(player);
    assert(Math.abs(video.width - trailerBox.width) <= 2 && Math.abs(video.y - trailerBox.y) <= 1, `TP02 player fills the box (${JSON.stringify(video)})`);
    assert.equal(await backdrop.count(), 0, 'TP02 backdrop replaced by the player');
    await hero.getByRole('button', { name: 'Close trailer', exact: true }).click();
    await backdrop.waitFor();
    assert.equal(await player.count(), 0, 'TP02 closing stops the trailer');
    assert(await box.getByRole('button', { name: 'Play trailer', exact: true }).isVisible(), 'TP02 ▶ is back');

    // Escape stops the trailer.
    await box.getByRole('button', { name: 'Play trailer', exact: true }).click();
    await player.waitFor();
    await page.keyboard.press('Escape');
    await player.waitFor({ state: 'detached' });
    await backdrop.waitFor();

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page, `TP 627 ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Navigating away stops the trailer.
    await box.getByRole('button', { name: 'Play trailer', exact: true }).click();
    await player.waitFor();
    await page.locator('main a[href*="101"]').first().click();
    await page.locator('h1', { hasText: 'Extraordinarily Long' }).first().waitFor();
    assert.equal(await page.locator('iframe').count(), 0, 'navigating away stops the trailer');

    // TP03: no trailer → backdrop only, no ▶.
    const hero2 = page.getByRole('region', { name: `${titles[101].title} hero banner`, exact: true });
    const box2 = hero2.getByTestId('trailer-box');
    await box2.getByTestId('trailer-backdrop').waitFor();
    assert.equal(await box2.getByRole('button', { name: 'Play trailer' }).count(), 0, 'TP03 no ▶ without a trailer');
    assert.equal(await hero2.locator('iframe').count(), 0, 'TP03 no player');
    const h1b = await r(hero2.locator('h1'));
    assert(h1b.height > 40, `TP01 long title wraps (${h1b.height})`);
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page, `TP 101 ${width}px`);
    }
  } finally { await context.close(); }
});

// TP04: at ≥768px the page is identical to before #44. The fingerprint is the hero and action
// area markup plus the boxes of the key top elements, captured before the phone change.
const BASELINE = {"820":{"hero":"aaa2541b","actions":"71b5d311","boxes":[["h1",206,419,582,45],["hero-poster",32,383,150,225],["hero-details",206,419,582,189],["play",32,660,119,44],["cast",32,744,756,0]]},"1280":{"hero":"aaa2541b","actions":"71b5d311","boxes":[["h1",300,562,672,60],["hero-poster",48,414,220,330],["hero-details",300,562,672,182],["play",48,796,119,44],["cast",48,880,1184,0]]}};

test('desktop', async browser => {
  const facts = {};
  for (const width of [1280, 820]) {
    const { page, context } = await newPage(browser, { width, height: 900 }, false);
    try {
      await openTitle(page, 627, 'Trainspotting');
      await page.getByRole('button', { name: 'Play Trailer' }).waitFor();
      await page.getByRole('region', { name: 'Key cast members' }).waitFor();
      await page.waitForLoadState('networkidle');
      facts[width] = await page.evaluate(() => {
        const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
        const hero = document.querySelector('section[aria-label$=" hero banner"]');
        const play = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Play Trailer'));
        const actions = play.closest('.space-y-4');
        const box = el => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y + scrollY), Math.round(b.width), Math.round(b.height)]; };
        const cast = document.querySelector('[aria-label="Key cast members"]');
        return {
          hero: hash(hero.outerHTML),
          actions: hash(actions.outerHTML),
          boxes: [
            ['h1', ...box(hero.querySelector('h1'))],
            ['hero-poster', ...box(hero.querySelector('[data-testid="hero-poster"]'))],
            ['hero-details', ...box(hero.querySelector('[data-testid="hero-details"]'))],
            ['play', ...box(play)],
            ['cast', box(cast)[0], box(cast)[1], box(cast)[2], 0],
          ],
        };
      });
      await noOverflow(page, `desktop ${width}px`);
    } finally { await context.close(); }
  }
  if (process.env.PHONE_TITLE_BASELINE === 'print') { console.log(JSON.stringify(facts)); return; }
  assert.deepEqual(facts, BASELINE, 'TP04 ≥768px title page identical to before');
});

(async () => {
  const launchOptions = { headless: true };
  if (process.env.MOVIENIGHT_CHROME_PATH) launchOptions.executablePath = process.env.MOVIENIGHT_CHROME_PATH;
  else launchOptions.channel = 'chrome';
  const browser = await chromium.launch(launchOptions);
  try {
    assert(selected === 'all' || tests.some(t => t.name === selected), 'Unknown test selection');
    for (const { name, run } of tests) {
      if (selected !== 'all' && selected !== name) continue;
      await run(browser);
      console.log('PASS', name);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
