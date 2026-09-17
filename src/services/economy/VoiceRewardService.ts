import { VoiceState } from 'discord.js';
import { EconomyService } from './EconomyService.js';
import { logger } from '../../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import { ManorTheme } from '../../utils/theme.js';

export class VoiceRewardService {
  // Tracks user ID -> timestamp they joined
  private static activeSessions: Map<string, number> = new Map();

  // Configuration
  private static readonly COINS_PER_MINUTE = 5; // Earn 5 Manor Gold every minute
  private static readonly MIN_MINUTES = 1; // Must spend at least 1 minute

  public static async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    if (newState.member?.user.bot) return;

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    // Joined a voice channel
    if (!oldChannel && newChannel) {
      this.activeSessions.set(newState.id, Date.now());
      return;
    }

    // Left a voice channel
    if (oldChannel && !newChannel) {
      const joinTime = this.activeSessions.get(newState.id);
      this.activeSessions.delete(newState.id);

      if (joinTime) {
        await this.processReward(oldState, joinTime);
      }
      return;
    }
  }

  private static async processReward(state: VoiceState, joinTime: number) {
    if (!state.guild || !state.member) return;

    const timeSpentMs = Date.now() - joinTime;
    const minutesSpent = Math.floor(timeSpentMs / (1000 * 60));

    if (minutesSpent >= this.MIN_MINUTES) {
      const rewardAmount = minutesSpent * this.COINS_PER_MINUTE;

      try {
        await EconomyService.addBalance(
          state.guild.id,
          state.member.id,
          rewardAmount,
          'VOICE_REWARD'
        );

        // Optionally send a DM or message
        try {
          const embed = new EmbedBuilder()
            .setColor(ManorTheme.colors.success)
            .setAuthor({ name: "The Manor's Treasury" })
            .setDescription(
              `Thank you for spending time in the lounges! You've been rewarded **${rewardAmount} Manor Gold** (🪙) for your ${minutesSpent} minute stay.`
            );
          
          await state.member.send({ embeds: [embed] });
        } catch (dmError) {
          // Ignore if user has DMs disabled
        }

      } catch (error) {
        logger.error({ err: error }, 'Failed to process voice rewards');
      }
    }
  }
}
