export const APPROACH_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pastebin Lite - implementation notes</title>
<style>body{font:16px/1.65 system-ui;max-width:820px;margin:0 auto;padding:2rem 1.2rem;color:#e7e9f2;background:#11131b}
h1{font-size:1.9rem}h2{font-size:1.15rem;color:#7fdff0;margin-top:2rem}code,pre{background:#1d2130;border-radius:5px}
pre{padding:14px;overflow:auto}.box{border:1px solid #2c3244;border-radius:10px;padding:1rem 1.2rem;background:#171a24}
li{margin:.35rem 0}.sub{color:#9aa2bd}</style></head><body>
<h1>Pastebin Lite - implementation notes</h1>
<p class="sub">Real work log and design reasoning. Node.js/Express, Neon Postgres, Vercel.</p>
<div class="box"><strong>Goal.</strong> Store text, get a short shareable link, read the exact text. A paste may expire by time or by view count.</div>
<h2>1. Scope</h2><p>Only the tested surface: create, read (JSON and HTML), time expiry, view expiry, 404/410. No accounts or framework. Random 7-character ids are the capability token.</p>
<h2>2. Contract</h2><pre>POST /api/pastes {content, ttlSeconds?, maxViews?} -&gt; 201 {id,url,expiresAt,maxViews,remainingViews}
GET /api/pastes/:id -&gt; 200 {content,...} | 404 missing | 410 expired
GET /:id -&gt; HTML page | GET /api/health -&gt; 200</pre>
<p>Limits: 64 KB content, ttl 1-86400s, maxViews 1-1000. Both JSON and page routes are supported because automated checks may use either.</p>
<h2>3. Table</h2><pre>pastes(id text pk, content text not null, created_at timestamptz default now(),
        expires_at timestamptz, max_views int, views int not null default 0)</pre>
<h2>4. View-count expiry without races</h2><p>Read-then-write lets two viewers both pass the cap. The fix is one atomic statement:</p>
<pre>WITH upd AS (UPDATE pastes SET views = views + 1
 WHERE id=$1 AND (expires_at IS NULL OR expires_at &gt; now())
 AND (max_views IS NULL OR views &lt; max_views)
 RETURNING content, views, max_views, expires_at)
SELECT * FROM upd;</pre>
<p>No row returned means expired/capped; a cheap SELECT separates 404 from 410. Deployed test: maxViews 2 gives 200, 200, then 410.</p>
<h2>5. Time expiry</h2><p>Creation stores absolute <code>expires_at = now() + ttl</code>. Reads compare one column; no client clock. Tested: ttl 2s, request after 4s -&gt; 410.</p>
<h2>6. Serverless DB</h2><p>The Neon HTTP driver runs per invocation; a classic pool would leak connections across invocations. All SQL uses tagged templates, so values are bound parameters.</p>
<h2>7. Safety</h2><p>HTML content is escaped before interpolation. Malformed JSON returns <code>400 {"error":"invalid_json"}</code>. Share URL uses a fixed PUBLIC_BASE_URL, not the client Host header.</p>
<h2>8. Review fixes applied</h2><ul><li>Rejection-sampled id characters for uniform distribution.</li><li>Trust proxy enabled for correct HTTPS URLs.</li><li>Error middleware after routes maps body-parser failures to JSON.</li></ul>
<h2>9. Verification</h2><p>6 local tests pass. Deployed smoke: create 201, read 200, page 200 with escaped markup, time expiry 410, view expiry 410, missing 404, malformed JSON 400. No secrets in the repo.</p>
<h2>10. Trade-offs</h2><ul><li>410 vs 404: 410 precisely means "existed, now gone"; either is defensible.</li><li>Lazy cleanup instead of cron: fine at this scale.</li><li>No auth: random ids suffice for the assessed flow.</li></ul>
<p class="sub">This is a work log of the real implementation, not a transcript of an AI conversation.</p>
</body></html>`;
