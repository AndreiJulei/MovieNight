const test = require("node:test");
const assert = require("node:assert/strict");

let formatRuntime;
let parseCastMembers;
let getInitials;
let initialDetailPageState;
let detailPageReducer;

test.before(async () => {
  const mod = await import("../../src/components/movieDetailLogic.ts");
  formatRuntime = mod.formatRuntime;
  parseCastMembers = mod.parseCastMembers;
  getInitials = mod.getInitials;
  initialDetailPageState = mod.initialDetailPageState;
  detailPageReducer = mod.detailPageReducer;
});

test("formatRuntime formats minutes into hours and minutes", () => {
  assert.equal(formatRuntime(93), "1h 33m");
  assert.equal(formatRuntime(120), "2h 00m");
  assert.equal(formatRuntime(45), "45m");
  assert.equal(formatRuntime(0), null);
  assert.equal(formatRuntime(null), null);
  assert.equal(formatRuntime(undefined), null);
});

test("getInitials extracts two-letter initials from name", () => {
  assert.equal(getInitials("Ewan McGregor"), "EM");
  assert.equal(getInitials("Robert De Niro"), "RN");
  assert.equal(getInitials("Zendaya"), "Z");
  assert.equal(getInitials(""), "?");
  assert.equal(getInitials(null), "?");
});

test("parseCastMembers parses comma-delimited string with roles", () => {
  const input = "Ewan McGregor as Mark Renton, Ewen Bremner as Spud, Jonny Lee Miller";
  const cast = parseCastMembers(input);
  assert.equal(cast.length, 3);
  assert.deepEqual(cast[0], { name: "Ewan McGregor", role: "Mark Renton", profileUrl: null });
  assert.deepEqual(cast[1], { name: "Ewen Bremner", role: "Spud", profileUrl: null });
  assert.deepEqual(cast[2], { name: "Jonny Lee Miller", role: "Cast", profileUrl: null });
});

test("parseCastMembers prioritizes existing structured cast with profile photos", () => {
  const structured = [
    { name: "Ewan McGregor", role: "Mark Renton", profileUrl: "https://image.tmdb.org/t/p/w185/ewan.jpg" },
    { name: "Kelly Macdonald", role: "Diane", profileUrl: "https://image.tmdb.org/t/p/w185/kelly.jpg" }
  ];
  const cast = parseCastMembers("Ewan McGregor, Kelly Macdonald", structured);
  assert.equal(cast.length, 2);
  assert.equal(cast[0].profileUrl, "https://image.tmdb.org/t/p/w185/ewan.jpg");
  assert.equal(cast[0].role, "Mark Renton");
  assert.equal(cast[1].profileUrl, "https://image.tmdb.org/t/p/w185/kelly.jpg");
});

test("parseCastMembers sanitizes name-as-role in existing cast when role is 'Cast'", () => {
  const structuredWithRoleInName = [
    { name: "Ewan McGregor as Mark Renton", role: "Cast", profileUrl: null },
    { name: "Kelly Macdonald (Diane)", role: "Cast", profileUrl: null },
  ];
  const cast = parseCastMembers("", structuredWithRoleInName);
  assert.equal(cast.length, 2);
  assert.equal(cast[0].name, "Ewan McGregor");
  assert.equal(cast[0].role, "Mark Renton");
});

test("detailPageReducer handles trailer modal open and close", () => {
  const initial = initialDetailPageState(null, "");
  assert.equal(initial.isTrailerModalOpen, false);

  const opened = detailPageReducer(initial, { type: "OPEN_TRAILER" });
  assert.equal(opened.isTrailerModalOpen, true);

  const closed = detailPageReducer(opened, { type: "CLOSE_TRAILER" });
  assert.equal(closed.isTrailerModalOpen, false);
});

test("detailPageReducer handles inline rating slider toggle and rating adjustments", () => {
  const initial = initialDetailPageState(null, "");
  assert.equal(initial.isSliderExpanded, false);

  // Toggle open and populate initial values
  const expanded = detailPageReducer(initial, {
    type: "TOGGLE_SLIDER",
    rating: 8.5,
    notes: "Great movie",
  });
  assert.equal(expanded.isSliderExpanded, true);
  assert.equal(expanded.rating, 8.5);
  assert.equal(expanded.notes, "Great movie");

  // Adjust rating
  const adjusted = detailPageReducer(expanded, {
    type: "SET_RATING",
    rating: 9.0,
  });
  assert.equal(adjusted.rating, 9.0);

  // Close slider
  const closed = detailPageReducer(adjusted, { type: "CLOSE_SLIDER" });
  assert.equal(closed.isSliderExpanded, false);
  assert.equal(closed.rating, 9.0);
});

