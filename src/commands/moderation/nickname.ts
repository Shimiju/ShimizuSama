import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from '../../types/index.js';
import { ModerationService } from '../../services/moderationService.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription("Changes a user's nickname.")
    .addUserOption((option) =>
      option.setName('target').setDescription('The user to nickname').setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('The new nickname (leave empty to reset)')
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const adminRoleId = '1539506154047152138';
    const firstMemberRoleId = '1539506802260049950';
    const secondMemberRoleId = '1539506302420647936';

    const memberRoles = (interaction.member as any).roles.cache;
    const hasPermission = 
      memberRoles.has(adminRoleId) || 
      memberRoles.has(firstMemberRoleId) || 
      memberRoles.has(secondMemberRoleId) ||
      (interaction.member as any).permissions.has(PermissionFlagsBits.Administrator) ||
      (interaction.member as any).permissions.has(PermissionFlagsBits.ManageNicknames);

    if (!hasPermission) {
      await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('target', true);
    const newNickname = interaction.options.getString('nickname') || null;
    const guild = interaction.guild;
    const moderator = interaction.member;

    if (moderator.id !== targetUser.id) {
      const hierarchyError = await ModerationService.validateHierarchy(guild, moderator, targetUser);
      if (hierarchyError) {
        await interaction.reply({ content: `❌ ${hierarchyError}`, ephemeral: true });
        return;
      }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        await interaction.followUp(`❌ User is not in the server.`);
        return;
      }

      await targetMember.setNickname(newNickname, `Nickname changed by ${interaction.user.tag}`);

      if (newNickname) {
        await interaction.followUp(`✅ Successfully changed nickname to **${newNickname}**.`);
      } else {
        await interaction.followUp(`✅ Successfully reset nickname.`);
      }
    } catch {
      await interaction.followUp(`❌ Failed to change nickname. Please check my permissions.`);
    }
  },
};

export default command;
