const test = require('node:test');
const assert = require('node:assert/strict');

let safeInternalUrl;
let matchPath;

test.before(async () => {
  const mod = await import('../../src/routerUtils.ts');
  safeInternalUrl = mod.safeInternalUrl;
  matchPath = mod.matchPath;
});

test('safeInternalUrl: accepts valid in-app paths (BN01, BN03)', () => {
  assert.equal(safeInternalUrl('/'), '/');
  assert.equal(safeInternalUrl('/settings'), '/settings');
  assert.equal(
    safeInternalUrl('/explore/movies/popular?sort=rating&minRating=6'),
    '/explore/movies/popular?sort=rating&minRating=6',
  );
  assert.equal(safeInternalUrl('/movies/add?q=Dune#section'), '/movies/add?q=Dune#section');
});

test('safeInternalUrl: rejects empty, null, and non-string inputs (BN03)', () => {
  assert.equal(safeInternalUrl(null), null);
  assert.equal(safeInternalUrl(undefined), null);
  assert.equal(safeInternalUrl(''), null);
});

test('safeInternalUrl: rejects external absolute URLs preventing open redirect (BN03)', () => {
  assert.equal(safeInternalUrl('https://evil.example.com'), null);
  assert.equal(safeInternalUrl('http://attacker.example.com/login'), null);
  assert.equal(safeInternalUrl('javascript:alert(1)'), null);
});

test('safeInternalUrl: rejects protocol-relative and backslash injection (BN03)', () => {
  assert.equal(safeInternalUrl('//evil.example.com'), null);
  assert.equal(safeInternalUrl('//evil.example.com/test'), null);
  assert.equal(safeInternalUrl('/\\evil.example.com'), null);
  assert.equal(safeInternalUrl('/test\\evil'), null);
});

test('safeInternalUrl: rejects ASCII control characters (BN03)', () => {
  assert.equal(safeInternalUrl('/movies\x00evil'), null);
  assert.equal(safeInternalUrl('/settings\x1ftest'), null);
  assert.equal(safeInternalUrl('/login\nevil'), null);
  assert.equal(safeInternalUrl('/login\revil'), null);
});

test('matchPath: matches exact static paths', () => {
  assert.deepEqual(matchPath('/settings', '/settings'), {});
  assert.deepEqual(matchPath('/movies/add', '/movies/add'), {});
  assert.equal(matchPath('/settings', '/home'), null);
});

test('matchPath: extracts single and typed route parameters (BN01, BN05)', () => {
  assert.deepEqual(matchPath('/movies/:id', '/movies/301'), { id: '301' });
  assert.deepEqual(matchPath('/movies/:id', '/movies/tv:301'), { id: 'tv:301' });
  assert.deepEqual(matchPath('/lists/:id', '/lists/custom-list-99'), { id: 'custom-list-99' });
});

test('matchPath: extracts multi-segment route parameters', () => {
  assert.deepEqual(
    matchPath('/explore/:type/:category', '/explore/movies/popular'),
    { type: 'movies', category: 'popular' },
  );
  assert.deepEqual(
    matchPath('/suggestions/:category', '/suggestions/friends'),
    { category: 'friends' },
  );
});

test('matchPath: enforces exact segment counts', () => {
  assert.equal(matchPath('/movies/:id', '/movies'), null);
  assert.equal(matchPath('/movies/:id', '/movies/301/edit'), null);
  assert.equal(matchPath('/explore/:type', '/explore'), null);
});

test('matchPath: decodes percent-encoded parameters and handles malformed encoding safely', () => {
  assert.deepEqual(matchPath('/lists/:id', '/lists/action%20movies'), { id: 'action movies' });
  assert.equal(matchPath('/movies/:id', '/movies/%FF%FE'), null);
});

