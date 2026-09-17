import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import { Command } from '../../types/index.js';
import { ManorTheme } from '../../utils/theme.js';

const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  play: 'Play a song or playlist from YouTube, Spotify, or Soundcloud.',
  skip: 'Skip the current track.',
  pause: 'Pause the music player.',
  resume: 'Resume the music player.',
  queue: 'View the current music queue.',
  nowplaying: 'See what is currently playing.',
  loop: 'Toggle looping for the track or queue.',
  volume: 'Change the volume of the music.',
  shuffle: 'Shuffle the current queue.',
  seek: 'Seek to a specific time in the current track.',
  stop: 'Stop the music and clear the queue.',
  remove: 'Remove a specific track from the queue.',
  disconnect: 'Disconnect the bot from the voice channel.',
  musicautoplay: 'Toggle autoplay to continuously play recommended tracks.',
};

const CATEGORIES: Record<string, { label: string; emoji: string; commands: string[] }> = {
  Economy: {
    label: 'Economy & Leveling',
    emoji: ManorTheme.emojis.money,
    commands: [
      'balance', 'daily', 'work', 'pay', 'shop', 'buy', 
      'inventory', 'profile', 'rank', 'leaderboard', 'achievements',
      'bj', 'cf', 'slots'
    ],
  },
  Moderation: {
    label: 'Moderation',
    emoji: ManorTheme.emojis.moderation,
    commands: [
      'ban', 'unban', 'softban', 'kick', 'clear', 'purge', 
      'lock', 'unlock', 'timeout', 'untimeout', 'warn', 
      'warnings', 'remove-warning', 'slowmode', 'nickname', 'serverstats'
    ],
  },
  Music: {
    label: 'Music',
    emoji: ManorTheme.emojis.music,
    commands: [
      'play', 'skip', 'pause', 'resume', 'queue', 'nowplaying', 
      'loop', 'volume', 'shuffle', 'seek', 'stop', 'remove', 'disconnect',
      'music', 'musicautoplay', '247'
    ],
  },
  Tickets: {
    label: 'Tickets',
    emoji: '🎫',
    commands: ['ticket', 'ticketpanel', 'ticketsetup'],
  },
  Utility: {
    label: 'Utility & Config',
    emoji: ManorTheme.emojis.bot,
    commands: [
      'ping', 'help', 'config', 'customcommand', 
      'giveaway', 'rolepanel', 'rolesetup', 'tempvc', 'automod', 'economyconfig'
    ],
  }
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription("Open the Manor's Archives to browse all available commands."),
  execute: async (interaction: ChatInputCommandInteraction) => {
    
    const embed = new EmbedBuilder()
      .setColor(ManorTheme.colors.primary)
      .setTitle(`${ManorTheme.emojis.bot} The Manor's Archives`)
      .setDescription(`Welcome to the archives. Please select a tome from the dropdown below to explore my capabilities.\n\n*Note: Many commands can also be triggered quickly using the \`s!\` prefix.*`)
      .setFooter({ text: 'The archives will close after 5 minutes of inactivity.' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Select a category...')
      .addOptions(
        Object.entries(CATEGORIES).map(([key, data]) => ({
          label: data.label,
          value: key,
          emoji: data.emoji,
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 5 * 60 * 1000, 
    });

    collector.on('collect', async (i: StringSelectMenuInteraction) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: `${ManorTheme.emojis.error} You may not flip the pages of a tome checked out by someone else.`,
          ephemeral: true,
        });
        return;
      }

      const selectedCategory = i.values[0];
      const categoryData = CATEGORIES[selectedCategory];

      if (!categoryData) {
        await i.deferUpdate();
        return;
      }

      let commandsToShow = categoryData.commands;

      if (selectedCategory === 'Moderation') {
        const adminRoleId = '1539506154047152138';
        const memberRoles = (interaction.member as any)?.roles?.cache;
        const isAdmin = 
          memberRoles?.has(adminRoleId) || 
          (interaction.member as any)?.permissions?.has(PermissionFlagsBits.Administrator);
        
        if (!isAdmin) {
          commandsToShow = commandsToShow.filter(cmd => cmd === 'nickname');
        }
      }

      const categoryEmbed = new EmbedBuilder()
        .setColor(ManorTheme.colors.primary)
        .setTitle(`${categoryData.emoji} ${categoryData.label}`)
        .setDescription(
          `Here are the commands found within this tome:\n\n` +
          commandsToShow.map(cmd => {
            const commandObj = (interaction.client as any).commands.get(cmd);
            let description = commandObj ? commandObj.data.description : '';
            if (!description && FALLBACK_DESCRIPTIONS[cmd]) {
              description = FALLBACK_DESCRIPTIONS[cmd];
            }
            return `- \`/${cmd}\` - *${description}*`;
          }).join('\n')
        )
        .setFooter({ text: `Total commands: ${commandsToShow.length}` });

      await i.update({
        embeds: [categoryEmbed],
        components: [row], 
      });
    });

    collector.on('end', async () => {
      const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true);
      const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabledMenu);

      await interaction.editReply({
        components: [disabledRow],
      }).catch(() => null); 
    });
  },
};

export default command;
