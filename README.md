# Shimizu Assistant — Bot Discord All-in-One

Bot Discord serbaguna bernama **Shimizu-Sama** — satu paket lengkap untuk server Discord:

musik (via Lavalink), moderasi, ekonomi, leveling, giveaways, tiket dukungan, auto-moderation,
custom commands, role menu, welcome/goodbye, autorole, raid protection, server stats,
ditambah **dashboard web** untuk mengelola semuanya.

| | |
|---|---|
| Bahasa | TypeScript (Node.js 20+) |
| Discord | discord.js v14 |
| Database | PostgreSQL 16 (Prisma ORM + driver adapter `@prisma/adapter-pg`) |
| Musik | Lavalink 4 + Shoukaku + LavaSrc + yt-dlp + Audio Proxy lokal |
| Dashboard | Express 5 + React (Vite) di `dashboard-ui/` |
| Lisensi | ISC |

---

## Daftar Isi

- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Struktur Project](#struktur-project)
- [Prasyarat](#prasyarat)
- [Setup & Instalasi](#setup--instalasi)
  - [1. Database PostgreSQL (Docker)](#1-database-postgresql-docker)
  - [2. Lavalink (Docker)](#2-lavalink-docker)
  - [3. Konfigurasi Environment](#3-konfigurasi-environment)
  - [4. Install & Build](#4-install--build)
  - [5. Deploy Slash Commands](#5-deploy-slash-commands)
  - [6. Menjalankan Bot](#6-menjalankan-bot)
  - [7. Dashboard Web](#7-dashboard-web)
- [Penggunaan](#penggunaan)
  - [Slash Commands](#slash-commands)
  - [Prefix Commands](#prefix-commands)
  - [Perintah Musik](#perintah-musik)
- [Pengembangan](#pengembangan)
  - [Skrip NPM](#skrip-npm)
  - [Migrasi Database](#migrasi-database)
- [Pemecahan Masalah](#pemecahan-masalah)
- [Keamanan](#keamanan)

---

## Fitur

- 🎵 **Musik** — putar lagu dari YouTube (via yt-dlp) / SoundCloud, queue, loop, shuffle,
  volume, seek, now playing. Bot masuk voice channel tempat pengguna berada.
- 🛡️ **Moderasi** — ban, kick, softban, timeout, warn + riwayat warning, clear/purge pesan,
  slowmode, lock/unlock channel, ubah nickname.
- 💰 **Ekonomi** — saldo, transfer antar pengguna, daily reward, work, shop + inventory,
  leaderboard, rank & leveling (XP per pesan), achievements.
- 🎁 **Giveaway** — mulai, akhiri, reroll, batalkan; pemenang otomatis + tersimpan di DB.
- 🎫 **Tiket** — panel tiket + kategori, setup, transcript HTML aman (XSS-safe).
- 🤖 **Auto-Mod** — bad word, caps lock berlebihan, spam, link, deteksi lain + action
  configurable (alert/kick/ban), raid protection.
- 👋 **Welcome/Goodbye** — pesan sambutan/perpisahan dengan variabel.
- 🎭 **Role Menu & Autorole** — panel role reaksi, role otomatis untuk member baru.
- ⚙️ **Custom Commands** — command kustom per server + prefix sendiri (default `s!`).
- 📊 **Server Stats** — statistik member/bot di channel (memperbarui otomatis).
- 🖥️ **Dashboard Web** — kelola pengaturan server dari browser dengan login Discord (OAuth2)
  — hanya member dengan izin *Manage Server* yang bisa mengubah pengaturan guild.
- 🌿 **Sangat lokal** — server Anda, data Anda: semua data di Postgres sendiri, musik via
  Lavalink sendiri.

---

## Arsitektur

```
┌─────────────────────┐     ┌──────────────────────┐
│  Discord (Gateway)  │ ◄──►│  Bot (Node/tsx)      │
└─────────────────────┘     │  discord.js + Shoukaku│
                            └───┬──────┬───────┬────┘
                                │      │       │
                    ┌───────────┘      │       └──────────────┐
                    ▼                  ▼                      ▼
           ┌──────────────┐   ┌──────────────┐        ┌────────────┐
           │  PostgreSQL  │   │  Lavalink 4  │        │  Dashboard │
           │  (Docker)    │   │  + LavaSrc   │        │  Express   │
           │  Prisma ORM  │   └──────┬───────┘        │  :3000     │
           └──────────────┘          │                └────────────┘
                                     │ http://host.docker.internal:4001
                                     ▼
                          ┌──────────────────────┐
                          │  Audio Proxy (node)  │  src/services/music/YouTubeStreamProxy.ts
                          │  :4001 (0.0.0.0)    │
                          └──────────┬───────────┘
                                     │ yt-dlp + cookies + node
                                     ▼
                    YouTube (googlevideo CDN) / SoundCloud

  Dashboard UI (React/Vite) di port 5173 → API Dashboard di port 3000
```

- Bot membaca konfigurasi dari environment (`src/config/env.ts`, divalidasi zod).
- Database diakses eksklusif lewat Prisma (`src/database/prisma.ts`).
- Musik: Shoukaku mengelola koneksi voice + node Lavalink. Resolusi lagu YouTube ditangani
  **yt-dlp** (lebih tahan terhadap perubahan YouTube), lalu audio dialirkan lewat **Audio Proxy
  lokal** ke Lavalink (source `http`) — ini menghindari bug HTTP client lavaplayer pada
  CDN googlevideo (403/400).

---

## Struktur Project

```
Shimizu-Source/
├── src/
│   ├── index.ts                 # Entry point (env → bot → login → dashboard)
│   ├── bot/
│   │   ├── client.ts            # Discord client + Shoukaku (Lavalink)
│   │   ├── commandRouter.ts     # Memuat semua command dari src/commands
│   │   └── eventLoader.ts       # Memuat semua event dari src/events
│   ├── commands/                # Slash commands per kategori
│   │   ├── config.ts            # welcome, goodbye, autorole, raid
│   │   ├── config/              # automod, economyconfig
│   │   ├── moderation/          # ban, kick, warn, timeout, dsb.
│   │   ├── economy/             # balance, pay, shop, daily, dsb.
│   │   ├── music.ts             # /music (14 subcommand)
│   │   ├── tickets/             # ticket, ticketpanel, ticketsetup
│   │   ├── giveaway.ts, rolepanel.ts, customcommand.ts
│   │   └── utility/ping.ts, test/lavalinktest.ts
│   ├── events/                  # ready, messageCreate, interactionCreate, dll.
│   ├── services/                # Logika bisnis (music, economy, automod, ticket, dll.)
│   │   └── music/               # MusicService, GuildMusicPlayer, QueueManager,
│   │                             # YouTubeStreamProxy (audio proxy yt-dlp → Lavalink)
│   ├── dashboard/server.ts      # REST API + OAuth Discord + middleware auth
│   ├── config/env.ts            # Skema zod untuk semua env
│   ├── database/prisma.ts       # Singleton PrismaClient (driver adapter PG)
│   ├── types/ & utils/
├── dashboard-ui/                # Frontend web (React + Vite + Tailwind)
│   └── src/pages/               # Home, ServerSelect, ServerDashboard, modules/*
├── prisma/
│   ├── schema.prisma            # 29 model (Guild, Economy, Ticket, Giveaway, dll.)
│   └── migrations/              # Migration SQL (sudah termasuk riwayat)
├── lavalink/
│   ├── application.yml          # Konfigurasi Lavalink 4 (password, source, plugin)
│   ├── plugins/                 # LavaSrc plugin jar
│   ├── yt-dlp/                  # Binary yt-dlp + cookies.txt (RAHASIA, tidak di-commit)
│   └── node/                    # Node.js runtime untuk tantangan JS YouTube (tidak di-commit)
├── scripts/deploy-commands.ts   # Deploy slash commands ke guild
├── tests/                       # Unit tests (Vitest)
├── docker-compose.yml           # postgres + lavalink sekaligus
├── .env.example                 # Template env (salin ke .env lalu isi)
└── package.json
```

---

## Prasyarat

- **Node.js 20+** (direkomendasikan 22 LTS) dan npm
- **Docker + Docker Compose** (untuk PostgreSQL dan Lavalink) — atau instal langsung
  PostgreSQL 16 dan Java 21 untuk Lavalink
- **Bot Discord**: buat aplikasi di [Discord Developer Portal](https://discord.com/developers/applications)
  - aktifkan intent: `GUILDS`, `GUILD_MEMBERS`, `GUILD_MESSAGES`, `MESSAGE_CONTENT`, `GUILD_VOICE_STATES`
  - catat **Token**, **Client ID**, dan **Client Secret**
  - tambahkan bot ke server Anda dengan izin: `Manage Server`, `Manage Messages`,
    `Manage Roles`, `Kick/Ban`, `Manage Channels`, `View Channel`, `Send Messages`,
    `Connect` + `Speak` (voice), `Manage Nicknames`
- Akses internet (untuk install package pertama kali dan download plugin/yt-dlp)

> **Terakhir diuji pada:** Arch Linux — Node 22, Postgres 16 (Docker), Lavalink 4.2.2,
> Lavalink versi terbaru 4.x, yt-dlp 2026.07.04.

---

## Setup & Instalasi

### 1. Database PostgreSQL (Docker)

`docker-compose.yml` sudah menyediakan service `postgres` dengan volume persisten.

```bash
# jalankan Postgres + Lavalink sekaligus (lihat langkah 2)
docker compose up -d

# atau hanya Postgres:
docker compose up -d postgres

# cek kesehatan
docker ps --filter name=shimizu-pg
```

Kredensial default yang dipakai compose:

| Variabel | Nilai |
|---|---|
| User | `postgres` |
| Password | `postgres` |
| Database | `shimizu` |
| Port | `5432` |

### 2. Lavalink (Docker)

Lavalink berjalan di container yang sama (`shimizu-lavalink`, port `2333`).

- Konfigurasi: `lavalink/application.yml` — ubah `password` di sana, lalu samakan
  dengan `LAVALINK_PASSWORD` di `.env`.
- Sudah terpasang plugin **LavaSrc 4.8.3** (di `lavalink/plugins/`) + **yt-dlp**
  (di `lavalink/yt-dlp/yt-dlp`, di-mount ke `/opt/yt-dlp`) + **Node.js** runtime
  (di `lavalink/node/`, di-mount ke `/opt/node`).
- **Cookies Google** (wajib untuk menembus blokir CDN YouTube):
  1. Pasang ekstensi browser *"Get cookies.txt LOCALLY"*.
  2. Buka `youtube.com` yang sudah login akun Google, export cookies.
  3. Timpa isi `lavalink/yt-dlp/cookies.txt` dengannya.
  File ini **rahasia** — tidak pernah di-commit/di-zip dan jangan dibagikan.

```bash
docker compose up -d lavalink
# verifikasi: harus muncul "Lavalink is ready to accept connections"
docker logs shimizu-lavalink

# uji REST API Lavalink (ganti dengan password Anda)
curl -s http://localhost:2333/v4/info -H "Authorization: <LAVALINK_PASSWORD>" | jq .plugins
# → ["lavasrc-plugin"]
```

### 3. Konfigurasi Environment

```bash
cp .env.example .env
```

Isi nilai-nilai berikut di `.env`:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Token bot dari Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ | Client ID aplikasi Discord |
| `DISCORD_CLIENT_SECRET` | ✅ | Client Secret (untuk OAuth dashboard) |
| `BOT_OWNER_ID` | ✅ | ID pengguna Anda (akses penuh dashboard) |
| `DISCORD_GUILD_ID` | untuk deploy | ID server tempat slash commands di-deploy |
| `DATABASE_URL` | ✅ | `postgres://postgres:postgres@localhost:5432/shimizu` |
| `JWT_SECRET` | ✅ | String acak **min. 32 karakter** (mis. `openssl rand -hex 48`) |
| `DASHBOARD_URL` | opsional | URL frontend dashboard (default `http://localhost:5173`) |
| `DISCORD_CALLBACK_URL` | opsional | Callback OAuth (default `http://localhost:3000/api/auth/callback`) |
| `BIND_HOST` | opsional | Alamat bind server dashboard (default `127.0.0.1`) |
| `DASHBOARD_PORT` | opsional | Port dashboard (default `3000`) |
| `LAVALINK_HOST` / `PORT` / `PASSWORD` / `SECURE` | ✅ | Samakan password dengan `lavalink/application.yml` |
| `AUDIO_PROXY_PORT` | opsional | Port audio proxy (default `4001`) |
| `AUDIO_PROXY_LAVALINK_URL` | opsional | URL proxy dari sudut pandang Lavalink (default `http://host.docker.internal:4001`; jika Lavalink jalan langsung di host, ubah ke `http://127.0.0.1:4001`) |
| `YTDLP_PATH` / `YTDLP_NODE_PATH` / `YTDLP_COOKIES_PATH` | opsional | Path kustom ke binary yt-dlp / node / cookies (default: relatif folder project `lavalink/...`) |
| `NODE_ENV` | opsional | `development` / `production` |


### 4. Install & Build

```bash
npm install          # postinstall otomatis menjalankan `prisma generate`
npm run build        # kompilasi TypeScript ke dist/
npm test             # 35 unit test
npm run lint         # 0 error
```

### 5. Deploy Slash Commands

```bash
# pastikan DISCORD_GUILD_ID terisi di .env
npm run deploy:commands
# → ✅ Successfully reloaded N application (/) commands
```

> Deploy bersifat per-guild. Untuk server lain, ubah `DISCORD_GUILD_ID` lalu jalankan ulang.

### 6. Menjalankan Bot

```bash
# produksi (dari hasil build):
npm start

# development (auto-reload saat file berubah):
npm run dev
```

Bot akan:

1. memvalidasi env (gagal cepat bila `JWT_SECRET`/token tidak valid),
2. login ke Discord sebagai bot,
3. terhubung ke Lavalink (`Shoukaku Node Ready`),
4. membuka audio proxy di `0.0.0.0:4001` (jembatan yt-dlp → Lavalink),
5. membuka dashboard API di `127.0.0.1:3000`.

### 7. Dashboard Web

```bash
cd dashboard-ui
npm install
npm run dev          # UI di http://localhost:5173
```

Buka `http://localhost:5173` → klik **Login with Discord** → pilih server Anda →
kelola pengaturan (welcome, autorole, economy, custom commands, moderation, tickets, role menu).

> API dashboard dibind ke `127.0.0.1:3000` secara default dan hanya menerima koneksi
> dari UI. Hanya pemilik bot (BOT_OWNER_ID) dan member dengan izin *Manage Server*
> yang dapat mengubah pengaturan guild (middleware `requireGuildAccess`).

---

## Penggunaan

### Slash Commands

Semua fitur utama tersedia sebagai slash commands (39 command):

**Musik** — `/music`
`play` · `pause` · `resume` · `skip` · `stop` · `disconnect` · `queue` · `nowplaying` ·
`volume` · `seek` · `shuffle` · `loop` (off/track/queue) · `remove` · `clear`

**Moderasi** — `/ban` `/kick` `/softban` `/timeout` `/untimeout` `/warn` `/warnings`
`/remove-warning` `/clear` `/purge` `/slowmode` `/lock` `/unlock` `/nickname` `/serverstats`

**Ekonomi & Leveling** — `/balance` `/pay` `/daily` `/work` `/shop` `/buy` `/inventory`
`/leaderboard` `/rank` `/profile` `/achievements`

**Konfigurasi** — `/config` (grup `welcome`, `goodbye`, `autorole`, `raid`), `/config-automod`,
`/economyconfig` (leveling, shop, reward, level-up channel/message)

**Lainnya** — `/giveaway` (start/end/reroll/cancel) · `/ticket` · `/ticketpanel` ·
`/ticketsetup` · `/rolepanel` · `/customcommand` · `/ping` · `/lavalinktest`

### Prefix Commands

Prefix default: **`s!`** (bisa diubah lewat dashboard → pengaturan guild).

Alias musik yang bisa dipakai tanpa slash:

```
s!play <judul/URL>   s!pause      s!resume     s!skip      s!stop
s!queue              s!nowplaying s!shuffle    s!clear     s!loop <off|track|queue>
s!volume <1-150>     s!seek <dtk> s!remove <posisi>         s!disconnect
```

Contoh: `s!play all my life yao`

Selain alias musik, pesan yang tidak diawali prefix diproses untuk:
auto-mod, leveling XP, dan custom command kustom server.

### Perintah Musik

1. Masuk ke **voice channel** di server.
2. Gunakan `/music play <judul atau URL>` (atau `s!play ...`).
3. Kontrol pemutaran dengan subcommand musik di atas.

> **Prioritas sumber (per 2026-08):** pencarian teks dicoba ke **YouTube** dulu
> (lewat yt-dlp + cookies + audio proxy lokal), lalu fallback ke **SoundCloud**.
> URL YouTube langsung juga didukung. Jika sebuah track gagal diputar (mis. CDN YouTube
> memblokir IP tanpa cookies valid), bot akan mengirim pesan ⚠️ di channel alih-alih diam.

---

## Pengembangan

### Skrip NPM

| Skrip | Fungsi |
|---|---|
| `npm run dev` | Jalankan bot dengan auto-reload (tsx watch) |
| `npm run build` | Kompilasi TypeScript (`tsc`) |
| `npm start` | Jalankan hasil build (`node dist/index.js`) |
| `npm test` | Jalankan unit test (Vitest) |
| `npm run lint` | ESLint (0 error) |
| `npm run format` | Prettier |
| `npm run deploy:commands` | Deploy slash commands ke `DISCORD_GUILD_ID` |

### Migrasi Database

```bash
# jalankan semua migration yang belum diterapkan:
npx prisma migrate deploy

# buat migration baru setelah mengubah prisma/schema.prisma:
npx prisma migrate dev --name <nama_migration>

# generate client setelah mengubah schema (atau otomatis via postinstall):
npx prisma generate
```

---

## Pemecahan Masalah

| Gejala | Penyebab & Solusi |
|---|---|
| `YouTube 403 / 400 / track gagal diputar` | Sejak 2026, YouTube memblokir akses CDN (googlevideo) untuk klien tanpa autentikasi: pastikan `lavalink/yt-dlp/cookies.txt` berisi cookies akun Google yang valid (lihat cara di Setup bagian 2), lalu restart Lavalink. Jalur streaming sudah lewat audio proxy lokal (`:4001`) yang menangani redirect dan range request dengan benar. |
| `Lavalink is not ready` / `Shoukaku Node Error` | Pastikan container `shimizu-lavalink` up (`docker ps`) dan password di `lavalink/application.yml` sama dengan `LAVALINK_PASSWORD` di `.env`. |
| `PrismaClientInitializationError` | Postgres belum jalan / `DATABASE_URL` salah. Jalankan `docker compose up -d postgres` lalu `npx prisma migrate deploy`. |
| `JWT_SECRET` error saat start | `.env` belum punya `JWT_SECRET` ≥ 32 karakter — bot sengaja gagal cepat demi keamanan. |
| Slash commands tidak muncul | Jalankan `npm run deploy:commands`; pastikan `DISCORD_GUILD_ID` benar dan bot sudah di server itu. Butuh izin `applications.commands`. |
| Docker Docker Desktop tanpa sudo | Pakai socket user: `export DOCKER_HOST=unix://$HOME/.docker/desktop/docker.sock` atau pastikan group `docker` Anda aktif. |
| `s!play` tidak merespons | Cek prefix guild via dashboard; default `s!`. |
| Port 3000 sudah terpakai | Ubah `DASHBOARD_PORT` di `.env`. |

---

## Keamanan

- **`.env` tidak pernah dikomit atau masuk ke arsip zip** — hanya `.env.example`.
- **`lavalink/yt-dlp/cookies.txt` juga rahasia (session token akun Google)** — sudah
  dikecualikan dari git dan zip. Jangan pernah dibagikan.
- `JWT_SECRET` wajib diisi dari env (tanpa nilai default) — bot menolak start bila tidak valid.
- Dashboard bind ke `127.0.0.1` secara default; cookie auth memakai `secure` di produksi.
- Semua endpoint `/api/guilds/:id/*` dilindungi middleware yang mewajibkan login Discord +
  keanggotaan guild + izin *Manage Server*.
- Audio proxy hanya melayani request dari host lokal dan container Lavalink (terikat
  `0.0.0.0:4001`) — jangan expose ke internet.
- Transcript tiket di-escape untuk mencegah XSS.
- `npm audit`: sisa 3 temuan *high* berasal dari `deepmerge-ts` (transitif Prisma) —
  solusinya menurunkan Prisma ke v6 (breaking change), sengaja ditunda.

---

Selamat bersantai di manor. 🥀