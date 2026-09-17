import { 
  ChannelType, 
  VoiceState, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
  OverwriteType,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';

export class TempVCService {
  /**
   * Generates the TempVoice Interface UI
   */
  public static getInterfaceUI() {
    const embed = new EmbedBuilder()
      .setAuthor({ name: "The Manor's Private Lounges" })
      .setDescription(
        '┌-⋆⋅✧⋅⋆-┐\n' +
        'This **interface** can be used to manage temporary voice channels. ' +
        'More options are available with **/voice** commands.\n' +
        '└-⋆⋅✧⋅⋆-┘\n\n' +
        '`🏷️ NAME` `👥 LIMIT` `🔒 PRIVACY` `⏳ WAITING ROOM` `💬 CHAT`\n' +
        '`🟢 TRUST` `🔴 UNTRUST` `📨 INVITE` `👢 KICK` `🌍 REGION`\n' +
        '`⛔ BLOCK` `⭕ UNBLOCK` `👑 CLAIM` `📤 TRANSFER` `🗑️ DELETE`\n\n' +
        '**Press the buttons below to use the interface**'
      )
      .setColor(0xd4af37); // Manor Gold

    // Row 1
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tempvc_rename').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_privacy').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_waitroom').setEmoji('⏳').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_chat').setEmoji('💬').setStyle(ButtonStyle.Secondary)
    );

    // Row 2
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tempvc_trust').setEmoji('🟢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_untrust').setEmoji('🔴').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_invite').setEmoji('📨').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_kick').setEmoji('👢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_region').setEmoji('🌍').setStyle(ButtonStyle.Secondary)
    );
    
    // Row 3
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tempvc_block').setEmoji('⛔').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_unblock').setEmoji('⭕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_claim').setEmoji('👑').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_transfer').setEmoji('📤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tempvc_delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row1, row2, row3] };
  }

  /**
   * Handle VoiceStateUpdate for joining/leaving
   */
  public static async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    if (newState.member?.user.bot) return;

    const guildId = newState.guild.id;

    // Fetch settings only if joining a channel
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      const settings = await prisma.tempVCSettings.findUnique({ where: { guildId } });
      
      if (settings && newState.channelId === settings.joinChannelId) {
        await this.createTempVC(newState, settings);
      }
    }

    // Handle leaving a channel
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const channel = oldState.channel;
      if (!channel) return;

      // Only check if empty
      if (channel.members.size === 0) {
        const tempVC = await prisma.tempVoiceChannel.findUnique({
          where: { channelId: oldState.channelId }
        });

        if (tempVC) {
          try {
            await channel.delete('Temp VC empty');
            await prisma.tempVoiceChannel.delete({ where: { channelId: oldState.channelId } });
          } catch (error) {
            logger.error({ err: error }, 'Failed to delete Temp VC');
          }
        }
      }
    }
  }

  private static async createTempVC(newState: VoiceState, settings: { joinChannelId: string, categoryId: string }) {
    const member = newState.member;
    const guild = newState.guild;
    if (!member) return;

    try {
      const joinChannel = guild.channels.cache.get(settings.joinChannelId);
      
      const newChannel = await guild.channels.create({
        name: `╰┈➤ ${member.displayName}'s Lounge`,
        type: ChannelType.GuildVoice,
        parent: joinChannel?.parentId || null,
        permissionOverwrites: [
          {
            id: member.id,
            type: OverwriteType.Member,
            allow: ['ManageChannels', 'ManageRoles', 'MoveMembers'],
          },
        ],
      });

      // Move user to new channel
      await member.voice.setChannel(newChannel);

      // Save to database
      await prisma.tempVoiceChannel.create({
        data: {
          guildId: guild.id,
          channelId: newChannel.id,
          ownerId: member.id,
        }
      });

      // Send the UI interface into the Voice Channel's text chat
      await newChannel.send({
        content: `<@${member.id}> Welcome in your Temporary Channel!`,
        ...this.getInterfaceUI()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to create Temp VC');
      // If we fail to create it, try to disconnect them from the join channel
      try {
        await member.voice.disconnect();
      } catch (e) {}
    }
  }
  
  public static async handleInteraction(interaction: ButtonInteraction) {
    const channel = interaction.channel as VoiceChannel;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: 'This interface only works inside the Temporary Voice Channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    const tempVC = await prisma.tempVoiceChannel.findUnique({ where: { channelId: channel.id } });
    if (!tempVC) {
      await interaction.reply({ content: 'This is not a recognized Temporary Voice Channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Allow CLAIM button for non-owners, but restrict everything else
    if (interaction.user.id !== tempVC.ownerId && interaction.customId !== 'tempvc_claim') {
      await interaction.reply({ content: 'Only the channel owner can use these controls.', flags: MessageFlags.Ephemeral });
      return;
    }

    const action = interaction.customId.replace('tempvc_', '');

    try {
      switch (action) {
        case 'delete':
          await interaction.reply({ content: '🗑️ Deleting channel...', flags: MessageFlags.Ephemeral });
          await channel.delete('Owner deleted Temp VC');
          await prisma.tempVoiceChannel.delete({ where: { channelId: channel.id } });
          break;

        case 'privacy':
          const currentOverwrites = channel.permissionOverwrites.cache.get(interaction.guildId!);
          const isLocked = currentOverwrites?.deny.has('Connect');
          
          await channel.permissionOverwrites.edit(interaction.guildId!, {
            Connect: isLocked ? null : false // null resets it, false denies it
          });
          
          await interaction.reply({ 
            content: isLocked ? '🔓 Channel Unlocked! Anyone can join.' : '🔒 Channel Locked! Only trusted users can join.', 
            flags: MessageFlags.Ephemeral 
          });
          break;

        case 'chat':
          const chatOverwrites = channel.permissionOverwrites.cache.get(interaction.guildId!);
          const isChatLocked = chatOverwrites?.deny.has('SendMessages');
          
          await channel.permissionOverwrites.edit(interaction.guildId!, {
            SendMessages: isChatLocked ? null : false
          });
          
          await interaction.reply({ 
            content: isChatLocked ? '💬 Text Chat Unlocked!' : '🔇 Text Chat Locked!', 
            flags: MessageFlags.Ephemeral 
          });
          break;

        case 'claim':
          if (interaction.user.id === tempVC.ownerId) {
            await interaction.reply({ content: 'You already own this channel.', flags: MessageFlags.Ephemeral });
            return;
          }
          if (channel.members.has(tempVC.ownerId)) {
            await interaction.reply({ content: 'The current owner is still in the channel.', flags: MessageFlags.Ephemeral });
            return;
          }
          await prisma.tempVoiceChannel.update({
            where: { channelId: channel.id },
            data: { ownerId: interaction.user.id }
          });
          await interaction.reply({ content: '👑 You are now the owner of this channel!', flags: MessageFlags.Ephemeral });
          break;

        case 'rename':
          const renameModal = new ModalBuilder()
            .setCustomId('tempvcmodal_rename')
            .setTitle('Rename Channel');
          renameModal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('new_name').setLabel('New Channel Name').setStyle(TextInputStyle.Short).setRequired(true)
            )
          );
          await interaction.showModal(renameModal);
          break;

        case 'limit':
          const limitModal = new ModalBuilder()
            .setCustomId('tempvcmodal_limit')
            .setTitle('Set User Limit');
          limitModal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('limit').setLabel('Limit (0 to remove limit)').setStyle(TextInputStyle.Short).setRequired(true)
            )
          );
          await interaction.showModal(limitModal);
          break;

        case 'region':
          const regions = [
            { label: 'Automatic (Default)', value: 'null' },
            { label: 'US East', value: 'us-east' },
            { label: 'US Central', value: 'us-central' },
            { label: 'US South', value: 'us-south' },
            { label: 'US West', value: 'us-west' },
            { label: 'Europe', value: 'rotterdam' }, // Note: rotterdam/europe
            { label: 'Brazil', value: 'brazil' },
            { label: 'Hong Kong', value: 'hongkong' },
            { label: 'India', value: 'india' },
            { label: 'Japan', value: 'japan' },
            { label: 'Singapore', value: 'singapore' },
            { label: 'Sydney', value: 'sydney' },
            { label: 'South Africa', value: 'southafrica' }
          ];

          const regionSelect = new StringSelectMenuBuilder()
            .setCustomId('tempvcselect_region')
            .setPlaceholder('Select Voice Channel Region')
            .addOptions(regions);
          
          const regionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(regionSelect);
          
          await interaction.reply({
            content: 'Please select a new **Server Region** for this voice channel:',
            components: [regionRow],
            flags: MessageFlags.Ephemeral
          });
          break;

        case 'kick':
        case 'transfer':
          const membersInChannel = Array.from(channel.members.values()).filter(m => !m.user.bot);
          if (membersInChannel.length === 0) {
            await interaction.reply({ content: `There is no one else in the channel to ${action}.`, flags: MessageFlags.Ephemeral });
            return;
          }

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`tempvcselect_${action}`)
            .setPlaceholder(`Select a user to ${action}`)
            .addOptions(
              membersInChannel.map(m => ({
                label: m.user.tag,
                value: m.id,
              }))
            );
          
          const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
          
          await interaction.reply({
            content: `Please select a user to **${action}**:`,
            components: [actionRow],
            flags: MessageFlags.Ephemeral
          });
          break;

        case 'trust':
        case 'untrust':
        case 'invite':
        case 'block':
        case 'unblock':
          const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`tempvcselect_${action}`)
            .setPlaceholder(`Select a user to ${action}`)
            .setMaxValues(1);
          
          const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);
          
          await interaction.reply({
            content: `Please select a user to **${action}**:`,
            components: [row],
            flags: MessageFlags.Ephemeral
          });
          break;

        default:
          await interaction.reply({ content: 'This button is still under construction! Check back soon.', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to handle TempVC action: ${action}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred while processing this action.', flags: MessageFlags.Ephemeral });
      }
    }
  }

  public static async handleModalSubmit(interaction: ModalSubmitInteraction) {
    const action = interaction.customId.replace('tempvcmodal_', '');
    const channel = interaction.channel as VoiceChannel;
    
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    try {
      switch (action) {
        case 'rename':
          const newName = interaction.fields.getTextInputValue('new_name');
          const formattedName = newName.startsWith('╰┈➤') ? newName : `╰┈➤ ${newName}`;
          await channel.setName(formattedName);
          await interaction.reply({ content: `✅ Channel renamed to **${formattedName}**!`, flags: MessageFlags.Ephemeral });
          break;

        case 'limit':
          const limitStr = interaction.fields.getTextInputValue('limit');
          const limit = parseInt(limitStr);
          if (isNaN(limit) || limit < 0 || limit > 99) {
            await interaction.reply({ content: '❌ Limit must be a number between 0 and 99.', flags: MessageFlags.Ephemeral });
            return;
          }
          await channel.setUserLimit(limit);
          await interaction.reply({ content: limit === 0 ? '🔓 User limit removed!' : `👥 User limit set to **${limit}**!`, flags: MessageFlags.Ephemeral });
          break;

        default:
          await interaction.reply({ content: 'Action not implemented yet.', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to handle TempVC modal: ${action}`);
      if (!interaction.replied) {
        await interaction.reply({ content: 'An error occurred while processing this action.', flags: MessageFlags.Ephemeral });
      }
    }
  }

  public static async handleUserSelect(interaction: UserSelectMenuInteraction | StringSelectMenuInteraction) {
    const action = interaction.customId.replace('tempvcselect_', '');
    const channel = interaction.channel as VoiceChannel;
    
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    try {
      const selectedValue = interaction.values[0];

      if (action === 'region') {
        const region = selectedValue === 'null' ? null : selectedValue;
        await channel.setRTCRegion(region);
        await interaction.reply({ content: `🌍 Voice channel region changed to **${region || 'Automatic'}**.`, flags: MessageFlags.Ephemeral });
        return;
      }

      let targetMember;
      try {
        targetMember = await interaction.guild?.members.fetch(selectedValue);
      } catch (e) {
        await interaction.reply({ content: '❌ Could not find that user in the server.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (!targetMember) return;

      if (action === 'trust') {
        await channel.permissionOverwrites.edit(targetMember.id, { Connect: true });
        await interaction.reply({ content: `✅ **${targetMember.user.tag}** is now trusted and can join the locked channel.`, flags: MessageFlags.Ephemeral });
      } else if (action === 'untrust') {
        await channel.permissionOverwrites.delete(targetMember.id);
        await interaction.reply({ content: `❌ **${targetMember.user.tag}** is no longer trusted.`, flags: MessageFlags.Ephemeral });
      } else if (action === 'block') {
        await channel.permissionOverwrites.edit(targetMember.id, { Connect: false });
        if (targetMember.voice.channelId === channel.id) {
          await targetMember.voice.disconnect(); // Kick them out immediately
        }
        await interaction.reply({ content: `⛔ **${targetMember.user.tag}** has been blocked from this channel.`, flags: MessageFlags.Ephemeral });
      } else if (action === 'unblock') {
        await channel.permissionOverwrites.delete(targetMember.id);
        await interaction.reply({ content: `⭕ **${targetMember.user.tag}** has been unblocked.`, flags: MessageFlags.Ephemeral });
      } else if (action === 'kick') {
        if (targetMember.voice.channelId === channel.id) {
          await targetMember.voice.disconnect();
          await interaction.reply({ content: `👢 **${targetMember.user.tag}** was kicked from the channel.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `❌ **${targetMember.user.tag}** is not in the channel.`, flags: MessageFlags.Ephemeral });
        }
      } else if (action === 'transfer') {
        await prisma.tempVoiceChannel.update({
          where: { channelId: channel.id },
          data: { ownerId: targetMember.id }
        });
        await interaction.reply({ content: `👑 Transferred channel ownership to **${targetMember.user.tag}**.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'Action not implemented yet.', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to handle TempVC user select: ${action}`);
      if (!interaction.replied) {
        await interaction.reply({ content: 'An error occurred while processing this action.', flags: MessageFlags.Ephemeral });
      }
    }
  }
}
