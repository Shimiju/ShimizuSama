import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../../types/index.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { CacheService } from '../../services/cacheService.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View the items available in the Grand Bazaar.'),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    try {
      const items = await prisma.shopItem.findMany({
        where: { guildId: interaction.guildId },
        orderBy: { price: 'asc' },
      });

      if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle('🛍️ The Grand Bazaar')
          .setDescription('The Royal Vault is currently empty. The Lords have not added any treasures yet.')
          .setColor('#24283b');
        await interaction.reply({ embeds: [emptyEmbed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🛍️ The Grand Bazaar')
        .setDescription('Use `/buy <item_name>` to purchase an item!')
        .setColor('#bb9af7')
        .setThumbnail(interaction.guild.iconURL({ extension: 'png' }));

      items.forEach(item => {
        let value = `🪙 **Price:** ${item.price.toLocaleString()} Gold\n`;
        if (item.description) value += `*${item.description}*\n`;
        if (item.roleId) value += `\n✨ *Grants a special role upon purchase!*`;
        
        embed.addFields({
          name: item.name,
          value: value,
          inline: true
        });
      });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error({ error, guildId: interaction.guildId }, 'Error in /shop command');
      await interaction.reply({ content: 'Failed to retrieve shop items.', ephemeral: true });
    }
  },
};

export default command;
