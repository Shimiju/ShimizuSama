import { Events, Message, PartialMessage, EmbedBuilder } from 'discord.js';
import { Event } from '../types/index.js';
import { LoggingService, LogType } from '../services/loggingService.js';
import { ManorTheme } from '../utils/theme.js';
import { logger } from '../utils/logger.js';

export const event: Event<Events.MessageUpdate> = {
  name: Events.MessageUpdate,
  execute: async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
    try {
      if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;
      if (oldMessage.content === newMessage.content) return; // Only log content changes

      const embed = new EmbedBuilder()
        .setTitle('✏️ Message Edited')
        .setColor(ManorTheme.colors.secondary || 0xffaa00)
        .setAuthor({
          name: newMessage.author.tag,
          iconURL: newMessage.author.displayAvatarURL(),
        })
        .addFields(
          { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
          { name: 'Author', value: `<@${newMessage.author.id}>`, inline: true },
          { name: 'Link', value: `[Jump to Message](${newMessage.url})`, inline: true },
          {
            name: 'Before',
            value: oldMessage.content ? oldMessage.content.slice(0, 1024) : '*No text content*',
          },
          {
            name: 'After',
            value: newMessage.content ? newMessage.content.slice(0, 1024) : '*No text content*',
          }
        )
        .setTimestamp()
        .setFooter({ text: `Message ID: ${newMessage.id} | User ID: ${newMessage.author.id}` });

      await LoggingService.logAction(newMessage.guild, LogType.MESSAGE, embed);
    } catch (error) {
      logger.error({ err: error }, 'Failed to execute messageUpdateAudit');
    }
  },
};
