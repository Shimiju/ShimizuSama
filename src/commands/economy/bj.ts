import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { Command } from '../../types/index.js';
import { prisma } from '../../database/prisma.js';
import { ManorTheme } from '../../utils/theme.js';

type Card = { suit: string; rank: string; value: number };

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = [
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 10 },
  { rank: 'Q', value: 10 },
  { rank: 'K', value: 10 },
  { rank: 'A', value: 11 },
];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank: rank.rank, value: rank.value });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateScore(hand: Card[]): number {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    score += card.value;
    if (card.rank === 'A') aces += 1;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

function renderHand(hand: Card[], hidden = false): string {
  if (hidden && hand.length > 0) {
    return `${hand[0].rank}${hand[0].suit} + [Hidden Card]`;
  }
  return hand.map((c) => `${c.rank}${c.suit}`).join(' | ');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('bj')
    .setDescription("Play a hand of Blackjack at the Manor's tables.")
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

    const deck = createDeck();
    const playerHand = [deck.pop()!, deck.pop()!];
    const dealerHand = [deck.pop()!, deck.pop()!];

    let playerScore = calculateScore(playerHand);
    let dealerScore = calculateScore(dealerHand);

    // Initial check for instant Blackjack
    if (playerScore === 21) {
      const newBalance = profile.balance + Math.floor(betAmount * 1.5); // 1.5x payout for BJ
      await prisma.$transaction([
        prisma.userGuildProfile.update({
          where: { guildId_userId: { guildId, userId } },
          data: { balance: newBalance },
        }),
        prisma.economyTransaction.create({
          data: {
            guildId,
            userId,
            type: 'CASINO_WIN',
            amount: Math.floor(betAmount * 1.5),
            balanceAfter: newBalance,
          },
        }),
      ]);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.success)
            .setTitle(`🃏 Blackjack!`)
            .setDescription(
              `You drew **Blackjack** instantly!\n\n` +
                `**Your Hand:** ${renderHand(playerHand)} (21)\n` +
                `**Dealer's Hand:** ${renderHand(dealerHand)} (${dealerScore})\n\n` +
                `${ManorTheme.emojis.success} You won **${Math.floor(betAmount * 1.5)}** coins!`
            ),
        ],
      });
      return;
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setColor(ManorTheme.colors.primary)
      .setTitle(`🃏 Blackjack`)
      .setDescription(
        `**Your Hand:** ${renderHand(playerHand)} (${playerScore})\n` +
          `**Dealer's Hand:** ${renderHand(dealerHand, true)} (?)`
      )
      .setFooter({ text: `Bet: ${betAmount} coins` });

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: `${ManorTheme.emojis.error} You may not interfere with another guest's game.`,
          ephemeral: true,
        });
        return;
      }

      if (i.customId === 'hit') {
        playerHand.push(deck.pop()!);
        playerScore = calculateScore(playerHand);

        if (playerScore > 21) {
          await i.deferUpdate();
          collector.stop('bust');
        } else {
          embed.setDescription(
            `**Your Hand:** ${renderHand(playerHand)} (${playerScore})\n` +
              `**Dealer's Hand:** ${renderHand(dealerHand, true)} (?)`
          );
          await i.update({ embeds: [embed] });
        }
      } else if (i.customId === 'stand') {
        await i.deferUpdate();
        collector.stop('stand');
      }
    });

    collector.on('end', async (collected, reason) => {
      let won = false;
      let multiplier = 0; // 0 = lose, 1 = win, 0 (but push) = tie

      if (reason === 'bust') {
        // Player busted, lose
      } else if (reason === 'time') {
        // Timed out, forfeit
      } else {
        // Stand, dealer plays
        while (dealerScore < 17) {
          dealerHand.push(deck.pop()!);
          dealerScore = calculateScore(dealerHand);
        }

        if (dealerScore > 21 || playerScore > dealerScore) {
          won = true;
          multiplier = 1;
        } else if (playerScore === dealerScore) {
          // Push (tie) - neither win nor lose, keep bet
          multiplier = 0; 
          won = false;
        }
      }

      const isPush = reason !== 'bust' && reason !== 'time' && playerScore === dealerScore;
      
      let newBalance = profile.balance;
      let profit = 0;

      if (won) {
        profit = betAmount;
        newBalance += profit;
      } else if (!isPush) {
        profit = -betAmount;
        newBalance += profit;
      }

      if (profit !== 0) {
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
      }

      const endEmbed = new EmbedBuilder().setTitle(`🃏 Blackjack Result`);

      if (reason === 'bust') {
        endEmbed
          .setColor(ManorTheme.colors.error)
          .setDescription(
            `**Your Hand:** ${renderHand(playerHand)} (${playerScore})\n` +
              `**Dealer's Hand:** ${renderHand(dealerHand)} (${dealerScore})\n\n` +
              `💥 **BUST!** You lost **${betAmount}** coins.`
          );
      } else if (reason === 'time') {
        endEmbed
          .setColor(ManorTheme.colors.error)
          .setDescription(`🕰️ You took too long to play! You forfeit your **${betAmount}** coins.`);
      } else if (isPush) {
        endEmbed
          .setColor(ManorTheme.colors.info)
          .setDescription(
            `**Your Hand:** ${renderHand(playerHand)} (${playerScore})\n` +
              `**Dealer's Hand:** ${renderHand(dealerHand)} (${dealerScore})\n\n` +
              `🤝 **PUSH!** It's a tie. You keep your bet.`
          );
      } else {
        endEmbed
          .setColor(won ? ManorTheme.colors.success : ManorTheme.colors.error)
          .setDescription(
            `**Your Hand:** ${renderHand(playerHand)} (${playerScore})\n` +
              `**Dealer's Hand:** ${renderHand(dealerHand)} (${dealerScore})\n\n` +
              `${won ? ManorTheme.emojis.success : ManorTheme.emojis.error} You **${
                won ? 'won' : 'lost'
              } ${betAmount}** coins.`
          );
      }

      endEmbed.setFooter({ text: `Your remaining wealth is ${newBalance} coins.` });

      await interaction.editReply({ embeds: [endEmbed], components: [] }).catch(() => null);
    });
  },
};

export default command;
