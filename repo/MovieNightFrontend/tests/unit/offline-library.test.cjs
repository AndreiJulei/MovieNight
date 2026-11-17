// Ticket #34 (PD-18): read-only offline library snapshot.
const test = require("node:test")
const assert = require("node:assert/strict")

let mod

test.before(async () => {
  mod = await import("../../src/offline/librarySnapshot.ts")
})

const user = { id: "7", username: "ana", displayName: "Ana", password: "" }
const dune = { id: "movie-tmdb-438631", title: "Dune", year: 2021, posterUrl: "https://image.tmdb.org/t/p/w342/d.jpg" }
const heat = { id: "movie-tmdb-949", title: "Heat", year: 1995, posterUrl: null }
const listOnly = { id: "movie-tmdb-603", title: "The Matrix", year: 1999, posterUrl: null }
const browsed = { id: "movie-tmdb-1", title: "Browsed only", year: 2020, posterUrl: null }

function entry(id, userId, movieId, status) {
  return { id, userId, movieId, status, rating: status === "watched" ? 8 : null, description: "", addedAt: "2026-11-01T10:00:00Z" }
}

const library = {
  user,
  movies: [dune, heat, listOnly, browsed],
  entries: [entry("1", "7", dune.id, "watched"), entry("2", "7", heat.id, "watchlist"), entry("3", "99", browsed.id, "watched")],
  lists: [
    { id: "L1", userId: "7", title: "Favourites", movieIds: [listOnly.id], catalogMovieIds: {}, createdAt: "2026-11-02" },
    { id: "L2", userId: "99", title: "Friend list", movieIds: [browsed.id], catalogMovieIds: {}, createdAt: "2026-11-02" },
  ],
  savedAt: "2026-11-13T18:02:00.000Z",
  sessionKey: "k",
}

test("snapshot keeps the owner's watched history, watchlist and custom lists (OF01)", () => {
  const snapshot = mod.buildLibrarySnapshot(library)
  const restored = mod.restoreLibrarySnapshot(snapshot, "7", "k")
  assert.deepEqual(restored.entries.map((e) => [e.movieId, e.status]), [[dune.id, "watched"], [heat.id, "watchlist"]])
  assert.deepEqual(restored.lists.map((l) => l.title), ["Favourites"])
  assert.deepEqual(restored.movies.map((m) => m.title).sort(), ["Dune", "Heat", "The Matrix"])
  assert.equal(restored.movies.find((m) => m.id === dune.id).posterUrl, dune.posterUrl)
  assert.equal(restored.user.displayName, "Ana")
  assert.equal(restored.savedAt, library.savedAt)
})

test("a snapshot is never restored for a different account", () => {
  const snapshot = mod.buildLibrarySnapshot(library)
  assert.equal(mod.restoreLibrarySnapshot(snapshot, "99", "k"), null)
  assert.equal(mod.restoreLibrarySnapshot(undefined, "7", "k"), null)
  assert.equal(mod.restoreLibrarySnapshot({ ...snapshot, version: 0 }, "7", "k"), null)
})

function memoryBackend({ delayPutMs = 0 } = {}) {
  let value
  return {
    async get() { return value },
    async put(v) { if (delayPutMs) await new Promise((r) => setTimeout(r, delayPutMs)); value = v },
    async delete() { value = undefined },
  }
}

test("the store saves and loads the signed-in user's snapshot", async () => {
  const store = mod.createSnapshotStore(memoryBackend())
  await store.save(mod.buildLibrarySnapshot(library))
  const restored = await store.load("7", "k")
  assert.deepEqual(restored.entries.map((e) => e.id), ["1", "2"])
  assert.equal(await store.load("99", "k"), null)
})

test("signing out removes the snapshot, even while a save is still being written (OF03)", async () => {
  const store = mod.createSnapshotStore(memoryBackend({ delayPutMs: 20 }))
  const pendingSave = store.save(mod.buildLibrarySnapshot(library))
  await store.clear()
  await pendingSave
  assert.equal(await store.load("7", "k"), null)
})

test("a save requested after sign-out began does not resurrect the snapshot (OF03)", async () => {
  const store = mod.createSnapshotStore(memoryBackend())
  // Captured when a library load started; the user signed out before it finished.
  const generation = store.generation()
  await store.clear()
  await store.save(mod.buildLibrarySnapshot(library), { generation })
  assert.equal(await store.load("7", "k"), null)
})

test("a storage failure never breaks the app: load falls back to no snapshot", async () => {
  const store = mod.createSnapshotStore({
    async get() { throw new Error("blocked") }, async put() { throw new Error("quota") }, async delete() { throw new Error("blocked") },
  })
  await store.save(mod.buildLibrarySnapshot(library))
  assert.equal(await store.load("7", "k"), null)
  await store.clear()
})

test("offline, only the library, lists and settings stay open; Explore and search need a connection", () => {
  for (const path of ["/movies", "/lists", "/lists/12", "/settings"]) assert.equal(mod.isOfflineReadOnlyPath(path), true, path)
  for (const path of ["/", "/home", "/explore/movies", "/search", "/suggestions", "/movies/movie-tmdb-1", "/movies/add", "/friends", "/profile"]) {
    assert.equal(mod.isOfflineReadOnlyPath(path), false, path)
  }
})

test("the offline banner names the time of the snapshot", () => {
  const text = mod.offlineBannerText("2026-11-13T18:02:00.000Z", { locale: "en-GB", timeZone: "UTC" })
  assert.equal(text, "Offline: showing your library as of 13 Nov, 18:02")
})

test("without a remembered account id, the store restores the snapshot's own account", async () => {
  const store = mod.createSnapshotStore(memoryBackend())
  await store.save(mod.buildLibrarySnapshot(library))
  const restored = await store.load(undefined, "k")
  assert.equal(restored.user.id, "7")
})

test("a snapshot saved under another sign-in is never restored, even for a remembered account id", async () => {
  const store = mod.createSnapshotStore(memoryBackend())
  await store.save(mod.buildLibrarySnapshot({ ...library, sessionKey: mod.sessionKeyFor("token-of-ana") }))
  assert.equal(await store.load(undefined, mod.sessionKeyFor("token-of-bo")), null)
  assert.equal(await store.load("7", mod.sessionKeyFor("token-of-bo")), null)
  assert.equal((await store.load(undefined, mod.sessionKeyFor("token-of-ana"))).user.id, "7")
})

test("the offline banner says 'your last visit' before the first snapshot is saved", () => {
  assert.equal(mod.offlineBannerText(null), "Offline: showing your library as of your last visit")
})

function httpError(status) {
  return Object.assign(new Error("Session verification is temporarily unavailable."), { status })
}

test("only a missing answer from the server opens the snapshot: network loss, timeouts and gateway errors", () => {
  const timeout = Object.assign(new Error("Request timed out."), { name: "TimeoutError", isTimeout: true })
  const aborted = Object.assign(new Error("aborted"), { name: "AbortError" })
  for (const err of [new TypeError("Failed to fetch"), timeout, aborted, httpError(502), httpError(503), httpError(504)]) {
    assert.equal(mod.serverGaveNoAnswer(err), true, err.message + " " + err.status)
  }
})

test("an answer from the server, even an error, never opens the snapshot", () => {
  const userAbort = Object.assign(new Error("Request cancelled."), { name: "AbortError", isUserAbort: true })
  for (const err of [httpError(500), httpError(429), httpError(404), new Error("Invalid session profile."), userAbort, undefined]) {
    assert.equal(mod.serverGaveNoAnswer(err), false, String(err?.message) + " " + err?.status)
  }
})
