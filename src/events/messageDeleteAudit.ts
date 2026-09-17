import { Events, Message, PartialMessage, EmbedBuilder } from 'discord.js';
import { Event } from '../types/index.js';
import { LoggingService, LogType } from '../services/loggingService.js';
import { ManorTheme } from '../utils/theme.js';
import { logger } from '../utils/logger.js';

export const event: Event<Events.MessageDelete> = {
  name: Events.MessageDelete,
  execute: async (message: Message | PartialMessage) => {
    try {
      if (!message.guild || !message.author || message.author.bot) return;

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Message Deleted')
        .setColor(ManorTheme.colors.error || 0xff0000)
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL(),
        })
        .addFields(
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Author', value: `<@${message.author.id}>`, inline: true },
          {
            name: 'Content',
            value: message.content ? message.content : '*No text content (possibly an embed/attachment)*',
          }
        )
        .setTimestamp()
        .setFooter({ text: `Message ID: ${message.id} | User ID: ${message.author.id}` });

      await LoggingService.logAction(message.guild, LogType.MESSAGE, embed);
    } catch (error) {
      logger.error({ err: error }, 'Failed to execute messageDeleteAudit');
    }
  },
};
