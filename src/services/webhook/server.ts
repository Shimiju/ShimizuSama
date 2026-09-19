import express, { Request, Response } from 'express';
import { XMLParser } from 'fast-xml-parser';
import { TextChannel, EmbedBuilder } from 'discord.js';
import { ShimizuClient } from '../../bot/client.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

const parser = new XMLParser();

export function startWebhookServer(client: ShimizuClient) {
  const app = express();
  
  // Parse XML body dari YouTube
  app.use(express.text({ 
    type: ['application/atom+xml', 'text/xml', 'application/xml', 'text/plain'] 
  }));

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Verifikasi webhook dari YouTube (GET)
  app.get('/youtube-webhook', (req: Request, res: Response) => {
    const challenge = req.query['hub.challenge'] as string;
    const mode = req.query['hub.mode'] as string;
    
    if (mode === 'subscribe' && challenge) {
      logger.info('✅ YouTube webhook verified successfully');
      res.status(200).send(challenge);
    } else if (mode === 'unsubscribe' && challenge) {
      logger.info('YouTube webhook unsubscribed');
      res.status(200).send(challenge);
    } else {
      res.status(400).send('Bad Request');
    }
  });

  // Terima notifikasi push dari YouTube (POST)
  app.post('/youtube-webhook', async (req: Request, res: Response) => {
    // Selalu return 200 dulu biar YouTube nggak retry berkali-kali
    res.status(200).send('OK');
    
    try {
      const xmlData = req.body;
      if (!xmlData || typeof xmlData !== 'string') {
        logger.debug('Empty webhook payload');
        return;
      }

      const parsed = parser.parse(xmlData);
      const entry = parsed.feed?.entry;
      
      if (!entry) {
        logger.debug('No entry in webhook payload');
        return;
      }

      // Handle single entry atau array
      const entries = Array.isArray(entry) ? entry : [entry];
      
      for (const item of entries) {
        await handleNotification(client, item);
      }
    } catch (err) {
      logger.error({ err }, 'Error processing YouTube webhook');
    }
  });

  // Start server
  const PORT = Number(process.env.WEBHOOK_PORT) || 3000;
  
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Webhook server listening on port ${PORT}`);
    
    // Auto-subscribe ke YouTube setelah server jalan
    setTimeout(() => {
      subscribeToYouTube().catch(err => {
        logger.error({ err }, 'Failed to auto-subscribe to YouTube');
      });
    }, 30000); // Delay 30 detik biar Railway ingress siap routing trafik eksternal
  });

  return app;
}

async function handleNotification(client: ShimizuClient, entry: any) {
  try {
    const videoId = entry['yt:videoId'];
    const channelId = entry['yt:channelId'];
    const title = entry.title;
    const published = entry.published;
    
    if (!videoId) return;
    
    logger.info({ videoId, title }, '📺 New YouTube activity detected');
    
    // Cek apakah ini live stream (bukan video biasa)
    const isLive = await checkIfLive(videoId);
    
    if (!isLive) {
      logger.debug({ videoId }, 'Not a live stream, skipping');
      return;
    }
    
    logger.info({ videoId, title }, '🔴 LIVE STREAM detected!');
    
    // Kirim announcement ke Discord
    await announceToDiscord(client, {
      videoId,
      title: title || '🔴 LIVE NOW',
      channelId,
      published
    });
    
  } catch (err) {
    logger.error({ err }, 'Error handling notification');
  }
}

async function checkIfLive(videoId: string): Promise<boolean> {
  try {
    // Method 1: Cek via oEmbed (ringan, no API key)
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    
    if (!oembedRes.ok) return false;
    
    // Method 2: Cek HTML untuk live indicator (lebih akurat)
    const videoRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!videoRes.ok) return false;
    
    const html = await videoRes.text();
    
    // Indicators yang menunjukkan live stream
    return (
      html.includes('isLiveBroadcast') ||
      html.includes('BADGE_STYLE_TYPE_LIVE_NOW') ||
      html.includes('"isLive":true') ||
      html.includes('itemprop="isLiveBroadcast"')
    );
  } catch (err) {
    logger.error({ err, videoId }, 'Failed to check live status');
    return false;
  }
}

async function announceToDiscord(
  client: ShimizuClient, 
  data: { videoId: string; title: string; channelId: string; published?: string }
) {
  try {
    // Ambil channel ID dari env atau database
    const announceChannelId = process.env.LIVE_ANNOUNCE_CHANNEL_ID;
    
    if (!announceChannelId) {
      logger.warn('LIVE_ANNOUNCE_CHANNEL_ID not set, skipping announcement');
      return;
    }
    
    const channel = await client.channels.fetch(announceChannelId) as TextChannel;
    
    if (!channel) {
      logger.error({ channelId: announceChannelId }, 'Announcement channel not found');
      return;
    }

    const videoUrl = `https://www.youtube.com/watch?v=${data.videoId}`;
    const thumbnailUrl = `https://i.ytimg.com/vi/${data.videoId}/maxresdefault.jpg`;
    
    const embed = new EmbedBuilder()
      .setTitle('🔴 LIVE NOW!')
      .setDescription(`**${data.title}**`)
      .setColor(0xff0000)
      .setURL(videoUrl)
      .setImage(thumbnailUrl)
      .setTimestamp()
      .addFields(
        { name: '🔗 Watch', value: `[Click here](${videoUrl})`, inline: true },
        { name: '📺 Channel', value: `[YouTube Channel](https://www.youtube.com/channel/${data.channelId})`, inline: true }
      )
      .setFooter({ text: 'YouTube Live Notification' });

    // Mention role kalau ada
    const liveRoleId = process.env.LIVE_ROLE_ID;
    const mention = liveRoleId ? `<@&${liveRoleId}>` : '@everyone';
    
    await channel.send({
      content: `${mention} 🔴 **WE ARE LIVE!**`,
      embeds: [embed]
    });
    
    logger.info({ videoId: data.videoId }, '✅ Live announcement sent to Discord');
    
  } catch (err) {
    logger.error({ err }, 'Failed to send Discord announcement');
  }
}

async function subscribeToYouTube() {
  const callbackUrl = getCallbackUrl();
  const channelId = process.env.YOUTUBE_CHANNEL_ID; // UCxxx format
  
  if (!channelId) {
    logger.warn('YOUTUBE_CHANNEL_ID not set, skipping auto-subscribe');
    return;
  }
  
  if (!callbackUrl) {
    logger.warn('Could not determine callback URL, skipping auto-subscribe');
    return;
  }

  try {
    const response = await fetch('https://pubsubhubbub.appspot.com/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'hub.callback': callbackUrl,
        'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`,
        'hub.verify': 'async',
        'hub.mode': 'subscribe',
        'hub.lease_seconds': '864000' // 10 hari
      })
    });
    
    if (response.ok || response.status === 202) {
      logger.info({ callbackUrl }, '✅ Subscribed to YouTube push notifications');
    } else {
      const text = await response.text();
      logger.error(`Failed to subscribe to YouTube: ${response.status} - ${text}`);
    }
  } catch (err) {
    logger.error({ err }, 'Error subscribing to YouTube');
  }
}

function getCallbackUrl(): string | null {
  // Prioritas 1: Railway public domain (auto-set oleh Railway)
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/youtube-webhook`;
  }
  
  // Prioritas 2: Manual set di env
  if (process.env.WEBHOOK_URL) {
    return process.env.WEBHOOK_URL;
  }
  
  // Prioritas 3: Custom domain
  if (process.env.PUBLIC_URL) {
    return `${process.env.PUBLIC_URL}/youtube-webhook`;
  }
  
  return null;
}

// Export untuk dipanggil manual kalau perlu re-subscribe
export async function resubscribeWebhook() {
  await subscribeToYouTube();
}