import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { prisma } from '../../database/prisma.js';
import { ManorTheme } from '../../utils/theme.js';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription("Place your bets on the Manor's roulette table.")
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt
        .setName('color')
        .setDescription('Bet on a color (pays 2x)')
        .setRequired(false)
        .addChoices(
          { name: 'Red', value: 'red' },
          { name: 'Black', value: 'black' },
          { name: 'Green (0)', value: 'green' }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName('number')
        .setDescription('Bet on a specific number 0-36 (pays 35x)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(36)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) return;

    const betAmount = interaction.options.getInteger('amount', true);
    const betColor = interaction.options.getString('color');
    const betNumber = interaction.options.getInteger('number');

    if (!betColor && betNumber === null) {
      await interaction.reply({
        content: 'You must place your chips on either a color or a specific number.',
        ephemeral: true,
      });
      return;
    }

    if (betColor && betNumber !== null) {
      await interaction.reply({
        content: 'Please choose *only* a color or *only* a number for your wager.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const profile = await prisma.userGuildProfile.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    if (!profile || profile.balance < betAmount) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.error)
            .setDescription(
              `${ManorTheme.emojis.error} Forgive me, but your purse does not hold enough coins for such a wager.`
            ),
        ],
      });
      return;
    }

    // Spin the wheel
    const resultNumber = Math.floor(Math.random() * 37); // 0 to 36
    let resultColor = 'green';
    let resultEmoji = '🟢';
    if (RED_NUMBERS.includes(resultNumber)) {
      resultColor = 'red';
      resultEmoji = '🔴';
    } else if (BLACK_NUMBERS.includes(resultNumber)) {
      resultColor = 'black';
      resultEmoji = '⚫';
    }

    let won = false;
    let profit = -betAmount; // Assume loss initially
    let multiplier = 0;

    if (betColor) {
      if (betColor === resultColor) {
        won = true;
        multiplier = betColor === 'green' ? 35 : 2; // Green 0 pays 35x, Red/Black pays 2x
        profit = betAmount * multiplier - betAmount;
      }
    } else if (betNumber !== null) {
      if (betNumber === resultNumber) {
        won = true;
        multiplier = 35;
        profit = betAmount * multiplier - betAmount;
      }
    }

    const newBalance = profile.balance + profit;

    await prisma.$transaction([
      prisma.userGuildProfile.update({
        where: { guildId_userId: { guildId, userId } },
        data: { balance: newBalance },
      }),
      prisma.economyTransaction.create({
        data: {
          guildId,
          userId,
          type: won ? 'CASINO_WIN' : 'CASINO_LOSS',
          amount: Math.abs(profit),
          balanceAfter: newBalance,
        },
      }),
    ]);

    const embed = new EmbedBuilder()
      .setColor(won ? ManorTheme.colors.success : ManorTheme.colors.error)
      .setTitle(`🎡 Manor Roulette`)
      .setDescription(`The wheel spins... and lands on **${resultNumber} ${resultEmoji}**!\n\n` +
        (won 
          ? `Congratulations! You won **${profit + betAmount}** coins! (${multiplier}x payout)` 
          : `Unfortunate. You lost your wager of **${betAmount}** coins.`) +
        `\n\nYour remaining wealth is **${newBalance}** coins.`
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
