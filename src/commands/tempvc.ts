import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import { Command } from '../types/index.js';
import { prisma } from '../database/prisma.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('tempvc')
    .setDescription('Manage the Temporary Voice Channels system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Automatically create the TempVC category and Join to Create channel')
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      await interaction.deferReply({ ephemeral: true });

      try {
        // Create the Category
        const category = await interaction.guild.channels.create({
          name: '┌-⋆⋅✧⋅⋆-┐ Private Lounges └-⋆⋅✧⋅⋆-┘',
          type: ChannelType.GuildCategory,
        });

        // Create the Join to Create channel
        const joinChannel = await interaction.guild.channels.create({
          name: '╰┈➤ ➕ Join to Create',
          type: ChannelType.GuildVoice,
          parent: category.id,
        });

        // Save to Database
        await prisma.tempVCSettings.upsert({
          where: { guildId: interaction.guildId },
          update: {
            joinChannelId: joinChannel.id,
            categoryId: category.id,
          },
          create: {
            guildId: interaction.guildId,
            joinChannelId: joinChannel.id,
            categoryId: category.id,
          },
        });

        await interaction.followUp('✅ **TempVC System Setup Complete!**\n\nThe `Temporary Channels` category and `➕ Join to Create` voice channel have been created. Guests who join that channel will automatically get their own private, managed voice channel!');
      } catch (error) {
        console.error(error);
        await interaction.followUp('❌ Failed to setup TempVC. Ensure I have the `Manage Channels` permission.');
      }
    }
  },
};

export default command;
