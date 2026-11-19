export const HOME_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pastebin Lite</title>
<style>body{font:16px/1.6 system-ui;max-width:760px;margin:0 auto;padding:2rem 1.2rem;color:#e7e9f2;background:#11131b}
h1{font-size:1.8rem;margin-bottom:.2rem}.sub{color:#9aa2bd;margin-top:0}
label{display:block;margin-top:1rem;font-weight:600;font-size:.9rem}
textarea,input{width:100%;box-sizing:border-box;background:#1d2130;color:#e7e9f2;border:1px solid #343b50;border-radius:8px;padding:10px;font:inherit}
textarea{min-height:180px}button{margin-top:1rem;background:#2f8fa3;color:#06151a;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer}
.row{display:flex;gap:1rem}.row>div{flex:1}
#result{margin-top:1.5rem;padding:1rem;border:1px solid #2c3244;border-radius:8px;display:none;background:#171a24}
a{color:#7fdff0;word-break:break-all}.links{margin-top:2rem;font-size:.9rem}</style>
</head><body>
<h1>Pastebin Lite</h1>
<p class="sub">Store text and get a shareable link. Optional expiry by time or view count.</p>
<form id="form">
  <label for="content">Text to share</label>
  <textarea id="content" maxlength="65536" required placeholder="Paste your text here"></textarea>
  <div class="row">
    <div><label for="ttl">Expires after (seconds, optional)</label><input id="ttl" type="number" min="1" max="86400" placeholder="e.g. 3600"></div>
    <div><label for="views">Max views (optional)</label><input id="views" type="number" min="1" max="1000" placeholder="e.g. 5"></div>
  </div>
  <button type="submit">Create shareable link</button>
</form>
<div id="result"></div>
<div class="links"><a href="/approach">Implementation notes</a> &middot; <a href="/demo">Video walkthrough</a></div>
<script>
document.getElementById('form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var body = { content: document.getElementById('content').value };
  var ttl = document.getElementById('ttl').value;
  var views = document.getElementById('views').value;
  if (ttl) body.ttlSeconds = Number(ttl);
  if (views) body.maxViews = Number(views);
  var out = document.getElementById('result');
  try {
    var res = await fetch('/api/pastes', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!res.ok) { out.innerHTML = '<strong>Error:</strong> ' + String(data.error || res.status); out.style.display = 'block'; return; }
    var full = new URL(data.url, location.href).href;
    out.textContent = '';
    var label = document.createElement('strong');
    label.textContent = 'Shareable link:';
    var link = document.createElement('a');
    link.href = full; link.textContent = full;
    out.appendChild(label); out.appendChild(document.createElement('br')); out.appendChild(link);
    out.style.display = 'block';
  } catch (err) {
    out.textContent = 'Could not create the paste: ' + err;
    out.style.display = 'block';
  }
});
</script>
</body></html>`;
