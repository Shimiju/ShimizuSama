import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteraction, EmbedBuilder, MessageComponentInteraction, TextChannel, User } from 'discord.js';
import { prisma } from '../../../database/prisma.js';
import { logger } from '../../../utils/logger.js';

interface Card {
  suit: string;
  rank: string;
  value: number;
}

interface Player {
  user: User;
  bet: number;
  hand: Card[];
  status: 'playing' | 'stood' | 'busted' | 'blackjack';
}

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export class MultiplayerBlackjack {
  private guildId: string;
  private channel: TextChannel;
  private host: User;
  private tableBet: number;
  private players: Player[] = [];
  private dealerHand: Card[] = [];
  private deck: Card[] = [];
  private state: 'lobby' | 'playing' | 'dealer_turn' | 'finished' = 'lobby';
  private currentPlayerIndex: number = 0;
  private lobbyMessage: any = null;

  constructor(guildId: string, channel: TextChannel, host: User, bet: number) {
    this.guildId = guildId;
    this.channel = channel;
    this.host = host;
    this.tableBet = bet;
    this.buildDeck();
  }

  private buildDeck() {
    this.deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        let value = parseInt(rank);
        if (['J', 'Q', 'K'].includes(rank)) value = 10;
        if (rank === 'A') value = 11;
        this.deck.push({ suit, rank, value });
      }
    }
    // Shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  private drawCard(): Card {
    if (this.deck.length === 0) this.buildDeck();
    return this.deck.pop()!;
  }

  private calculateHand(hand: Card[]): number {
    let sum = 0;
    let aces = 0;
    for (const card of hand) {
      sum += card.value;
      if (card.rank === 'A') aces++;
    }
    while (sum > 21 && aces > 0) {
      sum -= 10;
      aces--;
    }
    return sum;
  }

  private renderHand(hand: Card[], hideSecond: boolean = false): string {
    if (hand.length === 0) return 'Empty';
    if (hideSecond) {
      return `\`${hand[0].rank}${hand[0].suit}\` \`??\``;
    }
    return hand.map(c => `\`${c.rank}${c.suit}\``).join(' ');
  }

  public async startLobby(interaction: CommandInteraction) {
    // Check if host has enough balance
    const profile = await prisma.userGuildProfile.findUnique({
      where: { guildId_userId: { guildId: this.guildId, userId: this.host.id } }
    });
    
    if (!profile || profile.balance < this.tableBet) {
      await interaction.reply({ content: `You don't have enough Manor Gold to host a table with a ${this.tableBet} bet!`, ephemeral: true });
      return;
    }

    // Deduct bet from host immediately
    await prisma.userGuildProfile.update({
      where: { id: profile.id },
      data: { balance: { decrement: this.tableBet } }
    });
    
    this.players.push({
      user: this.host,
      bet: this.tableBet,
      hand: [],
      status: 'playing'
    });

    const embed = new EmbedBuilder()
      .setTitle('🎲 Multiplayer Blackjack Lobby')
      .setColor('#ffcc00')
      .setDescription(`**${this.host.username}** opened a Blackjack table!\n**Table Stakes:** 🪙 ${this.tableBet} Manor Gold\n\nClick **Join Table** below to match the bet and play! The game starts in **30 seconds**.`);
      
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('bj_join')
          .setLabel(`Join Table (🪙 ${this.tableBet})`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('bj_start_early')
          .setLabel('Start Now')
          .setStyle(ButtonStyle.Secondary)
      );

    this.lobbyMessage = (await interaction.reply({ embeds: [embed], components: [row], withResponse: true })).resource?.message;
    if (!this.lobbyMessage) {
      this.lobbyMessage = await interaction.fetchReply();
    }

    // Collect interactions for 30s
    const collector = this.lobbyMessage.createMessageComponentCollector({ time: 30000 });

    collector.on('collect', async (i: MessageComponentInteraction) => {
      if (i.customId === 'bj_join') {
        if (this.players.find(p => p.user.id === i.user.id)) {
          await i.reply({ content: 'You are already at the table!', ephemeral: true });
          return;
        }
        if (this.players.length >= 5) {
          await i.reply({ content: 'The table is full! (Max 5 players)', ephemeral: true });
          return;
        }

        const userProfile = await prisma.userGuildProfile.findUnique({
          where: { guildId_userId: { guildId: this.guildId, userId: i.user.id } }
        });

        if (!userProfile || userProfile.balance < this.tableBet) {
          await i.reply({ content: `You need 🪙 ${this.tableBet} Manor Gold to sit at this table!`, ephemeral: true });
          return;
        }

        await prisma.userGuildProfile.update({
          where: { id: userProfile.id },
          data: { balance: { decrement: this.tableBet } }
        });

        this.players.push({
          user: i.user,
          bet: this.tableBet,
          hand: [],
          status: 'playing'
        });

        const updatedEmbed = EmbedBuilder.from(embed)
          .setFields({ name: 'Players Seated', value: this.players.map(p => p.user.username).join(', ') });
        
        await i.update({ embeds: [updatedEmbed] });
      }

      if (i.customId === 'bj_start_early') {
        if (i.user.id !== this.host.id) {
          await i.reply({ content: 'Only the host can start the game early.', ephemeral: true });
          return;
        }
        collector.stop('host_started');
      }
    });

    collector.on('end', async () => {
      await this.startGame();
    });
  }

  private async startGame() {
    this.state = 'playing';
    
    // Deal initial cards
    this.dealerHand.push(this.drawCard(), this.drawCard());
    
    for (const player of this.players) {
      player.hand.push(this.drawCard(), this.drawCard());
      if (this.calculateHand(player.hand) === 21) {
        player.status = 'blackjack';
      }
    }

    await this.progressGame();
  }

  private async progressGame() {
    // Find next player whose status is 'playing'
    while (this.currentPlayerIndex < this.players.length && this.players[this.currentPlayerIndex].status !== 'playing') {
      this.currentPlayerIndex++;
    }

    if (this.currentPlayerIndex >= this.players.length) {
      await this.playDealerTurn();
      return;
    }

    await this.renderGameState();
  }

  private async renderGameState(interactionToUpdate?: MessageComponentInteraction) {
    const currentPlayer = this.players[this.currentPlayerIndex];
    
    const embed = new EmbedBuilder()
      .setTitle('🎲 Multiplayer Blackjack')
      .setColor('#2b2d31');

    // Dealer Field
    const dealerTotal = this.calculateHand([this.dealerHand[0]]);
    embed.addFields({ 
      name: `Dealer's Hand (${this.state === 'playing' ? '?' : this.calculateHand(this.dealerHand)})`, 
      value: this.renderHand(this.dealerHand, this.state === 'playing'),
      inline: false 
    });

    // Players Fields
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const total = this.calculateHand(p.hand);
      
      let statusIcon = '';
      if (p.status === 'blackjack') statusIcon = '🔥 **BLACKJACK**';
      else if (p.status === 'busted') statusIcon = '💥 **BUST**';
      else if (p.status === 'stood') statusIcon = '🛑 **STAND**';
      else if (i === this.currentPlayerIndex) statusIcon = '▶️ **YOUR TURN**';

      embed.addFields({
        name: `${p.user.username} (${total}) ${statusIcon}`,
        value: this.renderHand(p.hand),
        inline: true
      });
    }

    let components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (this.state === 'playing') {
      embed.setDescription(`It is <@${currentPlayer.user.id}>'s turn!`);
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Danger)
        );
      components = [row];
    } else if (this.state === 'dealer_turn') {
      embed.setDescription('The Dealer is revealing their hand...');
    }

    if (interactionToUpdate) {
      await interactionToUpdate.update({ embeds: [embed], components });
    } else {
      this.lobbyMessage = await this.lobbyMessage.edit({ embeds: [embed], components });
    }

    if (this.state === 'playing') {
      this.waitForPlayerAction();
    }
  }

  private waitForPlayerAction() {
    const currentPlayer = this.players[this.currentPlayerIndex];
    
    const collector = this.lobbyMessage.createMessageComponentCollector({ 
      filter: (i: MessageComponentInteraction) => i.user.id === currentPlayer.user.id,
      time: 60000, 
      max: 1 
    });

    collector.on('collect', async (i: MessageComponentInteraction) => {
      if (i.customId === 'bj_hit') {
        currentPlayer.hand.push(this.drawCard());
        const total = this.calculateHand(currentPlayer.hand);
        
        if (total > 21) {
          currentPlayer.status = 'busted';
          await this.progressGame();
        } else if (total === 21) {
          currentPlayer.status = 'stood';
          await this.progressGame();
        } else {
          // Re-render, still their turn
          await this.renderGameState(i);
          return;
        }
      } else if (i.customId === 'bj_stand') {
        currentPlayer.status = 'stood';
        await this.progressGame();
      }
      
      // Update UI to acknowledge click if progressGame didn't update it
      try {
        if (!i.replied && !i.deferred) await i.deferUpdate();
      } catch (e) {}
    });

    collector.on('end', async (collected: any, reason: string) => {
      if (reason === 'time') {
        currentPlayer.status = 'stood'; // Auto stand if afk
        await this.progressGame();
        try {
          await this.renderGameState();
        } catch(e) {}
      }
    });
  }

  private async playDealerTurn() {
    this.state = 'dealer_turn';
    await this.renderGameState();

    // Small delay for dramatic effect
    await new Promise(r => setTimeout(r, 2000));

    let dealerTotal = this.calculateHand(this.dealerHand);
    while (dealerTotal < 17) {
      this.dealerHand.push(this.drawCard());
      dealerTotal = this.calculateHand(this.dealerHand);
      await this.renderGameState();
      await new Promise(r => setTimeout(r, 1500));
    }

    await this.resolvePayouts(dealerTotal);
  }

  private async resolvePayouts(dealerTotal: number) {
    this.state = 'finished';
    const dealerBusted = dealerTotal > 21;
    let resultsText = `**Dealer ended with ${dealerTotal}${dealerBusted ? ' (BUSTED!)' : ''}**\n\n`;

    const transactions = [];
    const queries = [];

    for (const player of this.players) {
      const pTotal = this.calculateHand(player.hand);
      let winnings = 0;
      let result = '';

      if (player.status === 'busted') {
        result = `💥 Busted! Lost 🪙 ${player.bet}`;
        transactions.push({
          guildId: this.guildId, userId: player.user.id, type: 'CASINO_LOSS', amount: -player.bet, balanceAfter: 0
        });
      } else if (player.status === 'blackjack') {
        if (this.calculateHand(this.dealerHand) === 21 && this.dealerHand.length === 2) {
          result = `🤝 Push (Tie). Returned 🪙 ${player.bet}`;
          winnings = player.bet;
        } else {
          winnings = Math.floor(player.bet * 2.5); // 1.5x profit for blackjack
          result = `🔥 BLACKJACK! Won 🪙 ${winnings}`;
          transactions.push({
            guildId: this.guildId, userId: player.user.id, type: 'CASINO_WIN', amount: winnings - player.bet, balanceAfter: 0
          });
        }
      } else {
        if (dealerBusted || pTotal > dealerTotal) {
          winnings = player.bet * 2;
          result = `🎉 Won! Payout 🪙 ${winnings}`;
          transactions.push({
            guildId: this.guildId, userId: player.user.id, type: 'CASINO_WIN', amount: winnings - player.bet, balanceAfter: 0
          });
        } else if (pTotal === dealerTotal) {
          winnings = player.bet;
          result = `🤝 Push (Tie). Returned 🪙 ${player.bet}`;
        } else {
          result = `💀 Lost 🪙 ${player.bet}`;
          transactions.push({
            guildId: this.guildId, userId: player.user.id, type: 'CASINO_LOSS', amount: -player.bet, balanceAfter: 0
          });
        }
      }

      resultsText += `**${player.user.username}:** ${result}\n`;

      if (winnings > 0) {
        queries.push(
          prisma.userGuildProfile.update({
            where: { guildId_userId: { guildId: this.guildId, userId: player.user.id } },
            data: { balance: { increment: winnings } }
          })
        );
      }
    }

    if (queries.length > 0 || transactions.length > 0) {
      await prisma.$transaction([
        ...queries,
        ...transactions.map(t => prisma.economyTransaction.create({ data: t as any }))
      ]);
    }

    const embed = new EmbedBuilder()
      .setTitle('🎲 Multiplayer Blackjack - Results')
      .setColor('#9ece6a')
      .setDescription(resultsText);

    // Final dealer hand field
    embed.addFields({ name: `Dealer's Hand (${dealerTotal})`, value: this.renderHand(this.dealerHand) });

    await this.lobbyMessage.edit({ embeds: [embed], components: [] });
  }
}
