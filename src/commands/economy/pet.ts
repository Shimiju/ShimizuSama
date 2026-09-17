import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { PetService, PET_SPECIES } from '../../services/economy/PetService.js';
import { PetCardGenerator } from '../../services/image/PetCardGenerator.js';
import { logger } from '../../utils/logger.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Interact with your virtual pet companion.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('adopt')
        .setDescription('Adopt a new pet.')
        .addStringOption(option =>
          option.setName('name').setDescription('Name your new companion').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('species')
            .setDescription('Choose a species')
            .setRequired(true)
            .addChoices(
              { name: 'Dragon 🐉', value: 'Dragon' },
              { name: 'Wolf 🐺', value: 'Wolf' },
              { name: 'Phoenix 🦅', value: 'Phoenix' },
              { name: 'Griffin 🦁', value: 'Griffin' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check on your pet\'s stats and health.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('feed')
        .setDescription('Feed your pet to restore hunger and gain XP (Costs 10 Gold).')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('battle')
        .setDescription('Send your pet into battle to win gold and XP (Costs Energy).')
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'adopt') {
        const name = interaction.options.getString('name', true);
        const species = interaction.options.getString('species', true);
        
        await PetService.adoptPet(interaction.guildId, interaction.user.id, name, species);
        
        await interaction.reply({
          content: `🎉 Congratulations! You have successfully adopted a ${species} named **${name}**! Use \`/pet status\` to see them.`
        });
      }
      else if (subcommand === 'status') {
        await interaction.deferReply();
        
        let pet = await PetService.getPet(interaction.guildId, interaction.user.id);
        if (!pet) {
          await interaction.editReply("You don't have a pet yet! Use `/pet adopt` to get one.");
          return;
        }

        pet = await PetService.processTimeTick(pet);
        
        const buffer = await PetCardGenerator.generate(pet, interaction.user);
        const attachment = new AttachmentBuilder(buffer, { name: 'pet-status.png' });
        
        await interaction.editReply({ files: [attachment] });
      }
      else if (subcommand === 'feed') {
        const result = await PetService.feedPet(interaction.guildId, interaction.user.id);
        
        let reply = `🥩 You fed **${result.petName}** for 10 Manor Gold!\nThey restored **${result.hungerRestored}** Hunger and gained **${result.xpGained}** XP!`;
        if (result.leveledUp) {
          reply += `\n🎉 **LEVEL UP!** ${result.petName} is now Level ${result.newLevel}!`;
        }
        
        await interaction.reply({ content: reply });
      }
      else if (subcommand === 'battle') {
        const result = await PetService.battlePet(interaction.guildId, interaction.user.id);
        
        const embed = new EmbedBuilder()
          .setTitle(`⚔️ ${result.petName}'s Battle`)
          .setColor(result.isWin ? '#9ece6a' : '#f7768e');
          
        if (result.isWin) {
          embed.setDescription(`**Victory!** ${result.petName} defeated the monster!`);
          embed.addFields(
            { name: 'Rewards', value: `🪙 ${result.goldWon} Gold\n✨ ${result.xpGained} XP` },
            { name: 'Cost', value: `⚡ -${result.energyLost} Energy\n🍖 -${result.hungerLost} Hunger` }
          );
          if (result.leveledUp) {
            embed.addFields({ name: '🎉 Level Up!', value: `${result.petName} is now Level ${result.newLevel}!` });
          }
        } else {
          embed.setDescription(`**Defeat...** ${result.petName} fought bravely but had to retreat.`);
          embed.addFields(
            { name: 'Rewards', value: `None` },
            { name: 'Cost', value: `⚡ -${result.energyLost} Energy\n🍖 -${result.hungerLost} Hunger` }
          );
        }
        
        await interaction.reply({ embeds: [embed] });
      }
    } catch (error: any) {
      if (error.message && (
        error.message.includes('already have a pet') ||
        error.message.includes('don\'t have a pet') ||
        error.message.includes('Manor Gold') ||
        error.message.includes('full') ||
        error.message.includes('tired') ||
        error.message.includes('hungry')
      )) {
        if (interaction.deferred) {
          await interaction.editReply(error.message);
        } else {
          await interaction.reply({ content: error.message, ephemeral: true });
        }
      } else {
        logger.error({ err: error.message, stack: error.stack, guildId: interaction.guildId, userId: interaction.user.id }, 'Error in /pet command');
        if (interaction.deferred) {
          await interaction.editReply('Failed to process pet command.');
        } else {
          await interaction.reply({ content: 'Failed to process pet command.', ephemeral: true });
        }
      }
    }
  },
};

export default command;
