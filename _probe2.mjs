import { createApp } from './api/index.js';
function fakeDb() {
  const rows = new Map();
  const sql = (strings, ...values) => {
    const q = strings.join('?');
    if (q.includes('INSERT INTO pastes')) {
      const [id, content, expiresAt, maxViews] = values;
      if (rows.has(id)) { const e = new Error('d'); e.code = '23505'; throw e; }
      const row = { id, content, expires_at: expiresAt, max_views: maxViews, views: 0 };
      rows.set(id, row); return Promise.resolve([row]);
    }
    if (q.includes('WITH upd AS')) {
      const row = rows.get(values[0]);
      if (!row) return Promise.resolve([]);
      row.views += 1; return Promise.resolve([{ ...row }]);
    }
    if (q.includes('SELECT content, views') || q.includes('SELECT expires_at, max_views'))
      return Promise.resolve(rows.get(values[0]) ? [{ ...rows.get(values[0]) }] : []);
    return Promise.resolve([]);
  };
  return sql;
}
const app = createApp(fakeDb());
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  // malformed JSON
  let r = await fetch(base + '/api/pastes', { method:'POST', headers:{'content-type':'application/json'}, body:'{bad' });
  console.log('MALFORMED JSON status:', r.status, 'ct:', r.headers.get('content-type'), 'body:', (await r.text()).slice(0,80));
  // content-type text/plain JSON string
  r = await fetch(base + '/api/pastes', { method:'POST', headers:{'content-type':'text/plain'}, body: JSON.stringify({content:'x'}) });
  console.log('TEXT PLAIN status:', r.status);
  // maxViews boolean / ttl float
  r = await fetch(base + '/api/pastes', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({content:'x', maxViews:true}) });
  console.log('maxViews bool status:', r.status);
  server.close();
});
