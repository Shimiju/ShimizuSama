import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { prisma } from '../../database/prisma.js';
import { RankCardGenerator } from '../../services/image/RankCardGenerator.js';
import { LevelingService } from '../../services/economy/LevelingService.js';
import { logger } from '../../utils/logger.js';
import { CacheService } from '../../services/cacheService.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your server rank and level progress')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to view the rank of')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    if (targetUser.bot) {
      await interaction.reply({ content: 'Bots do not have ranks!', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      // Check if leveling is enabled
      const cacheKey = `guild:settings:${interaction.guild.id}`;
      let settings = await CacheService.get<any>(cacheKey);
      if (!settings) {
        settings = await prisma.guildSettings.findUnique({
          where: { guildId: interaction.guild.id },
        });
      }

      if (settings && settings.levelingEnabled === false) {
        await interaction.editReply('Leveling is currently disabled in this server.');
        return;
      }

      const guildId = interaction.guild.id;
      const userId = targetUser.id;

      // Fetch user profile
      const profile = await prisma.userGuildProfile.findUnique({
        where: { guildId_userId: { guildId, userId } }
      });

      if (!profile) {
        await interaction.editReply(`${targetUser.toString()} has not earned any XP yet!`);
        return;
      }

      // Calculate Rank
      const rankCount = await prisma.userGuildProfile.count({
        where: {
          guildId,
          xp: { gt: profile.xp }
        }
      });
      const rank = rankCount + 1;

      // Calculate Next Level XP
      // The current level is `profile.level`
      // The XP required to reach the NEXT level is `100 * Math.pow(profile.level + 1, 2)`
      const requiredXp = LevelingService.requiredTotalXp(profile.level + 1);

      // Generate Image
      const buffer = await RankCardGenerator.generateCard(
        targetUser.username,
        targetUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
        profile.xp,
        requiredXp,
        profile.level,
        rank
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'rank-card.png' });

      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      logger.error({ error, guildId: interaction.guild.id, userId: interaction.user.id }, 'Error generating rank card');
      await interaction.editReply('An error occurred while generating the rank card.');
    }
  },
};

export default command;
