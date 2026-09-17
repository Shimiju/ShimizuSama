import Parser from 'rss-parser';
import { ShimizuClient } from '../../bot/client.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { TextChannel } from 'discord.js';

const parser = new Parser();

export class SocialFeedService {
  private static client: ShimizuClient;
  private static intervalId: NodeJS.Timeout | null = null;
  
  public static init(client: ShimizuClient) {
    this.client = client;
    this.startPolling();
    logger.info('SocialFeedService initialized');
  }

  private static startPolling() {
    if (this.intervalId) clearInterval(this.intervalId);
    
    // Poll every 1 minute for near-instant detection
    this.intervalId = setInterval(() => {
      this.checkFeeds().catch(err => logger.error({ err }, 'Error checking social feeds'));
    }, 60 * 1000);

    // Initial check on boot
    setTimeout(() => {
      this.checkFeeds().catch(err => logger.error({ err }, 'Error checking social feeds on boot'));
    }, 10000);
  }

  private static async checkFeeds() {
    const feeds = await prisma.socialFeed.findMany({
      where: { platform: 'YOUTUBE' }
    });

    if (feeds.length === 0) return;

    logger.debug(`Checking ${feeds.length} YouTube feeds...`);

    for (const feed of feeds) {
      try {
        const isUC = feed.handle.startsWith('UC');
        const handleStr = feed.handle.startsWith('@') ? feed.handle : `@${feed.handle}`;
        const liveUrl = isUC 
          ? `https://www.youtube.com/channel/${feed.handle}/live`
          : `https://www.youtube.com/${handleStr}/live`;

        let ucId = feed.handle;

        // Check RSS for normal uploads AND live streams
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ucId}`;
        const parsed = await parser.parseURL(feedUrl);
        
        if (parsed.items && parsed.items.length > 0) {
          const latestVideo = parsed.items[0];
          const videoId = latestVideo.id; // Looks like: yt:video:v1deo1D
          const rawVideoId = videoId.replace('yt:video:', '');
          
          if (!feed.lastPostId) {
            // First time seeing this feed! Just save the ID, do NOT post.
            await prisma.socialFeed.update({
              where: { id: feed.id },
              data: { lastPostId: videoId }
            });
            logger.info({ handle: feed.handle }, 'Initialized new social feed silently.');
          } else if (videoId !== feed.lastPostId) {
            // New video found! Check if it's a LIVE stream.
            let isLive = false;
            try {
              const videoRes = await fetch(`https://www.youtube.com/watch?v=${rawVideoId}`);
              const videoHtml = await videoRes.text();
              // YouTube HTML contains "isLive":true for active live streams
              isLive = videoHtml.includes('\\"isLive\\":true') || videoHtml.includes('isLiveBroadcast" content="True"');
            } catch (err) {
              logger.error('Failed to verify live status');
            }

            if (!isLive) {
              logger.info({ handle: feed.handle, videoId }, 'Skipping normal video upload (user only wants live streams).');
              await prisma.socialFeed.update({
                where: { id: feed.id },
                data: { lastPostId: videoId }
              });
              continue;
            }

            logger.info({ guildId: feed.guildId, handle: feed.handle }, 'New YouTube LIVE stream detected!');
            
            const guild = this.client.guilds.cache.get(feed.guildId);
            if (!guild) continue;
            
            const channel = guild.channels.cache.get(feed.channelId) as TextChannel;
            if (!channel) continue;

            const creatorName = parsed.title || feed.handle;
            const videoLink = latestVideo.link || `https://youtube.com/watch?v=${rawVideoId}`;
            
            let message = feed.message
              .replace(/{creator}/g, creatorName)
              .replace(/{link}/g, videoLink)
              .replace(/{title}/g, latestVideo.title || 'New Live Stream');

            await channel.send({ content: message });

            // Update database with new post ID
            await prisma.socialFeed.update({
              where: { id: feed.id },
              data: { lastPostId: videoId }
            });
          }
        }
      } catch (error) {
        logger.error({ error, feedId: feed.id }, 'Failed to check YouTube feed');
      }
    }
  }
}
