import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { cachedRead, invalidateReadCache } from "./readCache.ts";

const W = { freshMs: 60_000, maxAgeMs: 300_000 };
let t = 0;
const clock = { now: () => t };
const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => { t = 1_000_000; invalidateReadCache(); });

function counter(values: string[]) {
  let calls = 0;
  const load = async (_background: boolean) => values[Math.min(calls++, values.length - 1)];
  return { load, calls: () => calls };
}

test("a fresh entry is served without a request", async () => {
  const c = counter(["a", "b"]);
  assert.equal(await cachedRead("k", W, c.load, clock), "a");
  t += 30_000;
  assert.equal(await cachedRead("k", W, c.load, clock), "a");
  assert.equal(c.calls(), 1);
});

test("a stale entry is served immediately and refreshed in the background", async () => {
  const c = counter(["a", "b"]);
  await cachedRead("k", W, c.load, clock);
  t += 120_000;
  assert.equal(await cachedRead("k", W, c.load, clock), "a");
  await tick();
  assert.equal(c.calls(), 2);
  assert.equal(await cachedRead("k", W, c.load, clock), "b");
});

test("an expired entry waits for the network", async () => {
  const c = counter(["a", "b"]);
  await cachedRead("k", W, c.load, clock);
  t += 400_000;
  assert.equal(await cachedRead("k", W, c.load, clock), "b");
});

test("errors are not cached and a failed refresh keeps the stale value", async () => {
  let fail = true;
  const load = async () => { if (fail) throw new Error("down"); return "ok"; };
  await assert.rejects(cachedRead("k", W, load, clock));
  fail = false;
  assert.equal(await cachedRead("k", W, load, clock), "ok");
  t += 120_000;
  fail = true;
  assert.equal(await cachedRead("k", W, load, clock), "ok");
  await tick();
  assert.equal(await cachedRead("k", W, async () => "x", clock), "ok");
});

test("invalidate clears entries and discards an in-flight older result", async () => {
  const c = counter(["a", "b"]);
  await cachedRead("k", W, c.load, clock);
  invalidateReadCache();
  assert.equal(await cachedRead("k", W, c.load, clock), "b");

  let release!: (v: string) => void;
  const slow = new Promise<string>((r) => { release = r; });
  const pending = cachedRead("slow", W, () => slow, clock);
  invalidateReadCache();
  release("old");
  assert.equal(await pending, "old");
  const fresh = counter(["new"]);
  assert.equal(await cachedRead("slow", W, fresh.load, clock), "new");
});

test("callers cannot mutate what later visits receive", async () => {
  const c = { load: async () => ({ items: [1, 2] }) };
  const first = await cachedRead("k", W, c.load, clock);
  first.items.push(99);
  const second = await cachedRead("k", W, c.load, clock);
  assert.deepEqual(second.items, [1, 2]);
});

test("entries are keyed separately", async () => {
  assert.equal(await cachedRead("a", W, async () => "A", clock), "A");
  assert.equal(await cachedRead("b", W, async () => "B", clock), "B");
});
