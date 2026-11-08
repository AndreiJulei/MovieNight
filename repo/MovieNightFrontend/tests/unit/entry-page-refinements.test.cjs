const test = require("node:test");
const assert = require("node:assert/strict");

let m;
test.before(async () => {
  m = await import("../../src/components/movieDetailLogic.ts");
});

test("logo shown when logoUrl exists and has not failed", () => {
  const d = m.resolveDetailTitleDisplay({ id: "1", title: "Dune", logoUrl: " https://x/l.png " });
  assert.deepEqual(d, { mode: "logo", logoUrl: "https://x/l.png", title: "Dune" });
});

test("text fallback when logo missing, blank, or errored", () => {
  assert.equal(m.resolveDetailTitleDisplay({ id: "1", title: "Dune" }).mode, "text");
  assert.equal(m.resolveDetailTitleDisplay({ id: "1", title: "Dune", logoUrl: "  " }).mode, "text");
  assert.equal(
    m.resolveDetailTitleDisplay({ id: "1", title: "Dune", logoUrl: "https://x/l.png" }, { 1: true }).mode,
    "text",
  );
});

test("rating sync polls released titles missing ratings, bounded", () => {
  const now = new Date("2026-06-01");
  assert.equal(m.shouldSyncProviderRatings({ year: 2024, imdb: null, rt: null }, 0, now), true);
  assert.equal(m.shouldSyncProviderRatings({ year: 2024, imdb: 7, rt: 80 }, 0, now), false);
  assert.equal(m.shouldSyncProviderRatings({ year: 2024, imdb: null, rt: null }, 3, now), false);
  assert.equal(m.shouldSyncProviderRatings({ year: 2027, imdb: null, rt: null }, 0, now), false);
});

test("unreleased titles get a clean notice, released/rated ones do not", () => {
  const now = new Date("2026-06-01");
  assert.equal(m.providerRatingNotice({ year: 2027 }, now), "Not yet rated");
  assert.equal(m.providerRatingNotice({ year: 2027, imdb: 6 }, now), null);
  assert.equal(m.providerRatingNotice({ year: 2020 }, now), null);
});

test("removing from watched history keeps page state in place", () => {
  const before = { isTrailerModalOpen: true, isSliderExpanded: true, rating: 8, notes: "great" };
  const after = m.stateAfterLibraryRemoval(before);
  assert.deepEqual(after, { isTrailerModalOpen: true, isSliderExpanded: false, rating: null, notes: "" });
});
