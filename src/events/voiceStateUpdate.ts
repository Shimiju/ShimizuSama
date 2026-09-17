import { Events, VoiceState } from 'discord.js';
import { Event } from '../types/index.js';
import { TempVCService } from '../services/tempvc/TempVCService.js';
import { VoiceRewardService } from '../services/economy/VoiceRewardService.js';
import { logger } from '../utils/logger.js';

const event: Event<Events.VoiceStateUpdate> = {
  name: Events.VoiceStateUpdate,
  execute: async (oldState: VoiceState, newState: VoiceState) => {
    try {
      await TempVCService.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error({ err: error }, 'Error in voiceStateUpdate event (TempVC)');
    }

    try {
      await VoiceRewardService.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error({ err: error }, 'Error in voiceStateUpdate event (VoiceRewards)');
    }
  },
};

export default event;
