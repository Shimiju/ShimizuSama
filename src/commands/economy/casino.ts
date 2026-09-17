import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { Command } from '../../types/index.js';
import { MultiplayerBlackjack } from '../../services/economy/games/MultiplayerBlackjack.js';
import { prisma } from '../../database/prisma.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('casino')
    .setDescription('Enter the grand casino and play multiplayer games!')
    .addSubcommand(sub => 
      sub
        .setName('blackjack')
        .setDescription('Host a multiplayer blackjack table')
        .addIntegerOption(opt => 
          opt
            .setName('bet')
            .setDescription('The bet amount required to join the table')
            .setRequired(true)
            .setMinValue(10)
        )
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'blackjack') {
      const bet = interaction.options.getInteger('bet', true);
      const host = interaction.user;
      
      const game = new MultiplayerBlackjack(guildId, interaction.channel as TextChannel, host, bet);
      await game.startLobby(interaction);
    }
  }
};

export default command;
