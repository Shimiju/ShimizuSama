import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { prisma } from '../../database/prisma.js';
import { ManorTheme } from '../../utils/theme.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('cf')
    .setDescription('Bet your balance on a coin toss.')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt
        .setName('choice')
        .setDescription('Heads or Tails')
        .setRequired(true)
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
    ),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) return;

    const betAmount = interaction.options.getInteger('amount', true);
    const choiceRaw = interaction.options.getString('choice');
    
    if (!choiceRaw || (choiceRaw.toLowerCase() !== 'heads' && choiceRaw.toLowerCase() !== 'tails')) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.error)
            .setDescription(
              `${ManorTheme.emojis.error} You must specify your wager! Correct usage: \`s!cf <amount> heads\` or \`s!cf <amount> tails\`.`
            ),
        ],
      });
      return;
    }
    
    const choice = choiceRaw.toLowerCase();
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

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === choice;

    const newBalance = won ? profile.balance + betAmount : profile.balance - betAmount;

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
          amount: betAmount,
          balanceAfter: newBalance,
        },
      }),
    ]);

    const resultEmoji = won ? ManorTheme.emojis.success : ManorTheme.emojis.error;
    const embed = new EmbedBuilder()
      .setColor(won ? ManorTheme.colors.success : ManorTheme.colors.error)
      .setTitle(`🪙 Coinflip Result`)
      .setDescription(
        `You wagered **${betAmount}** coins on **${choice}**, and the coin landed on **${result}**.\n\n` +
          `${resultEmoji} You ${won ? 'won' : 'lost'} **${betAmount}** coins.\n` +
          `Your remaining wealth is **${newBalance}** coins.`
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
