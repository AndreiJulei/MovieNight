const test = require("node:test");
const assert = require("node:assert/strict");

let fetchSimilarTitles;
let moviesApi;

// Mock in-memory sessionStorage
class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test.before(async () => {
  global.sessionStorage = new MockSessionStorage();
  global.window = Object.assign(global, { sessionStorage: global.sessionStorage });
  const mod = await import("../../src/api/similarMovies.ts");
  fetchSimilarTitles = mod.fetchSimilarTitles;
  moviesApi = {
    getSimilarTitles: (tmdbId, mediaType, limit) =>
      fetchSimilarTitles("http://localhost:8080", tmdbId, mediaType, limit),
  };
});

test.beforeEach(() => {
  global.sessionStorage.clear();
});

test("SIM01 / SIM04: getSimilarTitles fetches from API and caches in sessionStorage on first call", async () => {
  let fetchCount = 0;
  let requestedUrl = "";

  const mockMovies = [
    { id: 1, tmdbId: 680, title: "Pulp Fiction", releaseYear: 1994 },
    { id: 2, tmdbId: 13, title: "Forrest Gump", releaseYear: 1994 }
  ];

  global.fetch = async (url) => {
    fetchCount++;
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => mockMovies
    };
  };

  const results = await moviesApi.getSimilarTitles(550);

  assert.equal(fetchCount, 1, "Expected exactly 1 network fetch on first call");
  assert.ok(requestedUrl.includes("/api/movies/550/similar"), `Expected URL to include /api/movies/550/similar, got: ${requestedUrl}`);
  assert.deepEqual(results, mockMovies);

  // Check sessionStorage per AC SIM04 (similar_movies_${tmdbId})
  const cachedRaw = global.sessionStorage.getItem("similar_movies_550");
  assert.ok(cachedRaw, "Expected sessionStorage to have similar_movies_550");
  assert.deepEqual(JSON.parse(cachedRaw), mockMovies);
});

test("SIM04: Repeated call for same tmdbId returns from sessionStorage without network request", async () => {
  let fetchCount = 0;

  const mockMovies = [
    { id: 1, tmdbId: 680, title: "Pulp Fiction", releaseYear: 1994 }
  ];

  global.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => mockMovies
    };
  };

  // First call fetches from network
  const first = await moviesApi.getSimilarTitles(550);
  assert.equal(fetchCount, 1);
  assert.deepEqual(first, mockMovies);

  // Second call retrieves from sessionStorage
  const second = await moviesApi.getSimilarTitles(550);
  assert.equal(fetchCount, 1, "fetchCount should remain 1 because second call must use sessionStorage");
  assert.deepEqual(second, mockMovies);
});

test("SIM01 / Domain Isolation: TV titles use distinct cache key and propagate mediaType parameter", async () => {
  let requestedUrl = "";

  const mockShows = [
    { id: 10, tmdbId: 1399, title: "Game of Thrones", releaseYear: 2011, mediaType: "TV" }
  ];

  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => mockShows
    };
  };

  const results = await moviesApi.getSimilarTitles(1399, "tv");
  assert.ok(requestedUrl.includes("mediaType=tv"), `Expected URL to contain mediaType=tv, got: ${requestedUrl}`);
  assert.deepEqual(results, mockShows);

  // Check TV cache key isolation
  const cachedTv = global.sessionStorage.getItem("similar_movies_tv_1399");
  assert.ok(cachedTv, "Expected sessionStorage to isolate TV items under similar_movies_tv_1399");
  assert.deepEqual(JSON.parse(cachedTv), mockShows);
});

test("SIM03: Gracefully returns empty array on network failure", async () => {
  global.fetch = async () => {
    throw new Error("Network connection error");
  };

  const result = await moviesApi.getSimilarTitles(999);
  assert.deepEqual(result, []);
});

test("Boundary: Invalid or missing tmdbId returns empty array immediately without network fetch", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => [] };
  };

  assert.deepEqual(await moviesApi.getSimilarTitles(0), []);
  assert.deepEqual(await moviesApi.getSimilarTitles(-5), []);
  assert.deepEqual(await moviesApi.getSimilarTitles(null), []);
  assert.equal(fetchCalled, false, "fetch should not be called for non-positive tmdbId");
});
