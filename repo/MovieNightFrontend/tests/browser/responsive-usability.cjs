// Feature 011 rendered-browser regressions. Run against the isolated demo.
const { chromium } = require(process.env.MOVIENIGHT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const artifactDir = process.env.MOVIENIGHT_BROWSER_ARTIFACTS || '/private/tmp/mn011';
fs.mkdirSync(artifactDir, {recursive:true});
const baseUrl = process.env.MOVIENIGHT_BROWSER_URL || 'http://127.0.0.1:8443';
const selected = process.argv[2] || 'all';
const tests = [];
const test = (name, run) => tests.push({ name, run });

async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'No page-level horizontal overflow');
}

test('signup', async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.goto(baseUrl);
    await page.locator('button[type=button]').filter({ hasText: 'Create Account' }).click();
    const submit = page.locator('button[type=submit]').filter({ hasText: 'Create Account' });
    const panel = submit.locator('xpath=ancestor::form/parent::div');
    const bounds = await panel.boundingBox();
    const action = await submit.boundingBox();
    assert(action.y + action.height <= bounds.y + bounds.height, 'Signup submit must fit its panel');
    assert.equal(await page.getByRole('heading', { name: 'Sign In', exact: true }).count(), 0, 'Inactive login is absent from accessibility navigation');
    await noOverflow(page);
    for (const viewport of [{width:360,height:800}, {width:390,height:844}, {width:844,height:390}]) {
      await page.setViewportSize(viewport);
      await submit.scrollIntoViewIfNeeded();
      await noOverflow(page);
      assert(await submit.isVisible());
    }
  } finally { await context.close(); }
});

async function signup(page) {
  const username = `ui${Date.now()}${Math.floor(Math.random()*10000)}`;
  await page.goto(baseUrl);
  await page.locator('button[type=button]').filter({hasText: 'Create Account'}).click();
  const form = page.locator('form').filter({has: page.locator('input[aria-label="Confirm Password"]')});
  await form.getByRole('textbox', {name:'Email', exact:true}).fill(`${username}@example.test`);
  await form.getByRole('textbox', {name:'Username', exact:true}).fill(username);
  await form.locator('input[aria-label="Password"]').fill('Demo011-pass');
  await form.locator('input[aria-label="Confirm Password"]').fill('Demo011-pass');
  await form.getByRole('button', {name:'Create Account', exact:true}).click();
  await page.getByRole('link', {name:'Settings', exact:true}).waitFor();
  return {username, email:`${username}@example.test`};
}

async function navigate(page, name) {
  await page.getByRole('button', {name: /^(Menu|Navigation Menu)$/}).click();
  await page.getByRole('menuitem', {name, exact:true}).click();
}

test('preferences', async browser => {
  const context = await browser.newContext({viewport:{width:1440,height:900}, reducedMotion:'reduce'});
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await signup(page);
    await page.getByRole('link', {name:'Settings', exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'Display Name',exact:true}).count(),1,'Profile input has an accessible label');
    await page.getByRole('button', {name:/Pure Solid Black/}).click();
    await page.getByRole('button', {name:/Courage the Dog/}).click();
    for (const width of [360,390,844,1023]) {
      await page.setViewportSize({width,height:800});
      assert.equal(await page.getByRole('heading',{name:'Background Theme',exact:true}).count(),0,'Compact layout hides background picker');
      assert.equal(await page.getByRole('heading',{name:'Pixel Companion',exact:true}).count(),0,'Compact layout hides character picker');
      assert.equal(await page.getByRole('button',{name:/Click to cycle companion/}).count(),0,'Compact layout hides quick-cycle');
      await noOverflow(page);
    }
    await page.reload();
    await page.getByRole('link',{name:'Settings',exact:true}).click();
    for (const width of [1024,1025,1440]) {
      await page.setViewportSize({width,height:900});
      await page.getByRole('heading',{name:'Background Theme',exact:true}).waitFor();
      assert(await page.getByRole('button',{name:/Pure Solid Black/}).getAttribute('aria-pressed').then(value=>value==='true'));
      assert(await page.getByRole('button',{name:/Courage the Dog/}).getAttribute('aria-pressed').then(value=>value==='true'));
    }
  } finally { await context.close(); }
});

test('navigation-focus', async browser => {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await signup(page);
    const trigger = page.getByRole('button',{name:'Menu',exact:true});
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog',{name:'Navigation Menu'});
    assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Opening phone navigation moves focus inside');
    for(let i=0;i<20;i++) {
      await page.keyboard.press('Tab');
      assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Tab stays in modal navigation');
    }
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate(el=>el===document.activeElement),'Dismissal returns focus');
    await noOverflow(page);
    await trigger.click();
    await page.setViewportSize({width:1440,height:900});
    await waitUntil(()=>page.evaluate(()=>document.body.style.overflow!=='hidden'),'Resizing out of phone layout releases modal scroll lock');
  } finally {await context.close();}
});

test('controls', async browser => {
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try {
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await signup(page);
    const menu = page.getByRole('button',{name:'Menu',exact:true});
    const box = await menu.boundingBox();
    assert(box.width>=44 && box.height>=44,'Essential navigation target is at least 44 by 44');
    await navigate(page,'Watched');
    const filter = page.getByRole('button',{name:/Filter/});
    await filter.click();
    const dialog = page.getByRole('dialog',{name:'Filter Options'});
    assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Filter focus enters modal');
    await page.setViewportSize({width:844,height:390});
    const done = dialog.getByRole('button',{name:'Done',exact:true});
    await done.scrollIntoViewIfNeeded();
    const doneBox=await done.boundingBox();
    assert(doneBox.y>=0 && doneBox.y+doneBox.height<=390,'Landscape filter action is reachable');
    await noOverflow(page);
    await page.keyboard.press('Escape');
    assert(await filter.evaluate(el=>el===document.activeElement),'Filter focus returns');
  } finally {await context.close();}
});

async function explore(page, type='Movies') {
  await page.getByRole('button',{name:/^(Menu|Navigation Menu)$/}).click();
  await page.getByRole('menuitem',{name:/^Explore/}).click();
  const submenu = page.getByRole('button',{name:type,exact:true});
  if(await submenu.count()) await submenu.click();
  else await page.getByRole('menuitem',{name:type,exact:true}).click();
}

test('list-popover', async browser => {
  const context=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try {
    const page=await context.newPage(); page.setDefaultTimeout(10000); await signup(page); await explore(page);
    await page.getByRole('link',{name:'Demo Seed',exact:true}).first().click();
    const trigger=page.getByRole('button',{name:/Add to list/});
    await trigger.click();
    const dialog=page.getByRole('dialog',{name:'Add to custom list',exact:true});
    assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'List popover takes focus');
    const box=await dialog.boundingBox();
    assert(box.x>=0 && box.x+box.width<=360,'List popover stays within viewport');
    await dialog.getByRole('button',{name:'Create new list'}).click();
    await page.getByRole('textbox',{name:'New list title'}).fill('A long custom list '+ 'name '.repeat(20));
    await noOverflow(page);
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate(el=>el===document.activeElement),'List popover returns focus');
  } finally {await context.close();}
});

async function readApi(page, path) {
  return page.evaluate(async ({url,path}) => {
    const response=await fetch(`${url}${path}`,{signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${localStorage.getItem('movienight_token')}`}});
    if(!response.ok) throw new Error(`Read failed: ${response.status}`);
    return response.json();
  },{url:process.env.MOVIENIGHT_API_URL||'http://127.0.0.1:8080',path});
}

async function openTitle(page, name, type='Movies') {
  await explore(page,type);
  await page.getByRole('link',{name,exact:true}).first().click();
  await page.getByRole('heading',{name,exact:true}).waitFor();
}

async function waitUntil(check, message) {
  const end=Date.now()+10000;
  while(Date.now()<end) {if(await check()) return; await new Promise(r=>setTimeout(r,100));}
  assert.fail(message);
}

for (const viewport of [{width:360,height:800},{width:390,height:844},{width:844,height:390},{width:1280,height:720},{width:1440,height:900}]) {
  test(`core-${viewport.width}`, async browser => {
    const context=await browser.newContext({viewport,hasTouch:viewport.width<1024,isMobile:viewport.width<1024,reducedMotion:'reduce'});
    try {
      const page=await context.newPage(); page.setDefaultTimeout(10000);
      const account=await signup(page);
      await openTitle(page,'Demo Seed');
      assert.equal((await readApi(page,'/api/movies/library')).length,0,'Browsing creates no library entry');
      await noOverflow(page);
      await page.getByRole('button',{name:'+ Add to Watchlist',exact:true}).click();
      await waitUntil(async()=>(await readApi(page,'/api/movies/library')).length===1,'Watchlist save confirmed');
      await page.getByRole('button',{name:'Mark as Watched',exact:true}).click();
      await page.getByRole('button',{name:'Confirm Watched',exact:true}).click();
      await page.getByRole('button',{name:'Edit personal rating',exact:true}).waitFor();
      for(const value of ['0','7.5','']) {
        await page.getByRole('button',{name:'Edit personal rating',exact:true}).click();
        await page.getByRole('combobox',{name:'Personal rating (optional)'}).selectOption(value);
        await page.getByRole('button',{name:'Save rating',exact:true}).click();
        await page.getByRole('button',{name:'Edit personal rating',exact:true}).waitFor();
        const entries=await readApi(page,'/api/movies/library');
        assert.equal(entries.length,1); assert.equal(entries[0].status,'WATCHED');
        assert.equal(entries[0].personalRating,value===''?null:Number(value));
      }
      const notes=page.getByRole('textbox',{name:'Your private note',exact:true});
      await notes.fill('Responsive private note');
      await notes.press('Tab');
      await waitUntil(async()=>(await readApi(page,'/api/movies/library'))[0].notes==='Responsive private note','Private note saved');
      await openTitle(page,'Demo Series','TV Series');
      await page.getByRole('button',{name:'+ Add to Watchlist',exact:true}).click();
      await waitUntil(async()=>(await readApi(page,'/api/movies/library')).length===2,'Typed equal-ID watchlist save');
      await openTitle(page,'Demo Anime','Anime');
      await noOverflow(page);
      await openTitle(page,'Demo Candidate');
      for(const listName of ['Weekend A','Weekend B']) {
        await page.getByRole('button',{name:/Add to list|In Lists/}).click();
        const dialog=page.getByRole('dialog',{name:'Add to custom list',exact:true});
        await dialog.getByRole('button',{name:/Create new list/}).click();
        await dialog.getByRole('textbox',{name:'New list title'}).fill(listName);
        await dialog.getByRole('button',{name:'Create',exact:true}).click();
        await dialog.getByRole('button',{name:listName,exact:true}).waitFor();
        await page.keyboard.press('Escape');
      }
      assert.equal((await readApi(page,'/api/movies/library')).length,2,'Custom-list-only title stays outside library');
      await page.getByRole('button',{name:/In Lists/}).click();
      const picker=page.getByRole('dialog',{name:'Add to custom list',exact:true});
      await picker.getByRole('button',{name:'Weekend A',exact:true}).click();
      await waitUntil(async()=>await picker.getByRole('button',{name:'Weekend A',exact:true}).getAttribute('aria-pressed')==='false','Membership removed');
      await page.keyboard.press('Escape');
      await navigate(page,'Lists');
      await page.getByRole('heading',{name:'Weekend B',exact:true}).click();
      await page.getByRole('button',{name:'Rename list',exact:true}).click();
      await page.getByRole('textbox',{name:'List title',exact:true}).fill('Renamed Weekend B');
      await page.getByRole('button',{name:'Save name',exact:true}).click();
      await page.getByRole('heading',{name:'Renamed Weekend B',exact:true}).waitFor();
      await navigate(page,'Lists');
      await page.getByRole('button',{name:'Delete list Weekend A',exact:true}).click();
      await noOverflow(page);
      await page.getByRole('button',{name:'Yes, delete',exact:true}).click();
      await waitUntil(async()=>(await readApi(page,'/api/lists')).length===1,'Only the selected list deleted');
      await page.reload();
      await openTitle(page,'Demo Seed');
      assert.equal(await page.getByRole('textbox',{name:'Your private note',exact:true}).inputValue(),'Responsive private note');
      assert.equal((await readApi(page,'/api/movies/library')).length,2);
      assert.equal((await readApi(page,'/api/lists'))[0].title,'Renamed Weekend B');
      for(const name of ['Personal Recommendations',"Friends' Recommendations",'Friends']) {
        await navigate(page,name); await noOverflow(page);
      }
      await page.getByRole('link',{name:'Settings',exact:true}).click();
      await page.getByRole('button',{name:'Log out',exact:true}).click();
      await page.getByRole('textbox',{name:'Email Address',exact:true}).fill(account.email);
      await page.locator('input[aria-label="Password"]:visible').fill('Demo011-pass');
      await page.getByRole('button',{name:'Sign In',exact:true}).click();
      await page.getByRole('link',{name:'Settings',exact:true}).waitFor();
      await navigate(page,'Watched');
      await page.getByRole('link',{name:'Demo Seed',exact:true}).click();
      assert.equal(await page.getByRole('textbox',{name:'Your private note',exact:true}).inputValue(),'Responsive private note');
      await noOverflow(page);
      await waitUntil(()=>page.getByRole('heading',{name:'Demo Seed',exact:true}).evaluate(el=>{
        for(let node=el;node && node.tagName!=='MAIN';node=node.parentElement) if(getComputedStyle(node).opacity!=='1')return false;
        return true;
      }),'Detail entrance completed');
      await waitUntil(async()=>await page.locator('main .opacity-0').count()===0,'Poster entrance completed');
      await page.screenshot({path:path.join(artifactDir,`core-${viewport.width}.png`),fullPage:true});
      await friendship(browser,page,account,viewport);
      await page.screenshot({path:path.join(artifactDir,`friends-${viewport.width}.png`),fullPage:true});
    } finally {await context.close();}
  });
}

test('states',async browser=>{
  const context=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try {
    const page=await context.newPage(); page.setDefaultTimeout(10000); await signup(page);
    // Additional UI-state evidence only: app API responses are deliberately controlled.
    await page.route('**/api/movies/tmdb/862?*', async route=>{
      const response=await route.fetch(); const data=await response.json();
      await route.fulfill({json:{...data,title:'Long title '+ 'UnbrokenWord'.repeat(12),overview:'Long description '.repeat(100),genres:'Science Fiction, Action & Adventure, Animation, Documentary, VeryLongUnbrokenGenreNameThatNeedsToWrap',posterUrl:null}});
    });
    await explore(page);
    await page.getByRole('link',{name:'Demo Seed',exact:true}).first().click();
    await page.getByRole('heading',{name:/Long title/}).waitFor();
    await noOverflow(page);
    let release;
    await page.route('**/api/movies/library', async route=>{
      if(route.request().method()!=='POST') return route.continue();
      await new Promise(resolve=>release=resolve);
      await route.fulfill({status:503,json:{message:'Controlled failure'}});
    });
    await page.getByRole('button',{name:'+ Add to Watchlist',exact:true}).click();
    const pending=page.getByRole('button',{name:'Saving…',exact:true});
    await pending.waitFor(); assert(await pending.isDisabled());
    release();
    await page.getByRole('alert').waitFor();
    await page.getByRole('button',{name:'+ Add to Watchlist',exact:true}).waitFor();
    assert.equal((await readApi(page,'/api/movies/library')).length,0,'Controlled failed save changes no real membership');
    await noOverflow(page);
    await page.unroute('**/api/movies/library');
    await page.getByRole('button',{name:'+ Add to Watchlist',exact:true}).click();
    await waitUntil(async()=>(await readApi(page,'/api/movies/library')).length===1,'Successful explicit retry');
  } finally {await context.close();}
});

async function friendship(browser, page, account, viewport) {
  const otherContext=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width<1024,isMobile:viewport.width<1024});
  try {
    const other=await otherContext.newPage(); other.setDefaultTimeout(10000);
    const friend=await signup(other);
    await navigate(page,'Friends');
    await page.getByRole('textbox',{name:'Username, display name, or email'}).fill(friend.email);
    await page.getByRole('button',{name:'Send invitation',exact:true}).click();
    await page.getByText('Pending acceptance',{exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:new RegExp(friend.username)}).count(),0,'Pending invitation grants no profile link');
    await navigate(other,'Friends');
    await other.getByRole('button',{name:'Accept',exact:true}).click();
    await other.getByRole('link',{name:new RegExp(account.username)}).click();
    await other.getByRole('button',{name:'Remove',exact:true}).waitFor();
    await noOverflow(other);
    assert(!(await other.locator('body').innerText()).includes('Responsive private note'),'Friend cannot read owner private note');
    const remove=other.getByRole('button',{name:'Remove',exact:true});
    await remove.click();
    const modal=other.getByRole('dialog',{name:new RegExp(`Remove ${account.username}`)});
    assert(await modal.evaluate(el=>el.contains(document.activeElement)),'Friend removal modal receives focus');
    await other.keyboard.press('Shift+Tab');
    assert(await modal.evaluate(el=>el.contains(document.activeElement)),'Friend removal modal contains focus');
    await other.keyboard.press('Escape');
    assert(await remove.evaluate(el=>el===document.activeElement),'Friend removal returns focus');
    await remove.click();
    await modal.getByRole('button',{name:'Remove Friend',exact:true}).click();
    await other.getByRole('heading',{name:'Friends',exact:true}).waitFor();
    await page.getByRole('button',{name:'Reload friends',exact:true}).click();
    await page.getByText('No accepted friends yet.',{exact:false}).waitFor();
    await page.getByRole('link',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Log out',exact:true}).click();
    await page.getByRole('textbox',{name:'Email Address',exact:true}).fill(friend.email);
    await page.locator('input[aria-label="Password"]:visible').fill('Demo011-pass');
    await page.getByRole('button',{name:'Sign In',exact:true}).click();
    await page.getByRole('link',{name:'Settings',exact:true}).waitFor();
    await navigate(page,'Watched');
    assert.equal((await readApi(page,'/api/movies/library')).length,0,'Account switch clears prior library');
    assert.equal((await readApi(page,'/api/lists')).length,0,'Account switch clears prior custom lists');
    assert(!(await page.locator('body').innerText()).includes('Responsive private note'));

  } finally {await otherContext.close();}
}

test('friendship', async browser=>{
  const viewport={width:390,height:844};
  const context=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:true,isMobile:true});
  try {const page=await context.newPage();page.setDefaultTimeout(10000);const account=await signup(page);await friendship(browser,page,account,viewport);}
  finally {await context.close();}
});

test('search-shelves',async browser=>{
  const context=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try {
    const page=await context.newPage(); page.setDefaultTimeout(10000); await signup(page);
    await explore(page);
    const arrow=page.getByRole('button',{name:'Scroll right',exact:true}).first();
    await arrow.focus();
    assert(await arrow.evaluate(el=>Number(getComputedStyle(el).opacity)>0),'Shelf arrow is visible to keyboard/no-hover users');
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    const search=page.getByRole('textbox',{name:'Search titles',exact:true});
    await search.fill('Demo');
    await page.getByRole('option').first().waitFor();
    await noOverflow(page);
    await search.press('ArrowDown'); await search.press('Enter');
    await page.getByRole('heading',{name:/Demo/}).first().waitFor();
    assert.equal((await readApi(page,'/api/movies/library')).length,0);
  } finally {await context.close();}
});

test('auth-states',async browser=>{
  const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  try {
    const page=await context.newPage(); page.setDefaultTimeout(10000); await page.goto(baseUrl);
    await page.locator('button[type=button]').filter({hasText:'Create Account'}).click();
    const email=page.getByRole('textbox',{name:'Email',exact:true});
    const username=page.getByRole('textbox',{name:'Username',exact:true});
    await email.fill('fixture@example.test'); await username.fill('Fixture011');
    await page.locator('input[aria-label="Password"]:visible').fill('Demo011-pass');
    await page.locator('input[aria-label="Confirm Password"]').fill('different-pass');
    await page.getByRole('button',{name:'Create Account',exact:true}).click();
    await page.getByText('Passwords do not match. Please re-enter them.',{exact:true}).waitFor();
    await page.route('**/api/auth/check-name?**',route=>route.fulfill({json:{available:false}}));
    await username.focus(); await username.press('Tab');
    await page.getByText('Username is already taken.',{exact:true}).waitFor();
    await page.unroute('**/api/auth/check-name?**');
    await username.fill(`new${Date.now()}`); await username.press('Tab');
    await page.getByText('✓ Username available',{exact:true}).waitFor();
    await page.locator('input[aria-label="Confirm Password"]').fill('Demo011-pass');
    let release;
    await page.route('**/api/auth/signup',async route=>{
      await new Promise(resolve=>release=resolve);
      await route.fulfill({status:503,json:{message:'Controlled signup failure. Retry.'}});
    });
    await page.getByRole('button',{name:'Create Account',exact:true}).click();
    const pending=page.getByRole('button',{name:'Creating Account…',exact:true});
    await pending.waitFor(); assert(await pending.isDisabled()); release();
    await page.getByText('Controlled signup failure. Retry.',{exact:true}).waitFor();
    assert.equal(await email.inputValue(),'fixture@example.test');
    for(const viewport of [{width:1280,height:720},{width:360,height:400},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
      await page.setViewportSize(viewport);
      const submit=page.getByRole('button',{name:'Create Account',exact:true});
      await submit.scrollIntoViewIfNeeded();
      const bounds=await submit.locator('xpath=ancestor::form/parent::div').boundingBox();
      const error=await page.getByText('Controlled signup failure. Retry.',{exact:true}).boundingBox();
      assert(error.y+error.height<=bounds.y+bounds.height,'Server feedback fits panel');
      await noOverflow(page);
    }
  } finally {await context.close();}
});

test('keyboard-delete',async browser=>{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try {
    const page=await context.newPage();page.setDefaultTimeout(10000);await signup(page);await navigate(page,'Lists');
    await page.getByRole('button',{name:'+ New List',exact:true}).click();
    await page.getByRole('textbox',{name:'List title',exact:true}).fill('Keyboard list');
    await page.getByRole('button',{name:'Create',exact:true}).click();
    const remove=page.getByRole('button',{name:'Delete list Keyboard list',exact:true});
    await remove.focus(); await page.keyboard.press('Enter');
    const confirm=page.getByRole('button',{name:'Yes, delete',exact:true});
    await confirm.waitFor(); await confirm.focus(); await page.keyboard.press('Enter');
    await waitUntil(async()=>(await readApi(page,'/api/lists')).length===0,'Keyboard deletes selected list without navigating');
    await page.getByRole('heading',{name:'Lists',exact:true}).waitFor();
  } finally {await context.close();}
});

test('trailer-focus',async browser=>{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try {
    const page=await context.newPage(); page.setDefaultTimeout(10000);await signup(page);
    // Controlled catalog/recommendation/player UI fixture; no live playback or scoring claim.
    await page.route('**/api/movies/tmdb/862?*',async route=>{
      const data=await (await route.fetch()).json();
      await route.fulfill({json:{...data,trailerKey:'fixture-player'}});
    });
    await openTitle(page,'Demo Seed');
    await page.route('**/api/suggestions/friends',route=>route.fulfill({json:{categories:[{id:'friends',title:'Rated by friends',movies:[{tmdbId:862,title:'Demo Seed',mediaType:'MOVIE',score:8,reason:'Controlled friend source'}]},{id:'friends-watchlist',title:'On friends watchlists',movies:[]}]}}));
    await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><button>Player control</button></body></html>'}));
    await page.locator('a[href="/"]').first().click();
    const play=page.getByRole('button',{name:'Play trailer for Demo Seed',exact:true});
    await play.click();
    const close=page.getByRole('button',{name:'Close trailer',exact:true});
    await page.frameLocator('iframe').getByRole('button',{name:'Player control',exact:true}).waitFor();
    await close.focus(); await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.activeElement?.tagName==='IFRAME'),'Tab enters embedded player');
    await page.keyboard.press('Tab');
    await waitUntil(()=>close.evaluate(el=>el===document.activeElement),'Tab leaving player stays in modal');
    await page.keyboard.press('Escape');
    assert(await play.evaluate(el=>el===document.activeElement),'Trailer dismissal restores trigger');
  } finally {await context.close();}
});

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    console.log('Chrome', browser.version());
    assert(selected === 'all' || tests.some(test=>test.name===selected), 'Unknown test selection');
    for (const {name, run} of tests) {
      if (selected !== 'all' && selected !== name) continue;
      let deadline;
      try {
        await Promise.race([run(browser), new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error(`Test deadline exceeded: ${name}`)),240000);})]);
      } finally { clearTimeout(deadline); }
      console.log('PASS', name);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
