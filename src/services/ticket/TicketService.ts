import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildMember,
  TextChannel,
  User,
  PermissionFlagsBits,
  ButtonInteraction,
  AttachmentBuilder,
} from 'discord.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';

export class TicketService {
  public static async createPanel(
    guildId: string,
    channel: TextChannel,
    title: string = "📜 The Steward's Office",
    description: string = "Welcome to The Steward's Office. If you wish to submit a formal petition to the Lords and Ladies, please select the button below.",
    categoryId?: string,
    supportRoleId?: string
  ) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor('#2F3136');

    const button = new ButtonBuilder()
      .setCustomId('ticket_create')
      .setLabel('Submit Petition')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const message = await channel.send({ embeds: [embed], components: [row] });

    await prisma.ticketPanel.create({
      data: {
        guildId,
        channelId: channel.id,
        messageId: message.id,
        title,
        description,
        categoryId,
        supportRoleId,
      },
    });

    return message;
  }

  private static async generateTranscript(channel: TextChannel): Promise<Buffer> {
    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = Array.from(messages.values()).reverse();

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Transcript - ${escapeHtml(channel.name)}</title>
      <style>
        body { font-family: sans-serif; background-color: #36393f; color: #dcddde; padding: 20px; }
        .message { margin-bottom: 20px; display: flex; align-items: flex-start; }
        .avatar { border-radius: 50%; width: 40px; height: 40px; margin-right: 15px; }
        .header { display: flex; align-items: baseline; margin-bottom: 5px; }
        .username { font-weight: bold; color: #fff; margin-right: 10px; font-size: 1.1em; }
        .timestamp { color: #72767d; font-size: 0.8em; }
        .content { white-space: pre-wrap; line-height: 1.4; }
      </style>
    </head>
    <body>
      <h1>Transcript: ${escapeHtml(channel.name)}</h1>
      <hr style="border: 1px solid #4f545c; margin-bottom: 20px;" />
    `;

    for (const msg of sortedMessages) {
      if (msg.author.bot) continue;

      const avatarUrl =
        msg.author.displayAvatarURL({ extension: 'png', size: 64 }) ||
        'https://cdn.discordapp.com/embed/avatars/0.png';
      const time = msg.createdAt.toLocaleString();
      const content = escapeHtml(msg.content);

      html += `
      <div class="message">
        <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="avatar" />
        <div>
          <div class="header">
            <span class="username">${escapeHtml(msg.author.username)}</span>
            <span class="timestamp">${escapeHtml(time)}</span>
          </div>
          <div class="content">${content}</div>
        </div>
      </div>
      `;
    }

    html += `</body></html>`;
    return Buffer.from(html, 'utf-8');
  }

  private static async generateJsonTranscript(channel: TextChannel): Promise<any[]> {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = Array.from(messages.values()).reverse();

    const transcript = [];
    for (const msg of sortedMessages) {
      if (msg.author.bot) continue;

      transcript.push({
        authorId: msg.author.id,
        username: msg.author.username,
        avatar: msg.author.displayAvatarURL({ extension: 'png', size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
        content: msg.content,
        timestamp: msg.createdAt.toISOString(),
      });
    }

    return transcript;
  }

  public static async closeTicket(interaction: ButtonInteraction | any, channel: TextChannel) {
    await interaction.reply({ content: 'Closing ticket in 5 seconds...', ephemeral: false });

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { channelId: channel.id },
      });

      if (ticket) {
        const jsonTranscript = await this.generateJsonTranscript(channel);
        
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { 
            status: 'CLOSED', 
            closedAt: new Date(),
            transcript: jsonTranscript
          },
        });

        const settings = await prisma.ticketSettings.findUnique({
          where: { guildId: channel.guild.id },
        });

        if (settings?.transcriptChannelId) {
          const logChannel = channel.guild.channels.cache.get(
            settings.transcriptChannelId
          ) as TextChannel;
          if (logChannel) {
            const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
            const transcriptUrl = `${dashboardUrl}/dashboard/${channel.guild.id}/tickets/${ticket.id}`;
            
            const embed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('🎫 Ticket Closed')
              .setDescription(`Ticket \`${channel.name}\` was closed by ${interaction.user.toString()}`)
              .addFields(
                { name: 'Ticket ID', value: ticket.id, inline: false },
                { name: 'View Transcript', value: `[Click Here to View Transcript](${transcriptUrl})`, inline: false }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] });
          }
        }
      }

      setTimeout(async () => {
        try {
          await channel.delete('Ticket closed');
        } catch (e) {
          logger.error({ e, channelId: channel.id }, 'Failed to delete ticket channel');
        }
      }, 5000);
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Error closing ticket');
    }
  }

  public static async openTicket(interaction: ButtonInteraction) {
    const guild = interaction.guild!;
    const member = interaction.member as GuildMember;

    const existingTicket = await prisma.ticket.findFirst({
      where: { guildId: guild.id, creatorId: member.id, status: 'OPEN' },
    });

    if (existingTicket) {
      const channelExists = guild.channels.cache.has(existingTicket.channelId);
      
      if (!channelExists) {
        // Self-heal: The user manually deleted the channel, so close the ticket in DB
        await prisma.ticket.update({
          where: { id: existingTicket.id },
          data: { status: 'CLOSED', closedAt: new Date() }
        });
      } else {
        return interaction.reply({
          content: `📜 You already have an open petition: <#${existingTicket.channelId}>`,
          ephemeral: true,
        });
      }
    }

    const globalSettings = await prisma.ticketSettings.findUnique({
      where: { guildId: guild.id },
    });

    const panel = await prisma.ticketPanel.findFirst({
      where: { messageId: interaction.message.id },
    });

    const categoryId = panel?.categoryId || globalSettings?.categoryId;
    const supportRoleId = panel?.supportRoleId || globalSettings?.supportRoleId;

    await interaction.deferReply({ ephemeral: true });

    try {
      const permissionOverwrites: any[] = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];

      if (supportRoleId) {
        permissionOverwrites.push({
          id: supportRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `petition-${member.user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: categoryId || null,
        permissionOverwrites,
      });

      await prisma.ticket.create({
        data: {
          guildId: guild.id,
          channelId: ticketChannel.id,
          creatorId: member.id,
        },
      });

      const embed = new EmbedBuilder()
        .setTitle('📜 Petition Submitted')
        .setDescription(
          'The Steward will review your petition shortly.\nTo withdraw this petition, press the button below.'
        )
        .setColor('#d4af37');

      const closeBtn = new ButtonBuilder()
        .setCustomId('ticket_close_request')
        .setLabel('Withdraw Petition')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger);

      const claimBtn = new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('Claim Ticket')
        .setEmoji('🙋')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn, claimBtn);

      const pingMsg = supportRoleId
        ? `<@&${supportRoleId}> <@${member.id}>`
        : `<@${member.id}>`;
      await ticketChannel.send({ content: pingMsg, embeds: [embed], components: [row] });

      await interaction.followUp({
        content: `✅ Petition successfully filed: <#${ticketChannel.id}>`,
        ephemeral: true,
      });
    } catch (error) {
      logger.error({ error, guildId: guild.id }, 'Failed to open ticket');
      await interaction.followUp({
        content: 'Failed to create your ticket. Please contact an admin.',
        ephemeral: true,
      });
    }
  }

  public static async handleInteraction(interaction: ButtonInteraction) {
    if (interaction.customId === 'ticket_create') {
      await this.openTicket(interaction);
    } else if (interaction.customId === 'ticket_close_request') {
      const confirmBtn = new ButtonBuilder()
        .setCustomId('ticket_close_confirm')
        .setLabel('Confirm Close')
        .setStyle(ButtonStyle.Danger);

      const cancelBtn = new ButtonBuilder()
        .setCustomId('ticket_close_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);
      await interaction.reply({
        content: 'Are you sure you want to close this ticket?',
        components: [row],
      });
    } else if (interaction.customId === 'ticket_close_confirm') {
      await this.closeTicket(interaction, interaction.channel as TextChannel);
    } else if (interaction.customId === 'ticket_close_cancel') {
      await interaction.message.delete().catch(() => {});
    } else if (interaction.customId === 'ticket_claim') {
      await this.claimTicket(interaction, interaction.channel as TextChannel);
    }
  }

  public static async claimTicket(interaction: ButtonInteraction, channel: TextChannel) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { channelId: channel.id },
    });

    if (!ticket) return;
    if (ticket.claimerId) {
      return interaction.reply({ content: `Already claimed by <@${ticket.claimerId}>.`, ephemeral: true });
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { claimerId: interaction.user.id },
    });

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setDescription(`✅ This ticket has been claimed by ${interaction.user.toString()}. They will assist you shortly.`);
    
    await interaction.reply({ embeds: [embed] });
  }

  public static async addUser(channel: TextChannel, user: User) {
    await channel.permissionOverwrites.create(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  }

  public static async removeUser(channel: TextChannel, user: User) {
    await channel.permissionOverwrites.delete(user.id);
  }
}
