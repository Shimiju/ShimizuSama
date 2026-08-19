import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  BOT_OWNER_ID: z.string().optional(),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET is required and must be at least 32 characters'),
  DASHBOARD_URL: z.string().url().default('http://localhost:5173'),
  DISCORD_CALLBACK_URL: z
    .string()
    .url()
    .default('http://localhost:3000/api/auth/callback'),
  BIND_HOST: z.string().default('127.0.0.1'),
  DASHBOARD_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LAVALINK_HOST: z.string().min(1).optional(),
  LAVALINK_PORT: z.string().optional(),
  LAVALINK_PASSWORD: z.string().optional(),
  LAVALINK_SECURE: z.string().optional(),
  // Audio proxy: jembatan yt-dlp -> Lavalink (karena lavaplayer tidak bisa
  // streaming googlevideo langsung).
  AUDIO_PROXY_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  AUDIO_PROXY_LAVALINK_URL: z.string().default('http://host.docker.internal:4001'),
  YTDLP_PATH: z.string().optional(),
  YTDLP_NODE_PATH: z.string().optional(),
  YTDLP_COOKIES_PATH: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
