import Parser from 'rss-parser';
import { ShimizuClient } from '../../bot/client.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { TextChannel } from 'discord.js';
import { checkLiveStream } from '../music/YouTubeStreamProxy.js';

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

        let streamAnnounced = false;
        let ucId = feed.handle;

        // 1. Check for Active Live Stream using yt-dlp
        try {
          const liveStream = await checkLiveStream(feed.handle);
          if (liveStream) {
            const liveVideoId = liveStream.videoId;
            
            if (!feed.lastPostId) {
              await prisma.socialFeed.update({
                where: { id: feed.id },
                data: { lastPostId: liveVideoId }
              });
              logger.info({ handle: feed.handle }, 'Initialized new social feed silently with live stream.');
              streamAnnounced = true;
            } else if (liveVideoId !== feed.lastPostId) {
              logger.info({ guildId: feed.guildId, handle: feed.handle }, 'New YouTube live stream detected!');
              
              const guild = this.client.guilds.cache.get(feed.guildId);
              if (guild) {
                const channel = guild.channels.cache.get(feed.channelId) as TextChannel;
                if (channel) {
                  let creatorName = feed.handle;
                  try {
                    const channelRes = await fetch(`https://www.youtube.com/channel/${ucId}`);
                    const channelHtml = await channelRes.text();
                    const channelTitleMatch = channelHtml.match(/<title>(.*?) - YouTube<\/title>/);
                    if (channelTitleMatch) creatorName = channelTitleMatch[1];
                  } catch (e) {}
                  
                  const videoTitle = liveStream.title || '🔴 LIVE NOW';
                  const videoLink = `https://www.youtube.com/watch?v=${liveVideoId}`;
                  
                  let message = feed.message
                    .replace(/{creator}/g, creatorName)
                    .replace(/{link}/g, videoLink)
                    .replace(/{title}/g, videoTitle);

                  await channel.send({ content: message });
                  
                  await prisma.socialFeed.update({
                    where: { id: feed.id },
                    data: { lastPostId: liveVideoId }
                  });
                  streamAnnounced = true;
                }
              }
            } else {
              streamAnnounced = true; // We already announced this live stream
            }
          }
        } catch (scrapeErr) {
          logger.error({ scrapeErr, feedId: feed.id }, 'Failed to check live stream, falling back to RSS');
        }

        // 2. If no live stream or already announced, check RSS for normal uploads
        if (!streamAnnounced) {
          const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ucId}`;
          const parsed = await parser.parseURL(feedUrl);
        
        if (parsed.items && parsed.items.length > 0) {
          const latestVideo = parsed.items[0];
          const videoId = latestVideo.id; // Looks like: yt:video:v1deo1D
          
          if (!feed.lastPostId) {
            // First time seeing this feed! Just save the ID, do NOT post.
            await prisma.socialFeed.update({
              where: { id: feed.id },
              data: { lastPostId: videoId }
            });
            logger.info({ handle: feed.handle }, 'Initialized new social feed silently.');
          } else if (videoId !== feed.lastPostId) {
            // New video found!
            logger.info({ guildId: feed.guildId, handle: feed.handle }, 'New YouTube video detected!');
            
            const guild = this.client.guilds.cache.get(feed.guildId);
            if (!guild) continue;
            
            const channel = guild.channels.cache.get(feed.channelId) as TextChannel;
            if (!channel) continue;

            const creatorName = parsed.title || feed.handle;
            const videoLink = latestVideo.link || `https://youtube.com/watch?v=${videoId.replace('yt:video:', '')}`;
            
            let message = feed.message
              .replace(/{creator}/g, creatorName)
              .replace(/{link}/g, videoLink)
              .replace(/{title}/g, latestVideo.title || 'New Video');

            await channel.send({ content: message });

            // Update database with new post ID
            await prisma.socialFeed.update({
              where: { id: feed.id },
              data: { lastPostId: videoId }
            });
          }
        }
        }
      } catch (error) {
        logger.error({ error, feedId: feed.id }, 'Failed to check YouTube feed');
      }
    }
  }
}
