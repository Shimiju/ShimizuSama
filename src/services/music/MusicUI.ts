import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ButtonInteraction, 
  TextBasedChannel,
  Message,
  MessageFlags,
  AttachmentBuilder
} from 'discord.js';
import { GuildMusicPlayer } from './GuildMusicPlayer.js';
import { MusicTrack } from '../../types/music.js';
import { musicService } from './MusicService.js';
import { logger } from '../../utils/logger.js';

export class MusicUI {
  public static async sendNowPlaying(
    channel: TextBasedChannel, 
    track: MusicTrack, 
    player: GuildMusicPlayer
  ): Promise<Message | null> {
    const embed = new EmbedBuilder()
      .setAuthor({ name: "📻 The Manor Gramophone" })
      .setTitle(`🎻 ${track.track.info.title}`)
      .setURL(track.track.info.uri || null)
      .setDescription(
        `┌─⋆⋅✧⋅⋆─┐\n` +
        `**Maestro:** ${track.track.info.author}\n` +
        `**Requested by:** <@${track.requesterId}>\n` +
        `└─⋆⋅✧⋅⋆─┘`
      )
      .setColor(0xd4af37); // Manor Gold
      
    // Try to get a thumbnail if it's YouTube
    let attachment: AttachmentBuilder | null = null;
    if (track.track.info.sourceName === 'youtube' && track.track.info.identifier) {
      const url = `https://i.ytimg.com/vi/${track.track.info.identifier}/hqdefault.jpg`;
      attachment = new AttachmentBuilder(url, { name: 'thumbnail.jpg' });
      embed.setImage('attachment://thumbnail.jpg');
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music_playpause').setEmoji('⏯️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary)
    );

    try {
      if ('send' in channel) {
        return await channel.send({ 
          embeds: [embed], 
          components: [row],
          files: attachment ? [attachment] : []
        });
      }
    } catch (err) {
      logger.warn('Failed to send Music UI');
    }
    return null;
  }

  public static async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guildId) return;
    const player = musicService.getPlayer(interaction.guildId);

    if (!player) {
      await interaction.reply({ content: 'No music is currently playing in this server.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const action = interaction.customId.split('_')[1];
      
      switch (action) {
        case 'playpause':
          const isPaused = player.player.paused;
          await player.player.setPaused(!isPaused);
          await interaction.reply({ content: !isPaused ? '⏸️ The Gramophone has been paused.' : '▶️ The Gramophone has resumed playing.', flags: MessageFlags.Ephemeral });
          break;
        case 'skip':
          await player.skip();
          await interaction.reply({ content: '⏭️ Skipped to the next performance.', flags: MessageFlags.Ephemeral });
          break;
        case 'stop':
          await player.stop();
          await interaction.reply({ content: '⏹️ The Gramophone has been silenced and the queue cleared.', flags: MessageFlags.Ephemeral });
          break;
        case 'shuffle':
          player.queue.shuffle();
          await interaction.reply({ content: '🔀 The musical arrangement has been shuffled.', flags: MessageFlags.Ephemeral });
          break;
        default:
          await interaction.deferUpdate();
      }
    } catch (error) {
      logger.error({ err: error }, 'Error handling music UI interaction');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred while interacting with the music player.', flags: MessageFlags.Ephemeral });
      }
    }
  }
}
