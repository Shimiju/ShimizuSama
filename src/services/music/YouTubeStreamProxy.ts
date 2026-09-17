import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project root = src/services/music/../../..  -> Shimizu-Source
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const isWin = process.platform === 'win32';

let YTDLP = env.YTDLP_PATH || path.join(PROJECT_ROOT, 'lavalink', 'yt-dlp', isWin ? 'yt-dlp.exe' : 'yt-dlp');
if (!isWin && YTDLP.endsWith('.exe')) YTDLP = YTDLP.replace('.exe', '');

import fs from 'node:fs';
if (!isWin) {
  try { fs.chmodSync(YTDLP, 0o755); } catch (e) { }
}

const NODE_RT = env.YTDLP_NODE_PATH || path.join(PROJECT_ROOT, 'lavalink', 'node', 'bin', 'node');
const finalNodeRt = fs.existsSync(NODE_RT) ? NODE_RT : 'node';

const COOKIES = env.YTDLP_COOKIES_PATH || path.join(PROJECT_ROOT, 'lavalink', 'yt-dlp', 'cookies.txt');

// Automatically write cookies from env var if provided (useful for Railway)
if (env.YTDLP_COOKIES) {
  try {
    const cookieDir = path.dirname(COOKIES);
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }
    fs.writeFileSync(COOKIES, env.YTDLP_COOKIES.replace(/\\n/g, '\n'), 'utf8');
  } catch (e) {
    logger.error({ err: e }, 'Failed to write YTDLP_COOKIES to file');
  }
}

const FORMAT = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/18/best[ext=mp4]/best';

export interface DirectStreamInfo {
  url: string;
  title: string;
  length: number;
  ext: string;
}

/**
 * Menjalankan yt-dlp untuk mendapatkan URL stream langsung (sudah ter-tanda tangan)
 * dari video YouTube. Cookies + Node runtime dipakai untuk menembus tantangan JS
 * dan blokir CDN (403/400) yang dialami lavaplayer bawaan.
 */
export async function resolveDirectStream(videoUrl: string): Promise<DirectStreamInfo> {
  const args = [
    '-q',
    '--no-warnings',
    '-f', FORMAT,
    '--cookies', COOKIES,
    '--js-runtimes', `node:${finalNodeRt}`,
    '-J',
    videoUrl,
  ];

  const { stdout } = await execFileAsync(YTDLP, args, {
    timeout: 45_000,
    maxBuffer: 32 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);

  if (!parsed.url) {
    throw new Error(`yt-dlp tidak mengembalikan URL untuk ${videoUrl}`);
  }

  return {
    url: parsed.url as string,
    title: parsed.title as string,
    length: (parsed.duration as number) * 1000 || 0,
    ext: (parsed.ext as string) || 'mp4',
  };
}

/**
 * Proxy kecil yang meneruskan byte audio dari googlevideo ke Lavalink.
 * Lavalink (di container) memanggil http://host.docker.internal:PORT/proxy?u=<direct-url>
 * dengan header Range; proxy ini meneruskannya ke URL asli sambil mengikuti redirect.
 */
function startProxy(port: number): http.Server {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://localhost');

    if (reqUrl.pathname === '/resolve') {
      const target = reqUrl.searchParams.get('url') || '';
      if (!target) {
        res.writeHead(400);
        res.end('missing url');
        return;
      }

      resolveDirectStream(target)
        .then((info) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(info));
        })
        .catch((err: Error) => {
          logger.error({ err: err.message, target }, 'AudioProxy resolve gagal');
          res.writeHead(502);
          res.end(JSON.stringify({ error: err.message }));
        });
      return;
    }

    if (reqUrl.pathname === '/proxy') {
      const target = reqUrl.searchParams.get('u') || '';
      if (!target) {
        res.writeHead(400);
        res.end('missing u');
        return;
      }

      // Teruskan header Range (dan header lain yang relevan) ke URL asli.
      const headers: Record<string, string> = {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      };
      if (req.headers.range) headers.range = req.headers.range as string;
      if (req.headers.connection) headers.connection = req.headers.connection as string;

      forwardWithRedirects(target, headers, 0, res);
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`Audio proxy listening on 0.0.0.0:${port}`);
  });

  return server;
}

function forwardWithRedirects(
  target: string,
  headers: Record<string, string>,
  redirects: number,
  res: http.ServerResponse
): void {
  if (redirects > 6) {
    res.writeHead(502);
    res.end('too many redirects');
    return;
  }

  const lib = target.startsWith('https:') ? https : http;

  const req = lib.get(
    target,
    { headers, agent: false },
    (upstream) => {
      const status = upstream.statusCode || 0;

      if (status >= 300 && status < 400 && upstream.headers.location) {
        // Tunggu body redirect habis dulu (agar socket bersih) sebelum follow.
        upstream.resume();
        upstream.on('error', () => { });
        upstream.on('end', () => {
          const nextUrl = new URL(upstream.headers.location!, target).toString();
          forwardWithRedirects(nextUrl, headers, redirects + 1, res);
        });
        return;
      }

      const outHeaders: Record<string, string> = {
        'content-type': upstream.headers['content-type'] || 'application/octet-stream',
      };
      // Hanya set header yang nilainya ada (node melempar TypeError untuk undefined).
      const passthrough = [
        'content-length',
        'accept-ranges',
        'content-range',
        'last-modified',
        'etag',
      ] as const;
      for (const h of passthrough) {
        const v = upstream.headers[h];
        if (v !== undefined) outHeaders[h] = Array.isArray(v) ? v.join(', ') : v;
      }

      res.writeHead(status, outHeaders);
      upstream.pipe(res);

      upstream.on('error', (err) => {
        logger.error({ err: err.message, target }, 'AudioProxy upstream error');
        res.destroy();
      });
    }
  );

  req.on('error', (err) => {
    logger.error({ err: err.message, target }, 'AudioProxy request error');
    if (!res.headersSent) {
      res.writeHead(502);
    }
    res.end();
  });
}

export function startAudioProxy(): http.Server {
  const port = env.AUDIO_PROXY_PORT || 4001;
  return startProxy(Number(port));
}

export const audioProxy = {
  resolveDirectStream,
  start: startAudioProxy,
};

export interface LiveStreamInfo {
  videoId: string;
  title: string;
}

// --- Cookie header cache ---------------------------------------------
// Re-reading + re-parsing cookies.txt on every single poll (per feed,
// every 15s) is pure wasted disk I/O since cookies rarely change.
// Cache the built header and only refresh it periodically.
let cachedCookieHeader = '';
let cookieCacheLoadedAt = 0;
const COOKIE_CACHE_TTL_MS = 5 * 60 * 1000; // refresh at most every 5 minutes

async function getCookieHeader(): Promise<string> {
  const now = Date.now();
  if (cachedCookieHeader && now - cookieCacheLoadedAt < COOKIE_CACHE_TTL_MS) {
    return cachedCookieHeader;
  }

  try {
    const cookieStr = await fs.promises.readFile(COOKIES, 'utf8');
    cachedCookieHeader = cookieStr
      .split('\n')
      .filter((l) => !l.startsWith('#') && l.trim().length > 0)
      .map((l) => {
        const parts = l.split('\t');
        if (parts.length >= 7) return `${parts[5].trim()}=${parts[6].trim()}`;
        return '';
      })
      .filter(Boolean)
      .join('; ')
      .replace(/[\r\n\t]/g, '');
    cookieCacheLoadedAt = now;
  } catch (e) {
    logger.warn('Could not read yt-dlp cookies for native scraper');
    // don't update cookieCacheLoadedAt on failure, so we retry sooner
  }

  return cachedCookieHeader;
}

/**
 * Checks if a YouTube channel is currently live using yt-dlp.
 * Bypasses bot detection by using the same cookies and proxies as the music system.
 */
export async function checkLiveStream(handle: string): Promise<LiveStreamInfo | null> {
  const url = handle.startsWith('UC')
    ? `https://www.youtube.com/channel/${handle}/streams?t=${Date.now()}`
    : `https://www.youtube.com/${handle.startsWith('@') ? handle : '@' + handle}/streams?t=${Date.now()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // don't let one hung request stall the whole poll cycle

  try {
    const cookieHeader = await getCookieHeader();

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/var ytInitialData = (.*?);<\/script>/);
    if (!match) return null;

    // match[1] is ALREADY the raw JSON text — no need to JSON.parse() it
    // into an object and then JSON.stringify() it right back into a
    // string just to regex it. That round trip was the single biggest
    // cost in this function (multi-MB payloads on channels with lots of
    // videos), and it ran synchronously on Node's single event loop
    // thread, which can also stall Discord gateway heartbeats/other bot
    // activity while it churns.
    const rawJson = match[1];

    if (rawJson.includes('BADGE_STYLE_TYPE_LIVE_NOW')) {
      const liveVideoBlock = rawJson.match(
        /{"videoId":"([^"]+)","thumbnail":.*?BADGE_STYLE_TYPE_LIVE_NOW.*?title":{"runs":\[{"text":"(.*?)"}\]/,
      );
      if (liveVideoBlock) {
        return {
          videoId: liveVideoBlock[1],
          title: liveVideoBlock[2],
        };
      }
    }
    return null;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.warn({ handle }, 'Live stream check timed out after 10s');
    } else {
      logger.error({ err }, 'Native cookie live stream check failed');
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}