const test = require("node:test")
const assert = require("node:assert/strict")

let ratingLogic

test.before(async () => {
  ratingLogic = await import("../../src/components/ratingSliderLogic.ts")
})

test("RS01: Slider bounds and step constants", () => {
  assert.equal(ratingLogic.MIN_RATING, 0)
  assert.equal(ratingLogic.MAX_RATING, 10)
  assert.equal(ratingLogic.RATING_STEP, 0.5)
})

test("RS01 / RS02: ratingToSliderValue maps null, undefined, 0, or negative to 0 (Unrated)", () => {
  assert.equal(ratingLogic.ratingToSliderValue(null), 0)
  assert.equal(ratingLogic.ratingToSliderValue(undefined), 0)
  assert.equal(ratingLogic.ratingToSliderValue(0), 0)
  assert.equal(ratingLogic.ratingToSliderValue(-1), 0)
  assert.equal(ratingLogic.ratingToSliderValue(NaN), 0)
})

test("RS01: ratingToSliderValue preserves valid ratings and snaps to 0.5 steps", () => {
  assert.equal(ratingLogic.ratingToSliderValue(7.5), 7.5)
  assert.equal(ratingLogic.ratingToSliderValue(8.0), 8.0)
  assert.equal(ratingLogic.ratingToSliderValue(8.2), 8.0)
  assert.equal(ratingLogic.ratingToSliderValue(8.3), 8.5)
  assert.equal(ratingLogic.ratingToSliderValue(10.0), 10.0)
  assert.equal(
    ratingLogic.ratingToSliderValue(11.5),
    10.0,
    "Clamps upper boundary to 10.0",
  )
})

test("RS01 / RS02: sliderValueToRating maps 0 or negative to null (Unrated)", () => {
  assert.equal(ratingLogic.sliderValueToRating(0), null)
  assert.equal(ratingLogic.sliderValueToRating(-0.5), null)
  assert.equal(ratingLogic.sliderValueToRating(NaN), null)
})

test("RS01: sliderValueToRating preserves ratings > 0 snapped to 0.5 steps", () => {
  assert.equal(ratingLogic.sliderValueToRating(0.5), 0.5)
  assert.equal(ratingLogic.sliderValueToRating(7.5), 7.5)
  assert.equal(ratingLogic.sliderValueToRating(9.9), 10.0)
  assert.equal(ratingLogic.sliderValueToRating(12), 10.0)
})

test("RS01: parseRatingInput correctly parses strings and numbers", () => {
  assert.equal(ratingLogic.parseRatingInput("0"), null)
  assert.equal(ratingLogic.parseRatingInput(""), null)
  assert.equal(ratingLogic.parseRatingInput(null), null)
  assert.equal(ratingLogic.parseRatingInput("8.5"), 8.5)
  assert.equal(ratingLogic.parseRatingInput(7.5), 7.5)
})

test("RS02: formatRatingReadout returns 'Unrated' for null, 0, or invalid ratings", () => {
  assert.equal(ratingLogic.formatRatingReadout(null), "Unrated")
  assert.equal(ratingLogic.formatRatingReadout(undefined), "Unrated")
  assert.equal(ratingLogic.formatRatingReadout(0), "Unrated")
  assert.equal(ratingLogic.formatRatingReadout(-2), "Unrated")
  assert.equal(ratingLogic.formatRatingReadout(NaN), "Unrated")
})

test("RS02: formatRatingReadout formats valid ratings with star icon and 1 decimal place", () => {
  assert.equal(ratingLogic.formatRatingReadout(0.5), "★ 0.5")
  assert.equal(ratingLogic.formatRatingReadout(7.5), "★ 7.5")
  assert.equal(ratingLogic.formatRatingReadout(8), "★ 8.0")
  assert.equal(ratingLogic.formatRatingReadout(10), "★ 10.0")
})

test("RS03: calculateNextRating arrow keys step by 0.5 increments", () => {
  // From unrated (null), arrow up gives 0.5
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowUp"), 0.5)
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowRight"), 0.5)
  // From 7.5, arrow up gives 8.0
  assert.equal(ratingLogic.calculateNextRating(7.5, "ArrowUp"), 8.0)
  assert.equal(ratingLogic.calculateNextRating(7.5, "ArrowRight"), 8.0)
  // At 10.0 max, arrow up stays 10.0
  assert.equal(ratingLogic.calculateNextRating(10.0, "ArrowUp"), 10.0)

  // From 8.0, arrow down gives 7.5
  assert.equal(ratingLogic.calculateNextRating(8.0, "ArrowDown"), 7.5)
  assert.equal(ratingLogic.calculateNextRating(8.0, "ArrowLeft"), 7.5)
  // From 0.5, arrow down steps down to 0 (Unrated -> null)
  assert.equal(ratingLogic.calculateNextRating(0.5, "ArrowDown"), null)
  // From unrated, arrow down stays unrated (null)
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowDown"), null)
})

test("RS03: calculateNextRating Page Up / Page Down steps by 1.0 increments", () => {
  assert.equal(ratingLogic.calculateNextRating(null, "PageUp"), 1.0)
  assert.equal(ratingLogic.calculateNextRating(6.5, "PageUp"), 7.5)
  assert.equal(ratingLogic.calculateNextRating(9.5, "PageUp"), 10.0)

  assert.equal(ratingLogic.calculateNextRating(7.5, "PageDown"), 6.5)
  assert.equal(ratingLogic.calculateNextRating(1.0, "PageDown"), null)
  assert.equal(ratingLogic.calculateNextRating(0.5, "PageDown"), null)
})

test("RS03: calculateNextRating Home jumps to 0 (Unrated) and End jumps to 10.0", () => {
  assert.equal(ratingLogic.calculateNextRating(8.5, "Home"), null)
  assert.equal(ratingLogic.calculateNextRating(null, "End"), 10.0)
  assert.equal(ratingLogic.calculateNextRating(4.0, "End"), 10.0)
  assert.equal(ratingLogic.calculateNextRating(5.0, "Escape"), undefined)
})

test("calculateTrackFillPercentage calculates accurate 0-100% gradient percentage", () => {
  assert.equal(ratingLogic.calculateTrackFillPercentage(null), 0)
  assert.equal(ratingLogic.calculateTrackFillPercentage(0), 0)
  assert.equal(ratingLogic.calculateTrackFillPercentage(5.0), 50)
  assert.equal(ratingLogic.calculateTrackFillPercentage(7.5), 75)
  assert.equal(ratingLogic.calculateTrackFillPercentage(10.0), 100)
})
