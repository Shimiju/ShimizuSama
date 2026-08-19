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

const YTDLP = env.YTDLP_PATH || path.join(PROJECT_ROOT, 'lavalink', 'yt-dlp', 'yt-dlp');
const NODE_RT = env.YTDLP_NODE_PATH || path.join(PROJECT_ROOT, 'lavalink', 'node', 'bin', 'node');
const COOKIES = env.YTDLP_COOKIES_PATH || path.join(PROJECT_ROOT, 'lavalink', 'yt-dlp', 'cookies.txt');

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
    '--js-runtimes', `node:${NODE_RT}`,
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
        upstream.on('error', () => {});
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