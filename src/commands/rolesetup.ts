import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} from 'discord.js';
import { Command } from '../types/index.js';
import { ManorTheme } from '../utils/theme.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rolesetup')
    .setDescription('Spawns the premium Manor-themed Interactive Registration panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const channel = interaction.channel as TextChannel;

    if (!channel) {
      await interaction.followUp('❌ This command must be used in a text channel.');
      return;
    }

    // Role Configurations
    const roleConfigs = {
      titles: [
        { name: 'Lord', color: '#8a0303' },
        { name: 'Lady', color: '#8a0303' }
      ],
      armory: [
        { name: 'Valorant', color: '#fa4454' },
        { name: 'League of Legends', color: '#0ac8b9' },
        { name: 'Minecraft', color: '#5c9636' },
        { name: 'osu!', color: '#ff66aa' },
        { name: 'Tekken', color: '#cccccc' },
        { name: 'Genshin Impact', color: '#ffffff' },
        { name: 'Roblox', color: '#eeeeee' }
      ],
      notices: [
        { name: 'The Herald', color: '#d4af37' },
        { name: 'Manor Laws', color: '#d4af37' },
        { name: 'The Gazette', color: '#ff0000' }
      ]
    };

    // Helper to get or create roles
    const getOrCreateRoles = async (categoryRoles: {name: string, color: any}[]) => {
      const roleMap: Record<string, string> = {};
      for (const rc of categoryRoles) {
        let role = guild.roles.cache.find(r => r.name === rc.name);
        if (!role) {
          try {
            role = await guild.roles.create({
              name: rc.name,
              color: rc.color,
              reason: 'Manor Registration Setup'
            });
          } catch (e) {
            console.error(`Failed to create role ${rc.name}`);
          }
        }
        if (role) roleMap[rc.name] = role.id;
      }
      return roleMap;
    };

    const titleRoles = await getOrCreateRoles(roleConfigs.titles);
    const armoryRoles = await getOrCreateRoles(roleConfigs.armory);
    const noticeRoles = await getOrCreateRoles(roleConfigs.notices);

    // Build the Main Embed
    const embed = new EmbedBuilder()
      .setAuthor({ name: "The Manor Registration", iconURL: guild.iconURL() || undefined })
      .setColor(ManorTheme.colors.primary)
      .setDescription(
        '┌─⋆⋅✧⋅⋆─┐\n' +
        '**Welcome to The Manor!**\n\n' +
        'Please select your roles below to customize your experience within the estate.\n' +
        '└─⋆⋅✧⋅⋆─┘\n\n' +
        '🍷 **The Titles:** Choose your residency status and pronoun alternatives.\n' +
        '⚔️ **The Armory:** Select the game districts you wish to participate in.\n' +
        '📜 **The Notice Board:** Opt-in to specific pings and announcements.\n' +
        `🔴 **The Gazette:** Get pinged for streams in <#1540672550844239953>.`
      )
      .setImage('https://i.imgur.com/8m5Uj6q.png')
      .setFooter({ text: 'Select multiple roles by clicking the dropdowns below.' });

    // Build Select Menus
    const buildSelect = (customId: string, placeholder: string, roles: Record<string, string>, emojiMap: Record<string, string>, max: number) => {
      const options = Object.entries(roles).map(([name, id]) => ({
        label: name,
        value: id,
        emoji: emojiMap[name] || '⚜️'
      }));

      if (options.length === 0) return null;

      return new StringSelectMenuBuilder()
        .setCustomId(`manorroles_${customId}`)
        .setPlaceholder(placeholder)
        .setMinValues(0)
        .setMaxValues(max)
        .addOptions(options);
    };

    const titleSelect = buildSelect('titles', 'Select your Title...', titleRoles, {
      'Lord': '🍷', 'Lady': '🍷'
    }, 1);
    
    const armorySelect = buildSelect('armory', 'Select your Game Districts...', armoryRoles, {
      'Valorant': '<:valo:1540616676154802237>', 'League of Legends': '<:lol:1540615932693717022>', 'Minecraft': '<:minecraft:1540617308832268399>', 'osu!': '<:osu:1540615602907914270>', 
      'Tekken': '<:tekken:1540615016888147988>', 'Genshin Impact': '<:genshin:1540617285264216127>', 'Roblox': '<:roblox:1540617628710600837>'
    }, Object.keys(armoryRoles).length);

    const noticeSelect = buildSelect('notices', 'Select your Notice Pings...', noticeRoles, {
      'The Herald': '📯', 'Manor Laws': '📜', 'The Gazette': '🔴'
    }, Object.keys(noticeRoles).length);

    const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
    if (titleSelect) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(titleSelect));
    if (armorySelect) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(armorySelect));
    if (noticeSelect) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(noticeSelect));

    await channel.send({ embeds: [embed], components });

    await interaction.followUp('✅ **Manor Registration successfully spawned!** Missing roles were automatically created.');
  }
};

export default command;
