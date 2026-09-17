import { StringSelectMenuInteraction, GuildMember, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

export class RoleService {
  public static async handleInteraction(interaction: StringSelectMenuInteraction) {
    if (!interaction.inCachedGuild()) return;
    
    await interaction.update({ components: interaction.message.components });

    const member = interaction.member as GuildMember;
    const selectedRoleIds = interaction.values;

    let addedCount = 0;
    let removedCount = 0;
    let requiresVerification = false;

    try {
      // Toggle selected roles
      for (const roleId of selectedRoleIds) {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
          removedCount++;
        } else {
          const role = interaction.guild.roles.cache.get(roleId);
          if (role && role.name === 'Lady') {
            requiresVerification = true;
            continue; // Skip adding the role
          }
          await member.roles.add(roleId);
          addedCount++;
        }
      }

      let responseMsg = '🏰 **The Manor Registry has been updated!**\n';
      if (addedCount > 0) responseMsg += `\n➕ Granted ${addedCount} new title(s) or district(s).`;
      if (removedCount > 0) responseMsg += `\n➖ Revoked ${removedCount} title(s) or district(s).`;
      if (addedCount === 0 && removedCount === 0) responseMsg = '📜 Your registry status remains unchanged.';

      if (requiresVerification) {
        responseMsg += `\n\n🛡️ **Verification Required:** The **Lady** title requires manual verification. Please open a ticket in **The Steward's Office** to request this title!`;
      }

      await interaction.followUp({ content: responseMsg, flags: MessageFlags.Ephemeral });
    } catch (error) {
      logger.error({ err: error, guildId: interaction.guildId }, 'Failed to update roles in RoleService');
      await interaction.followUp({ content: '❌ I failed to update your roles. Ensure my bot role is placed above the roles you are trying to select in the server settings!', flags: MessageFlags.Ephemeral });
    }
  }
}
