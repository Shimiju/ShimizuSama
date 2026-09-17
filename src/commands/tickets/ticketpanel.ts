import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { Command } from '../../types/index.js';
import { TicketService } from '../../services/ticket/TicketService.js';
import { logger } from '../../utils/logger.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Spawn a ticket panel in the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName('title').setDescription('Title for the ticket panel embed').setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Description for the ticket panel embed')
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('category')
        .setDescription('Specific category to open tickets under')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    )
    .addRoleOption((option) =>
      option
        .setName('support_role')
        .setDescription('Specific role to ping when tickets open')
        .setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId || !interaction.channel) return;

    const title = interaction.options.getString('title') || "📜 The Steward's Office";
    const description =
      interaction.options.getString('description') ||
      "Welcome to The Steward's Office. If you wish to submit a formal petition to the Lords and Ladies, please select the button below.";
    
    const category = interaction.options.getChannel('category');
    const supportRole = interaction.options.getRole('support_role');

    await interaction.deferReply({ ephemeral: true });

    try {
      await TicketService.createPanel(
        interaction.guildId,
        interaction.channel as TextChannel,
        title,
        description,
        category?.id,
        supportRole?.id
      );

      await interaction.followUp({
        content: '✅ Ticket panel successfully spawned!',
        ephemeral: true,
      });
    } catch (error) {
      logger.error({ error, guildId: interaction.guildId }, 'Failed to spawn ticket panel');
      await interaction.followUp({
        content: '❌ Failed to spawn the ticket panel.',
        ephemeral: true,
      });
    }
  },
};

export default command;
