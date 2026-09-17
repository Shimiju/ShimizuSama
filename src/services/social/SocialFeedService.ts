import { ShimizuClient } from '../../bot/client.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { TextChannel } from 'discord.js';
import { checkLiveStream } from '../music/YouTubeStreamProxy.js';
import Parser from 'rss-parser';

const parser = new Parser();

export class SocialFeedService {
  private static client: ShimizuClient;
  private static intervalId: NodeJS.Timeout | null = null;
  // Guards against overlapping runs: if a cycle takes longer than the
  // 15s interval (e.g. many feeds, a slow network blip), the previous
  // run's for-loop used to still be working through feeds while a new
  // setInterval tick fired on top of it — racing writes to the same
  // feed's lastPostId and generally backing everything up. This flag
  // makes a still-running cycle skip the next tick instead of stacking.
  private static isChecking = false;

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
    if (this.isChecking) {
      logger.debug('Skipping tick — previous social feed check still in progress');
      return;
    }
    this.isChecking = true;

    try {
      const feeds = await prisma.socialFeed.findMany({
        where: { platform: 'YOUTUBE' }
      });

      if (feeds.length === 0) return;

      logger.debug(`Checking ${feeds.length} YouTube feeds...`);

      // Feeds are independent (different guilds/channels), so check them
      // concurrently instead of one at a time. Sequentially, N feeds each
      // taking 1-2s (scrape + RSS fallback) could easily outrun the 15s
      // poll interval on its own. allSettled keeps one feed's failure from
      // blocking the others.
      const results = await Promise.allSettled(feeds.map((feed) => this.checkFeed(feed)));
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          logger.error({ error: result.reason, feedId: feeds[i].id }, 'Failed to check YouTube feed');
        }
      });
    } finally {
      this.isChecking = false;
    }
  }

  private static async checkFeed(feed: Awaited<ReturnType<typeof prisma.socialFeed.findMany>>[number]) {
    const ucId = feed.handle;
    let streamAnnounced = false;

    // 1. Check for Active Live Stream using the Ultimate Native Cookie Scraper
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
                const channelRes = await fetchWithTimeout(`https://www.youtube.com/channel/${ucId}`);
                const channelHtml = await channelRes.text();
                const channelTitleMatch = channelHtml.match(/<title>(.*?) - YouTube<\/title>/);
                if (channelTitleMatch) creatorName = channelTitleMatch[1];
              } catch (e) { }

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
          // We already announced this live stream
          streamAnnounced = true;
        }
      }
    } catch (scrapeErr) {
      logger.error({ scrapeErr, feedId: feed.id }, 'Failed to check live stream, falling back to RSS');
    }

    // 2. If no live stream or already announced, check RSS for normal uploads
    if (streamAnnounced) return;

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ucId}`;
    const parsed = await parser.parseURL(feedUrl);

    if (!parsed.items || parsed.items.length === 0) return;

    const latestVideo = parsed.items[0];
    const videoId = latestVideo.id; // Looks like: yt:video:v1deo1D
    const rawVideoId = videoId.replace('yt:video:', '');

    if (!feed.lastPostId) {
      await prisma.socialFeed.update({
        where: { id: feed.id },
        data: { lastPostId: videoId }
      });
      logger.info({ handle: feed.handle }, 'Initialized new social feed silently.');
      return;
    }

    if (videoId === feed.lastPostId) return;

    // New video found! Check if it's a LIVE stream.
    let isLive = false;
    try {
      const videoRes = await fetchWithTimeout(`https://www.youtube.com/watch?v=${rawVideoId}`);
      const videoHtml = await videoRes.text();
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
      return;
    }

    logger.info({ guildId: feed.guildId, handle: feed.handle }, 'New YouTube LIVE stream detected!');

    const guild = this.client.guilds.cache.get(feed.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(feed.channelId) as TextChannel;
    if (!channel) return;

    const creatorName = parsed.title || feed.handle;
    const videoLink = latestVideo.link || `https://youtube.com/watch?v=${rawVideoId}`;

    let message = feed.message
      .replace(/{creator}/g, creatorName)
      .replace(/{link}/g, videoLink)
      .replace(/{title}/g, latestVideo.title || 'New Live Stream');

    await channel.send({ content: message });

    await prisma.socialFeed.update({
      where: { id: feed.id },
      data: { lastPostId: videoId }
    });
  }
}

/** fetch() with a hard timeout so one hung request can't stall a whole poll cycle. */
async function fetchWithTimeout(url: string, ms = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}