import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../api/index.js';

// In-memory fake with the subset of tagged-template behaviour the app uses.
function fakeDb() {
  const rows = new Map();
  const sql = (strings, ...values) => {
    const q = strings.join('?');
    if (q.includes('INSERT INTO pastes')) {
      const [id, content, expiresAt, maxViews] = values;
      if (rows.has(id)) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
      const row = { id, content, expires_at: expiresAt, max_views: maxViews, views: 0 };
      rows.set(id, row);
      return Promise.resolve([row]);
    }
    if (q.includes('WITH upd AS')) {
      const id = values[0];
      const row = rows.get(id);
      if (!row || (row.expires_at && new Date(row.expires_at) <= new Date()) ||
          (row.max_views !== null && row.views >= row.max_views)) return Promise.resolve([]);
      row.views += 1;
      return Promise.resolve([{ ...row }]);
    }
    if (q.includes('UPDATE pastes SET expires_at')) {
      const row = rows.get(values[0]);
      if (row) row.expires_at = new Date(Date.now() - 3600_000).toISOString();
      return Promise.resolve([]);
    }
    if (q.includes('SELECT content, views')) {
      const row = rows.get(values[0]);
      return Promise.resolve(row ? [{ ...row }] : []);
    }
    if (q.includes('SELECT expires_at, max_views')) {
      const row = rows.get(values[0]);
      return Promise.resolve(row ? [{ ...row }] : []);
    }
    return Promise.resolve([]);
  };
  return { sql, rows };
}

function baseUrl(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      server.unref();
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

test('create paste returns link and read returns exact content', async () => {
  const { sql } = fakeDb();
  const base = await baseUrl(createApp(sql));
  const created = await fetch(base + '/api/pastes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'hello <script>alert(1)</script>' }),
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.match(body.id, /^[A-Za-z0-9]{7}$/);
  const read = await fetch(base + '/api/pastes/' + body.id);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).content, 'hello <script>alert(1)</script>');
  const page = await fetch(base + '/' + body.id);
  const html = await page.text();
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert'));
});

test('validation rejects bad input', async () => {
  const { sql } = fakeDb();
  const base = await baseUrl(createApp(sql));
  const empty = await fetch(base + '/api/pastes', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(empty.status, 400);
  const badTtl = await fetch(base + '/api/pastes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'x', ttlSeconds: -1 }),
  });
  assert.equal(badTtl.status, 400);
});

test('malformed JSON returns a JSON error', async () => {
  const { sql } = fakeDb();
  const base = await baseUrl(createApp(sql));
  const res = await fetch(base + '/api/pastes', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_json');
});

test('expiry by time returns 410 and stops content', async () => {
  const { sql } = fakeDb();
  const base = await baseUrl(createApp(sql));
  const created = await fetch(base + '/api/pastes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'timed', ttlSeconds: 1 }),
  });
  const { id } = await created.json();
  // Force expiry in the fake by rewriting expires_at into the past.
  const first = await fetch(base + '/api/pastes/' + id);
  assert.equal(first.status, 200);
  const db = sql;
  await db`UPDATE pastes SET expires_at = now() - interval '1 hour' WHERE id = ${id}`;
  const second = await fetch(base + '/api/pastes/' + id);
  assert.equal(second.status, 410);
});

test('expiry by view count returns 410 after cap', async () => {
  const { sql } = fakeDb();
  const base = await baseUrl(createApp(sql));
  const created = await fetch(base + '/api/pastes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'limited', maxViews: 2 }),
  });
  const { id } = await created.json();
  assert.equal((await fetch(base + '/api/pastes/' + id)).status, 200);
  assert.equal((await fetch(base + '/api/pastes/' + id)).status, 200);
  assert.equal((await fetch(base + '/api/pastes/' + id)).status, 410);
});

test('missing id returns 404', async () => {
  const { sql } = fakeDb();
  const base = await baseUrl(createApp(sql));
  assert.equal((await fetch(base + '/api/pastes/ZZZZZZZ')).status, 404);
  assert.equal((await fetch(base + '/not-an-id')).status, 404);
});
