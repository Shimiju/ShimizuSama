import { Events } from 'discord.js';
import { Event } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { GiveawayScheduler } from '../services/giveaway/GiveawayScheduler.js';
import { ServerStatsService } from '../services/serverStats/ServerStatsService.js';
import { ShimizuClient } from '../bot/client.js';
import { SocialFeedService } from '../services/social/SocialFeedService.js';

const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute: async (client: any) => {
    logger.info(`Logged in as ${client.user?.tag}!`);
    await GiveawayScheduler.init(client as ShimizuClient);
    ServerStatsService.init(client as ShimizuClient);
    SocialFeedService.init(client as ShimizuClient);
    
    // Cleanup old audit logs every 24 hours
    setInterval(async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Dynamic import to avoid circular dependencies in ready.ts if prisma isn't imported
        const { prisma } = await import('../database/prisma.js');
        
        const result = await prisma.auditLogArchive.deleteMany({
          where: { createdAt: { lt: thirtyDaysAgo } }
        });
        
        if (result.count > 0) {
          logger.info(`Cleaned up ${result.count} audit logs older than 30 days`);
        }
      } catch (err) {
        logger.error({ err }, 'Failed to cleanup old audit logs');
      }
    }, 24 * 60 * 60 * 1000);
  },
};

export default event;
