import { ShimizuClient } from '../../bot/client.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { TextChannel } from 'discord.js';
import { checkNativeLiveStream } from '../music/YouTubeStreamProxy.js';

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
    
    // Poll every 15 seconds for true instant detection
    this.intervalId = setInterval(() => {
      this.checkFeeds().catch(err => logger.error({ err }, 'Error checking social feeds'));
    }, 15 * 1000);

    // Initial check on boot instantly
    this.checkFeeds().catch(err => logger.error({ err }, 'Error checking social feeds on boot'));
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

        // Check for Active Live Stream using the ultra-fast native scraper
        try {
          const liveStream = await checkNativeLiveStream(feed.handle);
          if (liveStream) {
            const liveVideoId = liveStream.videoId;
            
            if (!feed.lastPostId) {
              await prisma.socialFeed.update({
                where: { id: feed.id },
                data: { lastPostId: liveVideoId }
              });
              logger.info({ handle: feed.handle }, 'Initialized new social feed silently with live stream.');
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
                }
              }
            }
          }
        } catch (scrapeErr) {
          logger.error({ scrapeErr, feedId: feed.id }, 'Failed to check live stream');
        }
      } catch (error) {
        logger.error({ error, feedId: feed.id }, 'Failed to check YouTube feed');
      }
    }
  }
}
