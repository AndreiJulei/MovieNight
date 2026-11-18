// Ticket #42 (PD-24): Grid / Compact / List view modes. The chosen view is read
// from `?view=` first, then the remembered `app_view_mode`, then Grid (VM03).
const test = require("node:test")
const assert = require("node:assert/strict")

let mod

test.before(async () => {
  mod = await import("../../src/components/viewMode.ts")
})

test("offers Grid, Compact and List in that order", () => {
  assert.deepEqual([...mod.VIEW_MODES], ["grid", "compact", "list"])
  assert.deepEqual(Object.values(mod.VIEW_MODE_LABELS), ["Grid", "Compact", "List"])
})

test("parseViewMode accepts only known modes", () => {
  assert.equal(mod.parseViewMode("list"), "list")
  assert.equal(mod.parseViewMode("compact"), "compact")
  assert.equal(mod.parseViewMode("grid"), "grid")
  assert.equal(mod.parseViewMode("LIST"), null)
  assert.equal(mod.parseViewMode("table"), null)
  assert.equal(mod.parseViewMode(""), null)
  assert.equal(mod.parseViewMode(null), null)
  assert.equal(mod.parseViewMode(undefined), null)
})

test("resolveViewMode: the URL wins over the remembered choice (VM03)", () => {
  assert.equal(mod.resolveViewMode("list", "compact"), "list")
  assert.equal(mod.resolveViewMode("grid", "list"), "grid")
})

test("resolveViewMode: falls back to the remembered choice, then Grid", () => {
  assert.equal(mod.resolveViewMode(null, "list"), "list")
  assert.equal(mod.resolveViewMode("bogus", "compact"), "compact")
  assert.equal(mod.resolveViewMode(null, "bogus"), "grid")
  assert.equal(mod.resolveViewMode(null, null), "grid")
})

test("viewModeSearch writes ?view= for non-default modes and keeps other params", () => {
  assert.equal(mod.viewModeSearch("sort=title", "list"), "sort=title&view=list")
  assert.equal(mod.viewModeSearch("view=list&sort=title", "compact"), "view=compact&sort=title")
  assert.equal(mod.viewModeSearch("view=list&sort=title", "grid"), "sort=title")
  assert.equal(mod.viewModeSearch("", "grid"), "")
  assert.equal(mod.viewModeSearch("?minRating=6", "list"), "minRating=6&view=list")
})

test("listRowMeta joins year and star rating, omitting missing parts", () => {
  assert.equal(mod.listRowMeta({ year: 2019, rating: 8.24 }), "2019 · ★ 8.2")
  assert.equal(mod.listRowMeta({ year: 2019, rating: 0 }), "2019 · ★ 0.0")
  assert.equal(mod.listRowMeta({ year: 2019, rating: null }), "2019")
  assert.equal(mod.listRowMeta({ year: null, rating: 7 }), "★ 7.0")
  assert.equal(mod.listRowMeta({ year: null, rating: null }), "")
  assert.equal(mod.listRowMeta({ year: 2019, rating: 11 }), "2019", "out-of-range ratings are omitted")
  assert.equal(mod.listRowMeta({ year: 2019, rating: Number.NaN }), "2019")
})

test("listRowRating prefers IMDb, then TMDB audience rating", () => {
  assert.equal(mod.listRowRating({ imdb: 8.4, tmdbRating: 7.9 }), 8.4)
  assert.equal(mod.listRowRating({ imdb: null, tmdbRating: 7.9 }), 7.9)
  assert.equal(mod.listRowRating({ imdb: 12, tmdbRating: 7.9 }), 7.9)
  assert.equal(mod.listRowRating({}), null)
})
