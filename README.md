# Pastebin Lite

Small paste-sharing app: submit text, get a shareable link, view the text at that link. A paste can optionally expire after a time or after a number of views. Built for the Aganitha take-home exercise.

## Tech stack

Node.js + Express REST API, Neon Postgres (serverless HTTP driver), deployed on Vercel free (Hobby) tier. No frontend framework: the shareable link returns a minimal server-rendered HTML page.

## API

| Method | Path | Body / result |
|---|---|---|
| `POST` | `/api/pastes` | `{ "content": "...", "ttlSeconds"?: 60, "maxViews"?: 5 }` → `201` with `{ id, url, expiresAt, maxViews, remainingViews }` |
| `GET` | `/api/pastes/:id` | `200` `{ content, remainingViews, expiresAt }`; `404` missing; `410` expired or view cap reached |
| `GET` | `/:id` | Shareable HTML page with the paste text; same status rules as the API |
| `GET` | `/api/health` | `200` `{ ok: true }` |

Limits: content ≤ 64 KB, `ttlSeconds` 1–86400, `maxViews` 1–1000, id is 7 URL-safe characters. Invalid input returns `400` with a JSON `{ error }`. Expired or exhausted pastes return `410 Gone` (a specific "existed, now gone" status; `404` is also defensible if you prefer to hide existence).

## Local setup

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL from Neon
npm run db:init              # creates the pastes table
npm test                     # 5 tests, no database needed (in-memory fake)
npm start                    # http://localhost:3000
```

## Deploy

Create a Neon Postgres database, run `npm run db:init` against it once, then import the repo into Vercel. Set `DATABASE_URL` as a Vercel environment variable. Vercel routes all requests to `api/index.js` through `@vercel/node`.

## Design decisions

- **Atomic view counting.** The read that increments `views` is one `UPDATE ... RETURNING` inside a CTE. A read-then-write pair would let two concurrent viewers both pass the cap. One statement avoids the race.
- **Absolute expiry.** Creation stores `expires_at = now() + ttl`. Reads compare against one timestamp, so there is no client clock dependency and the column can be indexed.
- **Serverless driver.** `@neondatabase/serverless` uses Neon's HTTP interface per invocation. A traditional connection pool does not survive across serverless invocations and would exhaust the free tier.
- **Both routes.** Tests may open the pretty link (`/abc1234`) or call the JSON endpoint. Supporting both is cheap and covers either style.
- **Safe rendering.** Pasted text is HTML-escaped before being placed in the page, so stored markup cannot inject script.
- **Capability link.** Random unguessable ids are the access token. No accounts or auth: the exercise tests create/read/expire only.
- **Lazy cleanup.** Expired rows are not deleted on a schedule; reads simply refuse them. Good enough at lab scale, and it avoids a cron job.

## Files

- `api/index.js` — Express app and both read paths; also the Vercel handler.
- `server.js` — local HTTP listener.
- `scripts/init-db.js` — one-time table creation.
- `tests/app.test.js` — unit tests with an in-memory DB fake.
- `vercel.json` — serverless routing.
