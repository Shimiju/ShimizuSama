import { musicService } from './src/services/music/MusicService.js';
import { ShimizuClient } from './src/bot/client.js';
import { env } from './src/config/env.js';

async function main() {
  const client = new ShimizuClient();
  await client.login(env.DISCORD_TOKEN);
  musicService.init(client);
  
  setTimeout(async () => {
    try {
      const tracks = await musicService.resolve('ytsearch:YAO All My Life');
      if (tracks.length > 0) {
        console.log('--- TRACK INFO ---');
        console.log(tracks[0].info);
      } else {
        console.log('No tracks found.');
      }
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  }, 3000); // Wait for shoukaku to init
}

main();
