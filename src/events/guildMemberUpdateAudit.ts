import { Events, GuildMember, PartialGuildMember, EmbedBuilder } from 'discord.js';
import { Event } from '../types/index.js';
import { LoggingService, LogType } from '../services/loggingService.js';
import { ManorTheme } from '../utils/theme.js';
import { logger } from '../utils/logger.js';

export const event: Event<Events.GuildMemberUpdate> = {
  name: Events.GuildMemberUpdate,
  execute: async (oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) => {
    try {
      // 1. Role changes
      if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

        if (addedRoles.size > 0 || removedRoles.size > 0) {
          const embed = new EmbedBuilder()
            .setTitle('🎭 Member Roles Updated')
            .setColor(ManorTheme.colors.primary || 0x2b2d31)
            .setAuthor({
              name: newMember.user.tag,
              iconURL: newMember.user.displayAvatarURL(),
            })
            .setTimestamp()
            .setFooter({ text: `User ID: ${newMember.user.id}` });

          if (addedRoles.size > 0) {
            embed.addFields({ name: 'Roles Added', value: addedRoles.map(r => r.toString()).join(' '), inline: false });
          }
          if (removedRoles.size > 0) {
            embed.addFields({ name: 'Roles Removed', value: removedRoles.map(r => r.toString()).join(' '), inline: false });
          }

          await LoggingService.logAction(newMember.guild, LogType.MEMBER, embed);
        }
      }

      // 2. Nickname changes
      if (oldMember.nickname !== newMember.nickname) {
        const embed = new EmbedBuilder()
          .setTitle('📝 Member Nickname Changed')
          .setColor(ManorTheme.colors.primary || 0x2b2d31)
          .setAuthor({
            name: newMember.user.tag,
            iconURL: newMember.user.displayAvatarURL(),
          })
          .addFields(
            { name: 'Before', value: oldMember.nickname || '*None*', inline: true },
            { name: 'After', value: newMember.nickname || '*None*', inline: true }
          )
          .setTimestamp()
          .setFooter({ text: `User ID: ${newMember.user.id}` });

        await LoggingService.logAction(newMember.guild, LogType.MEMBER, embed);
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to execute guildMemberUpdateAudit');
    }
  },
};
