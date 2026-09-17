# Shimizu-Sama V2 (shimizu-assistant)

All-in-one Discord bot (discord.js v14): music (Lavalink 4 + Shoukaku), moderation, economy,
leveling, giveaways, tickets, auto-mod, custom commands — plus an Express REST dashboard
(`src/dashboard/server.ts`) with a React/Vite frontend in `dashboard-ui/`. PostgreSQL via
Prisma 7 (driver adapter `@prisma/adapter-pg`). TypeScript compiled with `tsc`, run with
`tsx` in dev. Full setup docs in README.md (Indonesian).

## Commands

Root project (bot):

- `npm run dev` — bot with auto-reload (tsx watch); needs `.env`, Postgres, Lavalink running
- `npm run build` — `tsc`, outputs to `dist/` (rootDir `src`)
- `npm start` — runs `dist/index.js`
- `npx vitest run` — unit tests (`tests/*.test.ts`, no DB/Discord needed)
- `npm run lint` — ESLint flat config (`eslint.config.js`)
- `npm run format` — Prettier (single quotes, 100 cols, es5 trailing commas)
- `npm run deploy:commands` — registers slash commands to guild in `DISCORD_GUILD_ID`
- `docker compose up -d` — starts Postgres 16 (`shimizu-pg`, :5432) + Lavalink (:2333)
- Prisma: `npx prisma migrate deploy` / `npx prisma migrate dev --name <name>` / `npx prisma generate`

Dashboard UI (separate npm project in `dashboard-ui/`, own package.json):

- `cd dashboard-ui && npm run dev` — Vite on :5173
- `cd dashboard-ui && npm run build && npm run lint` — tsc -b + vite build; oxlint

Current baseline (verified): `tsc --noEmit` passes; tests are 34 passing / 1 failing
(`tests/automod.test.ts` LinkDetector invites_only case — pre-existing); `npm run lint`
reports ~67 errors / ~147 warnings across the repo (pre-existing, README's "0 errors" is
stale). Compare new output against this baseline instead of expecting zero.

## Architecture & conventions

- Layout: `src/bot/` (client, commandRouter auto-loads `src/commands/**`, eventLoader
  auto-loads `src/events/*`), `src/services/` (all business logic), `src/commands/` +
  `src/events/` stay thin and delegate to services.
- Commands export `const command: Command = { data, execute }` from `src/types/index.ts`;
  events export `Event<K>`. New command files are picked up automatically by the router;
  still run `npm run deploy:commands` to register them with Discord.
- ESM everywhere (`"type": "module"`, NodeNext resolution): relative imports MUST end in
  `.js` even inside `.ts` files (`import { env } from '../config/env.js'`).
- Config access goes through `env` from `src/config/env.ts` (zod-validated at import);
  DB only through the `prisma` singleton in `src/database/prisma.ts`.
- Embeds use `ManorTheme.colors.*` / `ManorTheme.emojis.*` from `src/utils/theme.ts`;
  user-facing copy leans into the "manor" persona. Moderation flows reply ephemeral,
  `deferReply` before slow work, try/catch with a themed error follow-up.
- Code comments and README are mixed English/Indonesian.

## Environment & pitfalls

- Required env (zod fails fast, process exits): `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DATABASE_URL`, `JWT_SECRET` (min 32 chars). Template in
  `.env.example`. Never commit `.env`.
- Tests do NOT need `.env`: `vitest.config.ts` injects fake env vars. Keep new required
  env vars out of module top-levels that tests import, or add fakes there too.
- Music stack needs local binaries NOT in git (gitignored, re-download per README):
  `lavalink/yt-dlp/yt-dlp`, `lavalink/node/`, and secret `lavalink/yt-dlp/cookies.txt`
  (Google session cookies — YouTube blocks cookieless CDNs with 403/400 since 2026).
  Paths overridable via `YTDLP_PATH` / `YTDLP_NODE_PATH` / `YTDLP_COOKIES_PATH`.
- Audio proxy listens on :4001 and must be reachable from the Lavalink container:
  default `AUDIO_PROXY_LAVALINK_URL=http://host.docker.internal:4001`; use
  `http://127.0.0.1:4001` when Lavalink runs on the host.
- Ports in use: dashboard API :3000 (`DASHBOARD_PORT`), Vite :5173, Lavalink :2333,
  Postgres :5432, audio proxy :4001.
- `LAVALINK_PASSWORD` in `.env` must match `password` in `lavalink/application.yml`.
- Do not hand-edit `dist/` (build artifact) or `prisma/migrations/` SQL by hand — change
  `prisma/schema.prisma` and create a migration.
- Root-level `check-db.ts`, `test-image.ts`, `test-regex.js`, `test-track.ts` are ad-hoc
  scratch scripts, not part of the test suite.
