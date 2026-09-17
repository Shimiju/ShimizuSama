import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types/index.js';
import { ManorTheme } from '../utils/theme.js';
import { musicService } from '../services/music/MusicService.js';
import { PlayerState, MusicTrack } from '../types/music.js';

// Global Set to keep track of which guilds have Autoplay enabled
const autoplayGuilds = new Set<string>();
const processingGuilds = new Set<string>();

// The Silent Watcher loop for Autoplay
const interval = setInterval(async () => {
  for (const guildId of autoplayGuilds) {
    if (processingGuilds.has(guildId)) continue;

    const player = musicService.getPlayer(guildId);
    if (!player) {
      // Player was completely destroyed (e.g. s!disconnect)
      autoplayGuilds.delete(guildId);
      continue;
    }

    // Only inject a song if the player ran out of songs and went IDLE
    if (player.state === PlayerState.IDLE) {
      const history: MusicTrack[] = (player.queue as any).history || [];
      
      // If history is empty, it means the queue was manually cleared/stopped, or never started
      if (history.length === 0) continue;

      processingGuilds.add(guildId);

      try {
        const lastTrack = history[history.length - 1];
        const author = lastTrack.track.info.author;
        const title = lastTrack.track.info.title;

        // Perform a background search on YouTube using the title and author to find same-genre related tracks
        const searchResults = await musicService.resolve(`ytsearch:${author} ${title}`);
        
        if (searchResults && searchResults.length > 0) {
          // Filter out tracks we've already played
          const historyUris = new Set(history.map((t) => t.track.info.uri));
          const validTracks = searchResults.filter((t) => !historyUris.has(t.info.uri));

          if (validTracks.length > 0) {
            // Pick a random track from the recommended list
            const recommended = validTracks[Math.floor(Math.random() * validTracks.length)];

            player.queue.add({
              track: recommended,
              requesterId: musicService.client.user!.id, // The bot itself is the requester
              textChannelId: lastTrack.textChannelId,
            });

            // Trigger playback. This natively clears the 5-minute death timer!
            await player.playNext();
            
            // Optionally notify the channel
            try {
              const channel = await musicService.client.channels.fetch(lastTrack.textChannelId).catch(() => null);
              if (channel && channel.isTextBased() && 'send' in channel) {
                await channel.send({
                  embeds: [
                    new EmbedBuilder()
                      .setColor(ManorTheme.colors.primary)
                      .setDescription(`${ManorTheme.emojis.music} **Autoplay**: The musicians have chosen to perform **${recommended.info.title}** next.`)
                  ]
                }).catch(() => null);
              }
            } catch (e) {
              // Ignore channel send errors
            }
          }
        }
      } catch (err) {
        console.error(`[Autoplay] Failed to find a recommended track for ${guildId}`, err);
      } finally {
        // Wait a few seconds before unblocking to ensure PlayerState changes to PLAYING
        setTimeout(() => processingGuilds.delete(guildId), 5000);
      }
    }
  }
}, 5000); // Check every 5 seconds

// Allow the Node process to exit gracefully (e.g., during deploy scripts)
interval.unref();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggles Autoplay. The musicians will choose a related song when the queue ends.'),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const player = musicService.getPlayer(guildId);

    if (!player) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.error)
            .setDescription(
              `${ManorTheme.emojis.error} I cannot enable Autoplay if the musicians are not even in a parlor.`
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (autoplayGuilds.has(guildId)) {
      autoplayGuilds.delete(guildId);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.info)
            .setDescription(
              `${ManorTheme.emojis.bot} **Autoplay Disabled**: The musicians will stop playing when the queue is finished.`
            ),
        ],
      });
    } else {
      autoplayGuilds.add(guildId);
      
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.success)
            .setDescription(
              `${ManorTheme.emojis.music} **Autoplay Enabled**: When the queue runs dry, the musicians will automatically select related songs to keep the parlor lively.`
            ),
        ],
      });
    }
  },
};

export default command;
