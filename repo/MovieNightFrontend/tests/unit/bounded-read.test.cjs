const test = require('node:test');
const assert = require('node:assert/strict');

// Import production code directly from src/api/boundedRead.ts (Standards Finding 2)
let boundedRead;
let isTransientError;
let parseRetryAfter;
let RequestTimeoutError;
let pendingReads;
let RETRY_DELAYS;

test.before(async () => {
  const mod = await import('../../src/api/boundedRead.ts');
  boundedRead = mod.boundedRead;
  isTransientError = mod.isTransientError;
  parseRetryAfter = mod.parseRetryAfter;
  RequestTimeoutError = mod.RequestTimeoutError;
  pendingReads = mod.pendingReads;
  RETRY_DELAYS = mod.RETRY_DELAYS;
});

test('isTransientError classification matrix', () => {
  // Transient HTTP statuses
  assert.equal(isTransientError({ status: 502 }), true, '502 Bad Gateway is transient');
  assert.equal(isTransientError({ status: 503 }), true, '503 Service Unavailable is transient');
  assert.equal(isTransientError({ status: 504 }), true, '504 Gateway Timeout is transient');
  assert.equal(isTransientError({ status: 429 }), true, '429 Rate Limit is transient');

  // Retry-After handling
  assert.equal(isTransientError({ status: 429, retryAfter: '3' }), true, 'Retry-After <= 5s is transient');
  assert.equal(isTransientError({ status: 429, retryAfter: '5' }), true, 'Retry-After == 5s is transient');
  assert.equal(isTransientError({ status: 429, retryAfter: '6' }), false, 'Retry-After > 5s is non-transient');
  assert.equal(isTransientError({ status: 503, retryAfter: '30' }), false, '503 with Retry-After 30s is non-transient');

  // Non-transient HTTP statuses
  assert.equal(isTransientError({ status: 400 }), false, '400 Bad Request is non-transient');
  assert.equal(isTransientError({ status: 401 }), false, '401 Unauthorized is non-transient');
  assert.equal(isTransientError({ status: 403 }), false, '403 Forbidden is non-transient');
  assert.equal(isTransientError({ status: 404 }), false, '404 Not Found is non-transient');
  assert.equal(isTransientError({ status: 409 }), false, '409 Conflict is non-transient');
  assert.equal(isTransientError({ status: 410 }), false, '410 Gone is non-transient (session renewal)');
  assert.equal(isTransientError({ status: 422 }), false, '422 Unprocessable is non-transient');

  // Network / drop / timeout errors
  assert.equal(isTransientError(new TypeError('Failed to fetch')), true, 'Network TypeError is transient');
  const timeoutErr = new RequestTimeoutError('Request timed out.');
  assert.equal(isTransientError(timeoutErr), true, 'RequestTimeoutError is transient');
  const genericTimeout = new Error('Request timed out.');
  assert.equal(isTransientError(genericTimeout), true, 'Error with timeout message is transient');

  // User cancellation must NOT be transient
  const userAbort = new Error('Cancelled');
  userAbort.name = 'AbortError';
  userAbort.isUserAbort = true;
  assert.equal(isTransientError(userAbort), false, 'User abort is non-transient');
});

test('boundedRead: succeeds immediately on attempt 0 without retrying', async () => {
  let calls = 0;
  const result = await boundedRead('movie:test:1', async () => {
    calls++;
    return { title: 'Fight Club' };
  });

  assert.equal(calls, 1, 'Only called once');
  assert.equal(result.title, 'Fight Club');
});

test('boundedRead: recovers after transient error using production delays', async () => {
  let calls = 0;
  const startTime = Date.now();
  const result = await boundedRead('movie:test:2', async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('503 Service Unavailable');
      err.status = 503;
      throw err;
    }
    return { title: 'The Matrix' };
  }, { _delays: [20, 40] }); // short delay for test execution

  const elapsed = Date.now() - startTime;
  assert.equal(calls, 2, 'Called twice');
  assert(elapsed >= 15, `Waited for first retry delay (elapsed: ${elapsed}ms)`);
  assert.equal(result.title, 'The Matrix');
});

test('boundedRead: recovers after 2 transient errors (exhausting retries before success)', async () => {
  let calls = 0;
  const result = await boundedRead('movie:test:3', async () => {
    calls++;
    if (calls <= 2) {
      const err = new Error('502 Bad Gateway');
      err.status = 502;
      throw err;
    }
    return { title: 'Inception' };
  }, { _delays: [15, 30] });

  assert.equal(calls, 3, 'Called 3 times');
  assert.equal(result.title, 'Inception');
});

test('boundedRead: exhausts after 2 retries (3 total attempts) and throws', async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await boundedRead('movie:test:4', async () => {
        calls++;
        const err = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      }, { _delays: [10, 20] });
    },
    (err) => err.status === 503,
  );

  assert.equal(calls, 3, 'Total 3 attempts (1 initial + 2 retries)');
});

test('boundedRead: fails immediately without retry on non-transient error (404)', async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await boundedRead('movie:test:5', async () => {
        calls++;
        const err = new Error('404 Not Found');
        err.status = 404;
        throw err;
      });
    },
    (err) => err.status === 404,
  );

  assert.equal(calls, 1, 'Zero retries on 404');
});

test('boundedRead: respects Retry-After delay when <= 5s', async () => {
  let calls = 0;
  const startTime = Date.now();
  await boundedRead('movie:test:6', async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('429 Rate Limit');
      err.status = 429;
      err.retryAfter = '0.05'; // 50ms
      throw err;
    }
    return { title: 'Pulp Fiction' };
  }, { _delays: [10, 20] });

  const elapsed = Date.now() - startTime;
  assert.equal(calls, 2);
  assert(elapsed >= 35, `Respected bounded Retry-After (elapsed: ${elapsed}ms)`);
});

test('boundedRead: fails immediately when Retry-After > 5s', async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await boundedRead('movie:test:7', async () => {
        calls++;
        const err = new Error('429 Rate Limit');
        err.status = 429;
        err.retryAfter = '15'; // 15 seconds
        throw err;
      });
    },
    (err) => err.status === 429,
  );

  assert.equal(calls, 1, 'Zero retries when Retry-After exceeds 5s');
});

test('boundedRead [Spec 2]: request timeout is retried as transient', async () => {
  let attempts = 0;
  const result = await boundedRead('movie:test:timeout', async (signal) => {
    attempts++;
    if (attempts === 1) {
      // Simulate slow read that exceeds 25ms timeout
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (signal.aborted) {
        throw signal.reason || new Error('Request timed out.');
      }
    }
    return { title: 'Recovered After Timeout' };
  }, { _timeoutMs: 25, _delays: [15, 30] });

  assert.equal(attempts, 2, 'Timeout on attempt 1 was retried on attempt 2');
  assert.equal(result.title, 'Recovered After Timeout');
});

test('boundedRead: coalesces concurrent reads for identical key', async () => {
  let calls = 0;
  const readTask = () =>
    boundedRead('movie:shared:200', async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { id: 200, title: 'Coalesced Title' };
    });

  const [res1, res2, res3] = await Promise.all([readTask(), readTask(), readTask()]);

  assert.equal(calls, 1, 'Only one fetch executed for concurrent identical reads');
  assert.equal(res1.title, 'Coalesced Title');
  assert.equal(res2.title, 'Coalesced Title');
  assert.equal(res3.title, 'Coalesced Title');
});

test('boundedRead [Spec 1]: cancelled read does NOT strand or reject replacement caller', async () => {
  let calls = 0;
  const controller1 = new AbortController();
  const controller2 = new AbortController();

  // Caller 1 starts a read
  const p1 = boundedRead('movie:shared:cancellation', async (signal) => {
    calls++;
    // Simulate async in-flight fetch
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 80);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason);
      }, { once: true });
    });
    return { title: 'Safe Coalescing Title' };
  }, { signal: controller1.signal });

  // Caller 2 joins the in-flight read
  const p2 = boundedRead('movie:shared:cancellation', async () => {
    calls++;
    return { title: 'Should Not Run Separately' };
  }, { signal: controller2.signal });

  // Caller 1 aborts (e.g. StrictMode unmount cleanup)
  setTimeout(() => controller1.abort(), 20);

  // Caller 1 must reject with user abort
  await assert.rejects(
    async () => await p1,
    (err) => err.name === 'AbortError' && err.isUserAbort === true,
  );

  // Caller 2 MUST NOT be stranded or rejected!
  const res2 = await p2;
  assert.equal(res2.title, 'Safe Coalescing Title', 'Caller 2 resolved successfully despite Caller 1 aborting');
  assert.equal(calls, 1, 'Underlying request continued for Caller 2 without running duplicate');
});

test('boundedRead [Spec 1]: StrictMode cleanup followed by setup starts fresh request', async () => {
  let calls = 0;
  const controller1 = new AbortController();

  // Caller 1 starts then immediately unmounts
  const p1 = boundedRead('movie:strict:mode', async (signal) => {
    calls++;
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 100);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason);
      }, { once: true });
    });
    return { title: 'Mount 1' };
  }, { signal: controller1.signal });

  // Component unmounts
  controller1.abort();
  await assert.rejects(async () => await p1);

  // Component remounts (setup)
  const controller2 = new AbortController();
  const res2 = await boundedRead('movie:strict:mode', async () => {
    calls++;
    return { title: 'Remount Success' };
  }, { signal: controller2.signal });

  assert.equal(res2.title, 'Remount Success');
  assert.equal(calls, 2, 'Fresh request started on remount rather than reusing dead cancelled promise');
});

test('boundedRead [Spec 1]: account isolation prevents cross-account coalescing', async () => {
  let calls = 0;
  const pA = boundedRead('explore:movies:popular', async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 40));
    return { account: 'A' };
  }, { userScope: 'user-token-A' });

  const pB = boundedRead('explore:movies:popular', async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 40));
    return { account: 'B' };
  }, { userScope: 'user-token-B' });

  const [resA, resB] = await Promise.all([pA, pB]);
  assert.equal(calls, 2, 'Separate requests executed for different accounts despite same actionKey');
  assert.equal(resA.account, 'A');
  assert.equal(resB.account, 'B');
});

test('boundedRead [Spec 3]: cancelled request cleanup does NOT delete replacement entry', async () => {
  let calls = 0;
  const controllerA = new AbortController();

  // 1. Caller A starts
  const pA = boundedRead('movie:ownership:key', async (signal) => {
    calls++;
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 80);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason);
      }, { once: true });
    });
    return { title: 'A' };
  }, { signal: controllerA.signal });

  // 2. Caller A aborts
  controllerA.abort();
  await assert.rejects(async () => await pA);

  // 3. Replacement Caller B starts immediately
  const controllerB = new AbortController();
  const pB = boundedRead('movie:ownership:key', async (signal) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { title: 'B' };
  }, { signal: controllerB.signal });

  // 4. Caller C starts while B is in flight
  const pC = boundedRead('movie:ownership:key', async () => {
    calls++;
    return { title: 'C' };
  });

  const [resB, resC] = await Promise.all([pB, pC]);
  assert.equal(calls, 2, 'Calls should be 2: 1 for A, 1 for B (C coalesced onto B)');
  assert.equal(resB.title, 'B');
  assert.equal(resC.title, 'B', 'Caller C coalesced onto replacement B because A did not delete Bs entry');
});

