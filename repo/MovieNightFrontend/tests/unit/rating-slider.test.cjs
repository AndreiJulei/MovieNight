const test = require("node:test")
const assert = require("node:assert/strict")

let ratingLogic

test.before(async () => {
  ratingLogic = await import("../../src/components/ratingSliderLogic.ts")
})

test("RS01: Slider bounds and step constants", () => {
  assert.equal(ratingLogic.MIN_RATING, 0)
  assert.equal(ratingLogic.MAX_RATING, 10)
  assert.equal(ratingLogic.RATING_STEP, 0.1)
})

test("RS01 / RS02: ratingToSliderValue maps null, undefined, 0, or negative to 0 (Unrated)", () => {
  assert.equal(ratingLogic.ratingToSliderValue(null), 0)
  assert.equal(ratingLogic.ratingToSliderValue(undefined), 0)
  assert.equal(ratingLogic.ratingToSliderValue(0), 0)
  assert.equal(ratingLogic.ratingToSliderValue(-1), 0)
  assert.equal(ratingLogic.ratingToSliderValue(NaN), 0)
})

test("RP03: ratingToSliderValue preserves tenth ratings and rounds to tenths without float drift", () => {
  assert.equal(ratingLogic.ratingToSliderValue(7.5), 7.5)
  assert.equal(ratingLogic.ratingToSliderValue(8.0), 8.0)
  assert.equal(ratingLogic.ratingToSliderValue(8.2), 8.2)
  assert.equal(ratingLogic.ratingToSliderValue(9.1), 9.1)
  assert.equal(ratingLogic.ratingToSliderValue(8.24), 8.2)
  assert.equal(ratingLogic.ratingToSliderValue(8.26), 8.3)
  assert.equal(ratingLogic.ratingToSliderValue(0.1 + 0.2), 0.3)
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

test("RP03: sliderValueToRating preserves ratings > 0 rounded to tenths", () => {
  assert.equal(ratingLogic.sliderValueToRating(0.1), 0.1)
  assert.equal(ratingLogic.sliderValueToRating(7.5), 7.5)
  assert.equal(ratingLogic.sliderValueToRating(8.2), 8.2)
  assert.equal(ratingLogic.sliderValueToRating(9.9), 9.9)
  assert.equal(ratingLogic.sliderValueToRating(9.96), 10.0)
  assert.equal(ratingLogic.sliderValueToRating(12), 10.0)
})

test("RS01: parseRatingInput correctly parses strings and numbers", () => {
  assert.equal(ratingLogic.parseRatingInput("0"), null)
  assert.equal(ratingLogic.parseRatingInput(""), null)
  assert.equal(ratingLogic.parseRatingInput(null), null)
  assert.equal(ratingLogic.parseRatingInput("8.5"), 8.5)
  assert.equal(ratingLogic.parseRatingInput("8.2"), 8.2)
  assert.equal(ratingLogic.parseRatingInput(7.5), 7.5)
})

test("RP03: parseTypedRating accepts 0-10 with at most one decimal and flags anything else", () => {
  assert.deepEqual(ratingLogic.parseTypedRating("8.2"), { valid: true, rating: 8.2 })
  assert.deepEqual(ratingLogic.parseTypedRating(" 9.1 "), { valid: true, rating: 9.1 })
  assert.deepEqual(ratingLogic.parseTypedRating("10"), { valid: true, rating: 10 })
  assert.deepEqual(ratingLogic.parseTypedRating("7.5"), { valid: true, rating: 7.5 })
  assert.deepEqual(ratingLogic.parseTypedRating(".5"), { valid: true, rating: 0.5 })
  assert.deepEqual(ratingLogic.parseTypedRating(""), { valid: true, rating: null })
  assert.deepEqual(ratingLogic.parseTypedRating("0"), { valid: true, rating: null })
  for (const bad of ["8.25", "10.1", "-0.1", "11", "abc", "8.", "1e1", "Infinity"]) {
    assert.deepEqual(ratingLogic.parseTypedRating(bad), { valid: false }, bad)
  }
})

test("RP03: isValidPersonalRating matches the API rule", () => {
  for (const ok of [0, 0.1, 8.2, 7.5, 10]) assert.equal(ratingLogic.isValidPersonalRating(ok), true, String(ok))
  for (const bad of [8.25, 10.1, -0.1, NaN, Infinity]) assert.equal(ratingLogic.isValidPersonalRating(bad), false, String(bad))
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
  assert.equal(ratingLogic.formatRatingReadout(8.2), "★ 8.2")
  assert.equal(ratingLogic.formatRatingReadout(7.5), "★ 7.5")
  assert.equal(ratingLogic.formatRatingReadout(8), "★ 8.0")
  assert.equal(ratingLogic.formatRatingReadout(10), "★ 10.0")
})

test("RP03: calculateNextRating arrow keys step by 0.1", () => {
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowUp"), 0.1)
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowRight"), 0.1)
  assert.equal(ratingLogic.calculateNextRating(8.1, "ArrowUp"), 8.2)
  assert.equal(ratingLogic.calculateNextRating(8.2, "ArrowRight"), 8.3)
  assert.equal(ratingLogic.calculateNextRating(0.2, "ArrowUp"), 0.3)
  assert.equal(ratingLogic.calculateNextRating(10.0, "ArrowUp"), 10.0)

  assert.equal(ratingLogic.calculateNextRating(8.0, "ArrowDown"), 7.9)
  assert.equal(ratingLogic.calculateNextRating(8.3, "ArrowLeft"), 8.2)
  assert.equal(ratingLogic.calculateNextRating(0.1, "ArrowDown"), null)
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowDown"), null)
})

test("RP03: calculateNextRating Shift+arrow keys step by 0.5", () => {
  const shift = { shiftKey: true }
  assert.equal(ratingLogic.calculateNextRating(null, "ArrowUp", shift), 0.5)
  assert.equal(ratingLogic.calculateNextRating(8.2, "ArrowUp", shift), 8.7)
  assert.equal(ratingLogic.calculateNextRating(8.2, "ArrowRight", shift), 8.7)
  assert.equal(ratingLogic.calculateNextRating(8.2, "ArrowDown", shift), 7.7)
  assert.equal(ratingLogic.calculateNextRating(8.2, "ArrowLeft", shift), 7.7)
  assert.equal(ratingLogic.calculateNextRating(9.8, "ArrowUp", shift), 10.0)
  assert.equal(ratingLogic.calculateNextRating(0.3, "ArrowDown", shift), null)
})

test("RP03: calculateNextRating Page Up / Page Down step by 1.0", () => {
  assert.equal(ratingLogic.calculateNextRating(null, "PageUp"), 1.0)
  assert.equal(ratingLogic.calculateNextRating(6.5, "PageUp"), 7.5)
  assert.equal(ratingLogic.calculateNextRating(8.2, "PageUp"), 9.2)
  assert.equal(ratingLogic.calculateNextRating(9.5, "PageUp"), 10.0)
  assert.equal(ratingLogic.calculateNextRating(8.2, "PageUp", { shiftKey: true }), 9.2)

  assert.equal(ratingLogic.calculateNextRating(7.5, "PageDown"), 6.5)
  assert.equal(ratingLogic.calculateNextRating(8.2, "PageDown"), 7.2)
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
  assert.equal(ratingLogic.calculateTrackFillPercentage(8.2), 82)
  assert.equal(ratingLogic.calculateTrackFillPercentage(10.0), 100)
})
