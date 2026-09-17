import { EmbedBuilder, TextChannel, Guild, User } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';

export enum LogType {
  MODERATION = 'moderationLogs',
  MEMBER = 'memberLogs',
  MESSAGE = 'messageLogs',
  SERVER = 'serverLogs',
  VOICE = 'voiceLogs',
  AUTOMOD = 'autoModLogs',
}

export class LoggingService {
  static async logAction(guild: Guild, type: LogType, embed: EmbedBuilder): Promise<void> {
    try {
      // 1. Save to Database Archive
      const action = embed.data.title || 'Unknown Action';
      let targetId = null;
      let moderatorId = null;
      
      const fields = embed.data.fields || [];
      const targetField = fields.find(f => f.name.toLowerCase().includes('target') || f.name.toLowerCase().includes('user') || f.name.toLowerCase().includes('author') || f.name.toLowerCase().includes('member'));
      if (targetField && targetField.value) {
         const match = targetField.value.match(/<@!?(\d+)>/);
         if (match) targetId = match[1];
      }
      
      const modField = fields.find(f => f.name.toLowerCase().includes('moderator'));
      if (modField && modField.value) {
         const match = modField.value.match(/<@!?(\d+)>/);
         if (match) moderatorId = match[1];
      }
      
      if (!targetId && embed.data.footer?.text) {
         const idMatch = embed.data.footer.text.match(/User ID: (\d+)/);
         if (idMatch) targetId = idMatch[1];
      }

      await prisma.auditLogArchive.create({
        data: {
          guildId: guild.id,
          type: type,
          action: action,
          targetId: targetId,
          moderatorId: moderatorId,
          details: embed.data as any
        }
      });

      // 2. Send to Discord Channel
      const config = await prisma.logConfig.findUnique({
        where: { guildId: guild.id },
      });

      if (!config) return;

      const channelId = config[type];
      if (!channelId) return;

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) return;

      await channel.send({ embeds: [embed] }).catch((err) => {
        logger.warn({ err }, `Failed to send log to channel ${channelId}`);
      });
    } catch (err) {
      logger.error({ err }, `Error in LoggingService.logAction for guild ${guild.id}`);
    }
  }

  static buildModerationEmbed(
    action: string,
    target: User,
    moderator: User,
    reason: string | null,
    color: number,
    duration?: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`Moderation Action: ${action}`)
      .setColor(color)
      .addFields(
        { name: 'Target', value: `${target.tag} (<@${target.id}>)`, inline: true },
        { name: 'Moderator', value: `${moderator.tag} (<@${moderator.id}>)`, inline: true },
        { name: 'Reason', value: reason || 'No reason provided', inline: false }
      )
      .setTimestamp();

    if (duration) {
      embed.addFields({ name: 'Duration', value: duration, inline: true });
    }

    return embed;
  }
}
