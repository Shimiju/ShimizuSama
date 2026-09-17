import { EmbedBuilder } from 'discord.js';
import { ShimizuClient } from './src/bot/client.js';
import { env } from './src/config/env.js';

async function main() {
  const client = new ShimizuClient();
  await client.login(env.DISCORD_TOKEN);
  
  client.once('ready', async () => {
    const channelId = '1539484700240781362'; // front-door channel, just to test
    const channel = await client.channels.fetch(channelId);
    
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle('Image Test')
        .setImage('https://i.ytimg.com/vi/srM7Lc7alDI/hqdefault.jpg');
        
      await channel.send({ embeds: [embed] });
      console.log('Test message sent!');
    }
    
    process.exit(0);
  });
}

main();
