const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');

function postWithHost(origin, host, requestOrigin, authorization) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/auth/login', origin);
    const body = authorization ? '{"displayName":"Phone"}' : '{}';
    const request = http.request(url, {
      method: 'POST',
      headers: {
        Host: host,
        Origin: requestOrigin,
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
    }, async (response) => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('LAN frontend forwards authenticated API requests to the loopback backend', async () => {
  const { createServer } = await import('vite');
  const upstream = http.createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      res.end(JSON.stringify({
        path: req.url,
        authorization: req.headers.authorization,
        origin: req.headers.origin ?? null,
        body: Buffer.concat(body).toString(),
      }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'API route not found' }));
    }
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const previousTarget = process.env.MN_LAN_API_TARGET;
  process.env.MN_LAN_API_TARGET = `http://127.0.0.1:${upstreamPort}`;
  let vite;

  try {
    vite = await createServer({
      root: path.resolve(__dirname, '../..'),
      configFile: path.resolve(__dirname, '../../vite.config.ts'),
      mode: 'lan',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'silent',
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;

    const response = await postWithHost(origin, '192.168.1.23:8443', 'http://192.168.1.23:8443', 'Bearer test-token');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      path: '/api/auth/login',
      authorization: 'Bearer test-token',
      origin: null,
      body: '{"displayName":"Phone"}',
    });

    const foreign = await postWithHost(origin, '192.168.1.23:8443', 'http://foreign.example');
    assert.equal(foreign.status, 200);
    assert.equal(foreign.body.origin, 'http://foreign.example');

    const missing = await fetch(`${origin}/api/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'API route not found' });

    for (const route of ['/settings', '/explore/movies/popular?sort=rating']) {
      const deepLink = await fetch(`${origin}${route}`);
      assert.equal(deepLink.status, 200, route);
      assert.match(await deepLink.text(), /<div id="root"><\/div>/, route);
    }
  } finally {
    if (vite) await vite.close();
    await new Promise((resolve) => upstream.close(resolve));
    if (previousTarget === undefined) delete process.env.MN_LAN_API_TARGET;
    else process.env.MN_LAN_API_TARGET = previousTarget;
  }
});
