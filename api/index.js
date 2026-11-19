import express from 'express';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 7;
const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const MAX_VIEWS = 1000;

function newId() {
  const bytes = crypto.randomBytes(ID_LENGTH);
  let id = '';
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return id;
}

function validId(id) {
  return /^[A-Za-z0-9]{6,8}$/.test(id) && id.toLowerCase() !== 'api';
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function createApp(sql) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/pastes', async (req, res) => {
    const { content, ttlSeconds, maxViews } = req.body || {};
    if (typeof content !== 'string' || content.length === 0) {
      return res.status(400).json({ error: 'content_required' });
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      return res.status(413).json({ error: 'content_too_large', maxBytes: MAX_CONTENT_BYTES });
    }
    let ttl = null;
    if (ttlSeconds !== undefined && ttlSeconds !== null) {
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
        return res.status(400).json({ error: 'invalid_ttlSeconds' });
      }
      ttl = ttlSeconds;
    }
    let views = null;
    if (maxViews !== undefined && maxViews !== null) {
      if (!Number.isInteger(maxViews) || maxViews <= 0 || maxViews > MAX_VIEWS) {
        return res.status(400).json({ error: 'invalid_maxViews' });
      }
      views = maxViews;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const id = newId();
      try {
        const rows = await sql`
          INSERT INTO pastes (id, content, expires_at, max_views)
          VALUES (${id}, ${content},
                  ${ttl === null ? null : sql`now() + (${ttl} || ' seconds')::interval`},
                  ${views})
          RETURNING id, expires_at, max_views, views
        `;
        const row = rows[0];
        const origin = `${req.protocol}://${req.get('host')}`;
        return res.status(201).json({
          id: row.id,
          url: `${origin}/${row.id}`,
          expiresAt: row.expires_at,
          maxViews: row.max_views,
          remainingViews: row.max_views === null ? null : row.max_views - row.views,
        });
      } catch (error) {
        if (String(error?.code || '').includes('23505')) continue; // id collision, retry
        console.error('create failed', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    }
    return res.status(500).json({ error: 'id_generation_failed' });
  });

  async function readPaste(id, increment) {
    if (!validId(id)) return { kind: 'invalid' };
    if (!increment) {
      const rows = await sql`SELECT content, views, max_views, expires_at FROM pastes WHERE id = ${id}`;
      const row = rows[0];
      if (!row) return { kind: 'missing' };
      if (row.expires_at && new Date(row.expires_at) <= new Date()) return { kind: 'expired' };
      if (row.max_views !== null && row.views >= row.max_views) return { kind: 'expired' };
      return { kind: 'ok', row };
    }
    // Single atomic statement: increments views only if still valid, then returns the row.
    const rows = await sql`
      WITH upd AS (
        UPDATE pastes SET views = views + 1
        WHERE id = ${id}
          AND (expires_at IS NULL OR expires_at > now())
          AND (max_views IS NULL OR views < max_views)
        RETURNING content, views, max_views, expires_at
      )
      SELECT * FROM upd
    `;
    const row = rows[0];
    if (row) return { kind: 'ok', row };
    const existing = await sql`SELECT expires_at, max_views, views FROM pastes WHERE id = ${id}`;
    if (!existing[0]) return { kind: 'missing' };
    return { kind: 'expired' };
  }

  app.get('/api/pastes/:id', async (req, res) => {
    try {
      const result = await readPaste(req.params.id, true);
      if (result.kind === 'invalid' || result.kind === 'missing') {
        return res.status(404).json({ error: 'not_found' });
      }
      if (result.kind === 'expired') {
        return res.status(410).json({ error: 'expired' });
      }
      const { row } = result;
      return res.json({
        content: row.content,
        remainingViews: row.max_views === null ? null : row.max_views - row.views,
        expiresAt: row.expires_at,
      });
    } catch (error) {
      console.error('read failed', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // Pretty shareable link: safe rendered HTML, no script execution.
  app.get('/:id', async (req, res) => {
    let result;
    try {
      result = await readPaste(req.params.id, true);
    } catch (error) {
      console.error('read failed', error);
      return res.status(500).type('html').send('<h1>Server error</h1>');
    }
    if (result.kind === 'invalid' || result.kind === 'missing') {
      return res.status(404).type('html').send('<h1>404 - Paste not found</h1>');
    }
    if (result.kind === 'expired') {
      return res.status(410).type('html').send('<h1>This paste has expired</h1>');
    }
    const content = escapeHtml(result.row.content);
    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Paste ${escapeHtml(req.params.id)}</title>
<style>body{font:16px/1.6 system-ui;margin:2rem auto;max-width:760px;color:#222}
pre{white-space:pre-wrap;word-break:break-word;background:#f5f5f7;padding:16px;border-radius:8px}</style>
</head><body><h1>Paste ${escapeHtml(req.params.id)}</h1><pre>${content}</pre></body></html>`);
  });

  return app;
}

let cachedApp;
export default function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    res.statusCode = 500;
    return res.end('DATABASE_URL not configured');
  }
  if (!cachedApp) cachedApp = createApp(neon(process.env.DATABASE_URL));
  return cachedApp(req, res);
}
