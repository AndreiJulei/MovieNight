const test = require("node:test");
const assert = require("node:assert/strict");

// Ticket #18 (KA03): a read slower than the threshold shows the "Waking up the server…" notice.
let boundedRead;
let serverWake;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test.before(async () => {
  ({ boundedRead } = await import("../../src/api/boundedRead.ts"));
  serverWake = await import("../../src/api/serverWake.ts");
});

test("KA03: a slow read shows the waking notice until it settles", async () => {
  const read = boundedRead("cold:slow", async () => {
    await wait(60);
    return "ok";
  }, { _slowMs: 15 });

  assert.equal(serverWake.isServerWaking(), false, "no notice before the threshold");
  await wait(35);
  assert.equal(serverWake.isServerWaking(), true, "notice after the threshold");
  assert.equal(await read, "ok");
  assert.equal(serverWake.isServerWaking(), false, "notice clears when the read settles");
});

test("KA03: a fast read never shows the waking notice", async () => {
  const seen = [];
  const unsubscribe = serverWake.subscribeServerWaking(() => seen.push(serverWake.isServerWaking()));
  assert.equal(await boundedRead("cold:fast", async () => "ok", { _slowMs: 15 }), "ok");
  await wait(30);
  unsubscribe();
  assert.deepEqual(seen, []);
});

function hangUntilAborted(signal) {
  return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
}

test("KA03: a slow read that times out waits for the server, retries once and completes", async () => {
  const healthRequests = [];
  global.fetch = async (url) => {
    healthRequests.push(String(url));
    await wait(40); // the server finishes waking
    return { ok: true, status: 200 };
  };
  serverWake.configureServerWake("http://api.test/api/health");

  let calls = 0;
  const result = await boundedRead("cold:retry", async (signal) => {
    calls++;
    if (calls === 1) return hangUntilAborted(signal); // cold start: the first attempt times out
    return "title details";
  }, { _slowMs: 10, _timeoutMs: 30, _delays: [] });

  assert.equal(result, "title details", "the original read completes without a reload");
  assert.equal(calls, 2, "exactly one cold-start retry, even with no ordinary retries left");
  assert.deepEqual(healthRequests, ["http://api.test/api/health"]);
  assert.equal(serverWake.isServerWaking(), false);
});

test("KA03: the cold-start retry happens once; a further failure is reported", async () => {
  global.fetch = async () => ({ ok: true, status: 200 });
  serverWake.configureServerWake("http://api.test/api/health");

  let calls = 0;
  await assert.rejects(
    boundedRead("cold:still-down", async (signal) => {
      calls++;
      return hangUntilAborted(signal);
    }, { _slowMs: 10, _timeoutMs: 30, _delays: [5, 5] }),
    (err) => err.name === "TimeoutError",
  );
  assert.equal(calls, 2);
  assert.equal(serverWake.isServerWaking(), false);
});

test("KA03: a read that fails fast while the server wakes also waits for it and retries once", async () => {
  let awake = false;
  global.fetch = async () => {
    await wait(30);
    awake = true; // the health check returns once the server is up
    return { ok: true, status: 200 };
  };
  serverWake.configureServerWake("http://api.test/api/health");

  const noticeStates = [];
  const unsubscribe = serverWake.subscribeServerWaking(() => noticeStates.push(serverWake.isServerWaking()));
  let calls = 0;
  const result = await boundedRead("cold:fast-503", async () => {
    calls++;
    if (!awake) throw Object.assign(new Error("Bad gateway"), { status: 503 });
    return "explore page";
  }, { _slowMs: 10_000, _delays: [1, 1] });
  unsubscribe();

  assert.equal(result, "explore page");
  assert.equal(calls, 4, "three ordinary attempts, then one cold-start retry after the health check");
  assert.deepEqual(noticeStates, [true, false], "the notice shows while waiting for the server");
});

test("Bounded-read contract: an unreachable server still fails after 3 attempts", async () => {
  global.fetch = async () => { throw new TypeError("Failed to fetch"); };
  serverWake.configureServerWake("http://api.test/api/health");

  let calls = 0;
  await assert.rejects(boundedRead("cold:offline", async () => {
    calls++;
    throw new TypeError("Failed to fetch");
  }, { _slowMs: 10_000, _delays: [1, 1] }));
  assert.equal(calls, 3);
  assert.equal(serverWake.isServerWaking(), false);
});
