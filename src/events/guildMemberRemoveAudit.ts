import { Events, GuildMember, PartialGuildMember, EmbedBuilder } from 'discord.js';
import { Event } from '../types/index.js';
import { LoggingService, LogType } from '../services/loggingService.js';
import { ManorTheme } from '../utils/theme.js';
import { logger } from '../utils/logger.js';

export const event: Event<Events.GuildMemberRemove> = {
  name: Events.GuildMemberRemove,
  execute: async (member: GuildMember | PartialGuildMember) => {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🚪 Member Left')
        .setColor(ManorTheme.colors.error || 0xff0000)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
          { name: 'Joined At', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
          { name: 'Roles', value: member.roles.cache.map(r => r.toString()).join(' ') || 'None', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `User ID: ${member.user.id}` });

      await LoggingService.logAction(member.guild, LogType.MEMBER, embed);
    } catch (error) {
      logger.error({ err: error }, 'Failed to execute guildMemberRemoveAudit');
    }
  },
};
