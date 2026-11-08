const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

let logic

test.before(async () => {
  logic = await import("../../src/components/characterBannerLogic.ts")
})

test("CHARACTER_LOGOS contains all 9 transparent character variants from Ticket 2 (CL02)", () => {
  const expectedSrcs = [
    "/mainPageLogo/bvs_vertical_transparent.png",
    "/mainPageLogo/fightclub_transparent_pink.png",
    "/mainPageLogo/fightclub_transparent_violet.png",
    "/mainPageLogo/killbill_transparent_violet.png",
    "/mainPageLogo/killbill_transparent_yellow.png",
    "/mainPageLogo/spidey_vertical_transparent.png",
    "/mainPageLogo/spidey_vertical_transparent_violet.png",
    "/mainPageLogo/vader_crossed_transparent.png",
    "/mainPageLogo/vader_marvel_transparent.png",
  ]

  assert.equal(logic.CHARACTER_LOGOS.length, 9)
  for (const expected of expectedSrcs) {
    assert(
      logic.CHARACTER_LOGOS.includes(expected),
      `Missing expected character logo src: ${expected}`,
    )
  }
})

test("Every logo path in CHARACTER_LOGOS starts with /mainPageLogo/ and exists on disk in public/", () => {
  const publicDir = path.resolve(__dirname, "../../public")

  for (const src of logic.CHARACTER_LOGOS) {
    assert(
      typeof src === "string" && src.startsWith("/mainPageLogo/"),
      "src must start with /mainPageLogo/",
    )

    const filePath = path.join(publicDir, src.replace(/^\//, ""))
    assert(
      fs.existsSync(filePath),
      `Logo asset file does not exist on disk: ${filePath}`,
    )
  }
})

test("selectRandomCharacterLogo returns a valid asset path with default RNG (CL02)", () => {
  const selected = logic.selectRandomCharacterLogo()
  assert(typeof selected === "string", "Selection should be a string path")
  assert(
    logic.CHARACTER_LOGOS.includes(selected),
    "Selected logo must be one of CHARACTER_LOGOS",
  )
})

test("selectRandomCharacterLogo works deterministically with injected random generator", () => {
  const first = logic.selectRandomCharacterLogo(logic.CHARACTER_LOGOS, () => 0)
  assert.equal(first, logic.CHARACTER_LOGOS[0])

  const last = logic.selectRandomCharacterLogo(
    logic.CHARACTER_LOGOS,
    () => 0.9999,
  )
  assert.equal(last, logic.CHARACTER_LOGOS[logic.CHARACTER_LOGOS.length - 1])

  const middleIndex = 3
  const mid = logic.selectRandomCharacterLogo(
    logic.CHARACTER_LOGOS,
    () => middleIndex / logic.CHARACTER_LOGOS.length,
  )
  assert.equal(mid, logic.CHARACTER_LOGOS[middleIndex])
})

test("selectRandomCharacterLogo handles empty or null logos list gracefully", () => {
  assert.equal(logic.selectRandomCharacterLogo([]), null)
  assert.equal(logic.selectRandomCharacterLogo(null), null)
})

test("selectRandomCharacterLogo covers all assets over simulated random runs", () => {
  const chosen = new Set()
  for (let i = 0; i < 500; i++) {
    const pick = logic.selectRandomCharacterLogo()
    chosen.add(pick)
  }

  assert.equal(
    chosen.size,
    logic.CHARACTER_LOGOS.length,
    "Simulated random selections should reach all available transparent logos",
  )
})
