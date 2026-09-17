import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types/index.js';
import { ManorTheme } from '../utils/theme.js';
import { musicService } from '../services/music/MusicService.js';

// Global Set to keep track of which guilds have 24/7 enabled in this session
const enabledGuilds = new Set<string>();

// The silent background loop that keeps the bot in the channel 
// without editing a single line of the core music service files!
const interval = setInterval(() => {
  for (const guildId of enabledGuilds) {
    const player = musicService.getPlayer(guildId);
    if (player) {
      // The idleTimer is private in GuildMusicPlayer, so we bypass TypeScript to clear it
      // This prevents the player.destroy() call from ever executing on an empty queue!
      if ((player as any).idleTimer) {
        clearTimeout((player as any).idleTimer);
        (player as any).idleTimer = null;
      }
    } else {
      // If the player is completely gone (e.g. they manually used s!disconnect),
      // we remove them from the 24/7 active set for memory safety.
      enabledGuilds.delete(guildId);
    }
  }
}, 60 * 1000); // Runs every 60 seconds

// Allow the Node process to exit gracefully (e.g., during deploy scripts)
interval.unref();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggles 24/7 mode to keep the musicians in the parlor indefinitely.'),
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
              `${ManorTheme.emojis.error} I cannot set up 24/7 mode if the musicians are not even in a parlor.`
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (enabledGuilds.has(guildId)) {
      enabledGuilds.delete(guildId);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.info)
            .setDescription(
              `${ManorTheme.emojis.bot} **24/7 Mode Disabled**: The musicians will now leave naturally after 5 minutes of silence.`
            ),
        ],
      });
    } else {
      enabledGuilds.add(guildId);
      
      // Clear it instantly just in case the 5 minute timer is already close to triggering
      if ((player as any).idleTimer) {
        clearTimeout((player as any).idleTimer);
        (player as any).idleTimer = null;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(ManorTheme.colors.success)
            .setDescription(
              `${ManorTheme.emojis.music} **24/7 Mode Enabled**: The musicians will stay in the parlor indefinitely until you dismiss them with \`s!disconnect\`.`
            ),
        ],
      });
    }
  },
};

export default command;
