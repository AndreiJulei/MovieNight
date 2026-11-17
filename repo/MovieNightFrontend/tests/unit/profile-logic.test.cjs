const test = require("node:test")
const assert = require("node:assert/strict")

let logic

test.before(async () => {
  logic = await import("../../src/components/profileLogic.ts")
})

const lists = [
  { id: 7, title: "Horror night", shared: true },
  { id: 8, title: "Private stash", shared: false },
]

test("defaults: Watchlist and Watched tabs first, then shared custom lists", () => {
  const tabs = logic.sharedTabs({ sharesWatchlist: true, sharesWatched: true, lists })
  assert.deepEqual(tabs.map((t) => t.key), ["watchlist", "watched", "list:7"])
  assert.equal(tabs[2].label, "Horror night")
})

test("PF02: hidden lists are not tabs but are offered to the owner under + Share a list", () => {
  const sharing = { sharesWatchlist: true, sharesWatched: false, lists }
  assert.deepEqual(logic.sharedTabs(sharing).map((t) => t.key), ["watchlist", "list:7"])
  assert.deepEqual(logic.hiddenTabs(sharing).map((t) => t.key), ["watched", "list:8"])
})

test("the selected tab falls back to the first shared tab when it disappears", () => {
  const tabs = logic.sharedTabs({ sharesWatchlist: false, sharesWatched: true, lists: [] })
  assert.equal(logic.resolveSelectedTab("watchlist", tabs), "watched")
  assert.equal(logic.resolveSelectedTab("watched", tabs), "watched")
  assert.equal(logic.resolveSelectedTab("watched", []), null)
})

test("rank progress copy names the next rank, and the top rank says so", () => {
  assert.equal(logic.rankProgressLabel(1, "The Maverick"), "1 more to The Maverick")
  assert.equal(logic.rankProgressLabel(15, "The Maverick"), "15 more to The Maverick")
  assert.equal(logic.rankProgressLabel(0, null), "Top rank reached")
})

test("level progress counts toward the next milestone, and the top level says so", () => {
  assert.equal(logic.levelProgressLabel(2, 4, 15), "4/15 to level 3")
  assert.equal(logic.levelProgressLabel(7, 0, 0), "Top level reached")
})

test("XP bar percentage is bounded and level-relative", () => {
  assert.equal(logic.xpPercent(0, 10), 0)
  assert.equal(logic.xpPercent(9, 10), 90)
  assert.equal(logic.xpPercent(12, 10), 100)
  assert.equal(logic.xpPercent(3, 0), 0)
})

test("default avatar is the first letter of the display name, else the username", () => {
  assert.equal(logic.avatarInitial("  zoë", "x"), "Z")
  assert.equal(logic.avatarInitial("", "neo"), "N")
  assert.equal(logic.avatarInitial("", ""), "?")
})
