const test = require("node:test");
const assert = require("node:assert/strict");

// Ticket #43 (PD-25): Animations default off on phones, on on desktop; a stored choice wins.
let resolveAnimationsEnabled;
let animationsEnabled;

test.before(async () => {
  ({ resolveAnimationsEnabled, animationsEnabled } = await import("../../src/components/motionPreference.ts"));
});

const storageWith = (entries) => ({ getItem: (key) => (key in entries ? entries[key] : null) });
const motion = (reduce) => () => ({ matches: reduce });

test("AN01: with no stored choice, phones default off and desktops on", () => {
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: 390, reducedMotion: false }), false);
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: 767, reducedMotion: false }), false);
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: 768, reducedMotion: false }), true);
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: 1440, reducedMotion: false }), true);
});

test("AN02: a stored choice wins over the device default", () => {
  assert.equal(resolveAnimationsEnabled({ stored: true, viewportWidth: 390, reducedMotion: false }), true);
  assert.equal(resolveAnimationsEnabled({ stored: false, viewportWidth: 1440, reducedMotion: false }), false);
  assert.equal(resolveAnimationsEnabled({ stored: true, viewportWidth: 1440, reducedMotion: true }), true);
});

test("AN03: reduced motion defaults off on any device", () => {
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: 1440, reducedMotion: true }), false);
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: 390, reducedMotion: true }), false);
});

test("an unknown viewport width defaults to the desktop behaviour", () => {
  assert.equal(resolveAnimationsEnabled({ stored: null, viewportWidth: undefined, reducedMotion: false }), true);
});

test("animationsEnabled reads storage, the load-time width and reduced motion", () => {
  assert.equal(animationsEnabled(storageWith({}), motion(false), 390), false);
  assert.equal(animationsEnabled(storageWith({}), motion(false), 1280), true);
  assert.equal(animationsEnabled(storageWith({ movienight_animations: "on" }), motion(false), 390), true);
  assert.equal(animationsEnabled(storageWith({ movienight_animations: "off" }), motion(false), 1280), false);
  assert.equal(animationsEnabled(storageWith({}), motion(true), 1280), false);
});
