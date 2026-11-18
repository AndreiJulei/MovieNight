// Ticket #43 (PD-25) Animations defaults: AN01–AN03.
// Each browser context is a separate device (its own localStorage). API calls are stubbed.
//   npx vite --port 8463 --strictPort &
//   MOVIENIGHT_BROWSER_URL=http://127.0.0.1:8463 MOVIENIGHT_PLAYWRIGHT_MODULE=/path/to/playwright \
//     node tests/browser/animation-defaults.cjs
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseUrl = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8463';
const user = { id: 101, username: 'fixture', displayName: 'Fixture User', email: 'fixture@example.com', role: 'ROLE_USER' };
const check = (name) => console.log('PASS', name);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function device(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.addInitScript((u) => {
    if (!localStorage.getItem('movienight_token')) {
      localStorage.setItem('movienight_token', 'fixture-token');
      localStorage.setItem('movienight_current_user', JSON.stringify({ ...u, id: String(u.id) }));
    }
  }, user);
  await context.route('http://localhost:8080/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: user });
    return route.fulfill({ json: [] });
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/settings`);
  return { context, page };
}

const animationsSwitch = (page) => page.getByRole('switch', { name: 'Animations' });
const isOn = async (page) => (await animationsSwitch(page).getAttribute('aria-checked')) === 'true';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // AN01: fresh phone is off, fresh desktop is on.
    const phone = await device(browser, PHONE);
    const desktop = await device(browser, DESKTOP);
    await animationsSwitch(phone.page).waitFor();
    await animationsSwitch(desktop.page).waitFor();
    assert.equal(await isOn(phone.page), false, 'fresh phone defaults off');
    assert.equal(await isOn(desktop.page), true, 'fresh desktop defaults on');
    await phone.page.getByText('Applies to this device only.', { exact: false }).waitFor();
    check('AN01 fresh phone off, fresh desktop on');

    // AN02: turning it on for the phone persists across reloads and leaves the desktop alone.
    await animationsSwitch(phone.page).click();
    assert.equal(await isOn(phone.page), true, 'phone switch turns on');
    await phone.page.reload();
    await animationsSwitch(phone.page).waitFor();
    assert.equal(await isOn(phone.page), true, 'phone choice survives reload');
    // Rotating/resizing to desktop width doesn't flip the stored choice.
    await phone.page.setViewportSize({ width: 844, height: 390 });
    await phone.page.reload();
    await animationsSwitch(phone.page).waitFor();
    assert.equal(await isOn(phone.page), true, 'stored choice kept after rotate');
    await desktop.page.reload();
    await animationsSwitch(desktop.page).waitFor();
    assert.equal(await isOn(desktop.page), true, 'desktop unaffected');
    // And a desktop that turns it off keeps off; the phone is unaffected.
    await animationsSwitch(desktop.page).click();
    await desktop.page.reload();
    await animationsSwitch(desktop.page).waitFor();
    assert.equal(await isOn(desktop.page), false, 'desktop off choice survives reload');
    await phone.page.reload();
    await animationsSwitch(phone.page).waitFor();
    assert.equal(await isOn(phone.page), true, 'phone unaffected by desktop choice');
    check('AN02 phone choice persists across reloads; desktop unaffected');
    await phone.context.close();
    await desktop.context.close();

    // AN03: reduced motion defaults off, even on desktop.
    const reduced = await device(browser, DESKTOP, 'reduce');
    await animationsSwitch(reduced.page).waitFor();
    assert.equal(await isOn(reduced.page), false, 'reduced-motion desktop defaults off');
    await reduced.context.close();
    const reducedPhone = await device(browser, PHONE, 'reduce');
    await animationsSwitch(reducedPhone.page).waitFor();
    assert.equal(await isOn(reducedPhone.page), false, 'reduced-motion phone defaults off');
    await reducedPhone.context.close();
    check('AN03 reduced motion defaults off');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
