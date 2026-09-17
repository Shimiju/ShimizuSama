import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { prisma } from '../../database/prisma.js';
import { ManorTheme } from '../../utils/theme.js';

const EMOJIS = ['🍷', '🎻', '🎩', '🪙', '📜'];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription("Pull the lever on the Manor's slot machine.")
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) return;

    const betAmount = interaction.options.getInteger('amount', true);
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

    let profitMultiplier = -1;
    let slot1, slot2, slot3;

    // 15% chance to hit the jackpot
    const isJackpot = Math.random() < 0.15;

    if (isJackpot) {
      // WIN: All 3 symbols are exactly the same
      const winningSymbol = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      slot1 = winningSymbol;
      slot2 = winningSymbol;
      slot3 = winningSymbol;
      profitMultiplier = 5;
    } else {
      // LOSE: All 3 symbols are completely different
      const shuffled = [...EMOJIS].sort(() => 0.5 - Math.random());
      slot1 = shuffled[0];
      slot2 = shuffled[1];
      slot3 = shuffled[2];
    }

    const profit = Math.floor(betAmount * profitMultiplier);
    const newBalance = profile.balance + profit;
    const won = profit > 0;


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
          amount: Math.abs(profit), // The absolute difference
          balanceAfter: newBalance,
        },
      }),
    ]);

    const resultEmoji = won ? ManorTheme.emojis.success : ManorTheme.emojis.error;
    let resultMessage = `The machine stopped and you lost your **${betAmount}** coins.`;
    if (profitMultiplier === 5)
      resultMessage = `Jackpot! All three match! You won **${profit}** coins!`;

    const embed = new EmbedBuilder()
      .setColor(won ? ManorTheme.colors.success : ManorTheme.colors.error)
      .setTitle(`🎰 Manor Slots`)
      .setDescription(
        `**[ ${slot1} | ${slot2} | ${slot3} ]**\n\n` +
          `${resultEmoji} ${resultMessage}\n` +
          `Your remaining wealth is **${newBalance}** coins.`
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
