import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { EconomyService } from '../../services/economy/EconomyService.js';
import { logger } from '../../utils/logger.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your owned items.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to check').setRequired(false)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const inventory = await EconomyService.getInventory(interaction.guildId, targetUser.id);

      if (inventory.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle(`🎒 ${targetUser.username}'s Inventory`)
          .setDescription(`${targetUser.username}'s inventory is completely empty. Head to the \`/shop\` to buy some items!`)
          .setColor('#24283b');
          
        await interaction.reply({ embeds: [emptyEmbed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎒 ${targetUser.username}'s Inventory`)
        .setColor('#bb9af7')
        .setThumbnail(targetUser.displayAvatarURL({ extension: 'png' }));

      let desc = '';
      for (const inv of inventory) {
        desc += `**${inv.quantity}x** ${inv.item.name}\n`;
      }
      
      embed.setDescription(desc);

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error(
        { error, guildId: interaction.guildId, userId: interaction.user.id },
        'Error in /inventory command'
      );
      await interaction.reply({ content: 'Failed to retrieve inventory.', ephemeral: true });
    }
  },
};

export default command;
