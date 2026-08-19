import { Events, Message } from 'discord.js';
import { Event } from '../types/index.js';
import { AutoModEngine } from '../services/automod/AutoModEngine.js';
import { CustomCommandEngine } from '../services/customCommands/CustomCommandEngine.js';
import { LevelingService } from '../services/economy/LevelingService.js';
import { logger } from '../utils/logger.js';
import { PrefixAdapter } from '../utils/PrefixAdapter.js';
import { prisma } from '../database/prisma.js';
import { CacheService } from '../services/cacheService.js';
import musicCommand from '../commands/music.js';

const DEFAULT_PREFIX = 's!';
const MUSIC_ALIASES = [
  'play',
  'pause',
  'resume',
  'skip',
  'stop',
  'queue',
  'disconnect',
  'nowplaying',
  'shuffle',
  'clear',
  'loop',
  'volume',
  'seek',
  'remove',
];

async function getPrefix(guildId: string): Promise<string> {
  const cacheKey = `guild:settings:${guildId}`;
  let settings = await CacheService.get<any>(cacheKey);

  if (!settings) {
    settings = await prisma.guildSettings.findUnique({ where: { guildId } });
    if (settings) await CacheService.set(cacheKey, settings, 300);
  }

  return settings?.prefix || DEFAULT_PREFIX;
}

export const event: Event<Events.MessageCreate> = {
  name: Events.MessageCreate,
  execute: async (message: Message) => {
    try {
      if (message.author.bot) return;

      const prefix = message.guild ? await getPrefix(message.guild.id) : DEFAULT_PREFIX;

      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        if (commandName && MUSIC_ALIASES.includes(commandName)) {
          const query = args.join(' ');

          let position = null;
          let level = null;
          let seconds = null;
          let mode = null;

          if (commandName === 'remove') position = args[0];
          if (commandName === 'volume') level = args[0];
          if (commandName === 'seek') seconds = args[0];
          if (commandName === 'loop') {
            const input = args[0]?.toLowerCase();
            if (input === 'track' || input === 'queue') mode = input.toUpperCase();
            else mode = 'NONE';
          }

          const adapterArgs: Record<string, any> = { query, position, level, seconds, mode };
          const fakeInteraction = new PrefixAdapter(message, 'music', commandName, adapterArgs);

          await musicCommand.execute(fakeInteraction as any);
          return;
        }
      }

      await AutoModEngine.handleMessage(message);

      await LevelingService.handleMessage(message);

      await CustomCommandEngine.handleMessage(message);
    } catch (error) {
      logger.error({ error }, 'Error in messageCreate event');
    }
  },
};

export default event;
