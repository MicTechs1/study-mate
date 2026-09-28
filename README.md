# StudyMate

A voice-first study companion. The AI Orb is the main interface — talk, use Vision, or open notes and quizzes.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional: copy `.env.example` to `.env.local` and add `OPENAI_API_KEY` for hosted chat/vision. Without a key, StudyMate still runs with on-device replies and anonymous people/object detection.

Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to share API rate limits across deployed instances. If either value is missing or Upstash is temporarily unavailable, StudyMate falls back to per-process limits.

## Production

Use Node.js 22 or newer. Set `NEXT_PUBLIC_SITE_URL` to the production HTTPS origin before building, then run:

```bash
npm run build
npm run start
```

Place `next start` behind a TLS-terminating reverse proxy. The proxy should enforce a request body limit of 7 MB, set a timeout longer than the 20-second hosted-AI timeout, overwrite forwarding headers, and apply an additional rate limit. Set `PORT` through the process environment when the service does not use port 3000.

`GET /api/health` is a no-store liveness check. It does not contact OpenAI or Upstash, so optional hosted services do not make the process unready. Upstash failures intentionally fall back to local limits and should be monitored through the structured warning logs.

Every page response carries a per-request CSP nonce, which means the app server renders HTML on demand instead of serving a prerendered page. Do not cache HTML at a shared CDN or proxy without first stripping `Set-Cookie`-style state — the nonce is bound to a single response. Subresources (`/_next/static/*`) are unaffected and can still be cached aggressively.

Production responses disable the framework signature, add subresource integrity to framework scripts, and only emit strict transport security headers in production mode. Send `SIGTERM` or `SIGINT` and allow a short drain period during rolling restarts.

## Quality gates

```bash
npm run lint      # ESLint
npm run typecheck # TypeScript (tsc --noEmit)
npm run test      # Vitest unit tests
npm run test:e2e  # Playwright browser tests (builds and boots the app)
npm run check     # lint + typecheck + unit tests + production build
```

The browser tests need Chromium once per machine: `npx playwright install chromium`. They run against a real production build, so they catch problems that unit tests cannot see — CSP or hydration breakage, IndexedDB behaviour, the Settings export/import/erase flow, camera start and release, and the no-API-key fallback path.

## Privacy

- Microphone and camera start only after you tap Talk or Vision and grant permission.
- People are labeled Person 1, Person 2 — no facial recognition and no identity database.
- Camera frames are sent to a vision API only when you ask what StudyMate can see, and the request is rate-limited.
- Stop Camera ends the stream and drops the temporary frame.
- Files and settings stay on this device (IndexedDB + localStorage).
- Settings → Your data exports a JSON backup, imports one (merge keeps newer local progress, replace wipes first), and erases all local data after a confirmation.

Backups are plain JSON, so read one before trusting it with anything sensitive. Only import files StudyMate produced, or another file with the same `{ app: "studymate", version: 1 }` shape — anything else is rejected before it touches local storage.

## API

Both public routes validate input with zod, cap request size, rate-limit per client, and log failures:

- `POST /api/chat` — OpenAI chat completions (`gpt-4o-mini`), person guardrails enforced server-side.
- `POST /api/vision` — OpenAI vision over a single camera frame.

When `OPENAI_API_KEY` is missing, both return `{ text: null, fallback: true }` and the client falls back to on-device logic.