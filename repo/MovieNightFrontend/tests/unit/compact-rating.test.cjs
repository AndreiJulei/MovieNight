const test = require('node:test');
const assert = require('node:assert/strict');

let compactExploreRating;
let formatExploreMetadata;

test.before(async () => {
  const mod = await import('../../src/components/ratingEvidence.ts');
  compactExploreRating = mod.compactExploreRating;
  formatExploreMetadata = mod.formatExploreMetadata;
});

test('compactExploreRating: prefers valid IMDb over TMDB (PM02)', () => {
  const movie = { imdb: 8.4, tmdbRating: 7.9 };
  assert.equal(compactExploreRating(movie), 'IMDb 8.4/10');
});

test('compactExploreRating: falls back to TMDB when IMDb is missing/null (PM02, PM03)', () => {
  const movie = { imdb: null, tmdbRating: 7.5 };
  assert.equal(compactExploreRating(movie), 'TMDB 7.5/10');
});

test('compactExploreRating: never relabels TMDB as IMDb (PM03)', () => {
  const movie = { imdb: undefined, tmdbRating: 8.0 };
  const res = compactExploreRating(movie);
  assert.equal(res, 'TMDB 8.0/10');
  assert.equal(res.startsWith('IMDb'), false);
});

test('compactExploreRating: omits Rotten Tomatoes critic approval as fallback (PM04)', () => {
  const movie = { imdb: null, tmdbRating: null, rt: 94 };
  assert.equal(compactExploreRating(movie), null, 'RT critic approval must not be fallback on poster');
});

test('compactExploreRating: genuine valid zero (0 or 0.0) remains zero (PM03)', () => {
  assert.equal(compactExploreRating({ imdb: 0, tmdbRating: 7.5 }), 'IMDb 0.0/10');
  assert.equal(compactExploreRating({ imdb: null, tmdbRating: 0 }), 'TMDB 0.0/10');
});

test('compactExploreRating: invalid scores above 10 fall back to next provider or omit (PM03)', () => {
  // Invalid preferred-provider (IMDb > 10) falls back to valid TMDB
  assert.equal(compactExploreRating({ imdb: 11, tmdbRating: 7.5 }), 'TMDB 7.5/10');
  assert.equal(compactExploreRating({ imdb: 10.1, tmdbRating: 8.0 }), 'TMDB 8.0/10');
  // Both invalid (> 10)
  assert.equal(compactExploreRating({ imdb: 12, tmdbRating: 15 }), null);
  // Valid upper boundary 10.0 is preserved
  assert.equal(compactExploreRating({ imdb: 10, tmdbRating: 7.0 }), 'IMDb 10.0/10');
  assert.equal(compactExploreRating({ imdb: null, tmdbRating: 10.0 }), 'TMDB 10.0/10');
});

test('compactExploreRating: invalid scores (negative, NaN, empty) are omitted cleanly (PM03)', () => {
  assert.equal(compactExploreRating({ imdb: -1, tmdbRating: -2 }), null);
  assert.equal(compactExploreRating({ imdb: NaN, tmdbRating: null }), null);
  assert.equal(compactExploreRating({ imdb: null, tmdbRating: null }), null);
});

test('formatExploreMetadata: year and preferred IMDb score (PM02)', () => {
  const movie = { year: 2026, imdb: 8.0, tmdbRating: 7.5 };
  assert.equal(formatExploreMetadata(movie), '2026 · IMDb 8.0/10');
});

test('formatExploreMetadata: year and fallback TMDB score (PM02)', () => {
  const movie = { year: 2026, imdb: null, tmdbRating: 7.9 };
  assert.equal(formatExploreMetadata(movie), '2026 · TMDB 7.9/10');
});

test('formatExploreMetadata: critic-only movie shows year cleanly without dangling separator (PM03, PM04)', () => {
  const movie = { year: 2024, imdb: null, tmdbRating: null, rt: 98 };
  assert.equal(formatExploreMetadata(movie), '2024');
  assert.equal(formatExploreMetadata(movie).includes('·'), false);
});

test('formatExploreMetadata: no scores at all shows year cleanly (PM03)', () => {
  const movie = { year: 2023, imdb: null, tmdbRating: null };
  assert.equal(formatExploreMetadata(movie), '2023');
});

test('formatExploreMetadata: unknown year shows compact score cleanly without leading/dangling separator (PM03)', () => {
  assert.equal(formatExploreMetadata({ year: null, imdb: 8.5 }), 'IMDb 8.5/10');
  assert.equal(formatExploreMetadata({ year: null, tmdbRating: 7.0 }), 'TMDB 7.0/10');
  assert.equal(formatExploreMetadata({ year: 0, imdb: 8.5 }), 'IMDb 8.5/10');
  assert.equal(formatExploreMetadata({ year: -5, imdb: 8.5 }), 'IMDb 8.5/10');
});

test('formatExploreMetadata: unknown year and missing score returns null cleanly (PM03)', () => {
  assert.equal(formatExploreMetadata({ year: null, imdb: null, tmdbRating: null }), null);
  assert.equal(formatExploreMetadata({ year: 0, imdb: null }), null);
});

test('formatExploreMetadata: valid zero score with year formats cleanly (PM03)', () => {
  assert.equal(formatExploreMetadata({ year: 2026, imdb: 0 }), '2026 · IMDb 0.0/10');
  assert.equal(formatExploreMetadata({ year: null, imdb: 0 }), 'IMDb 0.0/10');
  assert.equal(formatExploreMetadata({ year: 2026, tmdbRating: 0 }), '2026 · TMDB 0.0/10');
});
