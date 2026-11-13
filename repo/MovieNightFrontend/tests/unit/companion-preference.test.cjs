const test = require("node:test");
const assert = require("node:assert/strict");

// Ticket #19 (PD-03): the pixel companion is off unless chosen, and never shown on phones.
let readCompanionChoice;
let isCompanionShown;

test.before(async () => {
  ({ readCompanionChoice, isCompanionShown } = await import("../../src/components/companionPreference.ts"));
});

const storageWith = (entries) => ({ getItem: (key) => (key in entries ? entries[key] : null) });

test("SF02: a fresh account or device has no companion", () => {
  assert.equal(readCompanionChoice(storageWith({})), "none");
});

test("SF02: an explicit companion choice is kept", () => {
  assert.equal(readCompanionChoice(storageWith({ pixel_companion_char: "courage" })), "courage");
  assert.equal(readCompanionChoice(storageWith({ pixel_companion_char: "none" })), "none");
});

test("SF02: an unknown stored value falls back to no companion", () => {
  assert.equal(readCompanionChoice(storageWith({ pixel_companion_char: "gandalf" })), "none");
});

test("SF02: unavailable storage means no companion", () => {
  const throwing = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(readCompanionChoice(throwing), "none");
  assert.equal(readCompanionChoice(undefined), "none");
});

test("SF03: a chosen companion is shown on desktop only", () => {
  assert.equal(isCompanionShown({ choice: "wick", compact: false, path: "/home" }), true);
  assert.equal(isCompanionShown({ choice: "wick", compact: true, path: "/home" }), false);
});

test("SF02: no companion is shown when none is chosen or on sign-in", () => {
  assert.equal(isCompanionShown({ choice: "none", compact: false, path: "/home" }), false);
  assert.equal(isCompanionShown({ choice: "wick", compact: false, path: "/login" }), false);
});
