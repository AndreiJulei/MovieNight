const test = require("node:test")
const assert = require("node:assert/strict")

let menu

test.before(async () => {
  menu = await import("../../src/components/phoneMenuLogic.ts")
})

test("PB03: with no keyboard the panel sits on the 56px bar", () => {
  assert.equal(
    menu.phoneMenuBottomOffset({ layoutHeight: 844, viewportHeight: 844, viewportOffsetTop: 0 }),
    56,
  )
})

test("search keyboard open: the panel rises to the keyboard's top edge", () => {
  // 844px layout, 336px keyboard -> visible viewport 508px tall.
  assert.equal(
    menu.phoneMenuBottomOffset({ layoutHeight: 844, viewportHeight: 508, viewportOffsetTop: 0 }),
    336,
  )
})

test("iOS scrolled visual viewport: offsetTop is subtracted from the inset", () => {
  assert.equal(
    menu.phoneMenuBottomOffset({ layoutHeight: 844, viewportHeight: 508, viewportOffsetTop: 120 }),
    216,
  )
})

test("a small inset (browser toolbar, pinch rounding) never drops the panel below the bar", () => {
  assert.equal(
    menu.phoneMenuBottomOffset({ layoutHeight: 844, viewportHeight: 820, viewportOffsetTop: 0 }),
    56,
  )
})
