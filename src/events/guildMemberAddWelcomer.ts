import { Events, GuildMember, AttachmentBuilder, TextChannel } from 'discord.js';
import { Event } from '../types/index.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { Canvas, createCanvas, loadImage, GlobalFonts, Image } from '@napi-rs/canvas';

// Helper function to draw rounded images
function drawRoundedImage(ctx: any, img: Image, x: number, y: number, width: number, height: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, width, height);
  ctx.restore();
}

export const event: Event<Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  execute: async (member: GuildMember) => {
    try {
      const config = await prisma.welcomeConfig.findUnique({
        where: { guildId: member.guild.id },
      });

      if (!config || !config.enabled || !config.channelId) return;

      const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) return;

      // Create a 1024x450 canvas
      const width = 1024;
      const height = 450;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // 1. Draw Background
      if (config.backgroundUrl) {
        try {
          const bg = await loadImage(config.backgroundUrl);
          ctx.drawImage(bg, 0, 0, width, height);
        } catch (e) {
          logger.warn('Failed to load custom background image, falling back to default.');
          ctx.fillStyle = '#1a0b0e'; // Very dark red/brown
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        // Default Manor Theme Background (Gradient)
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#2b1014');
        gradient.addColorStop(1, '#110608');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Add some elegant borders
        ctx.strokeStyle = '#c4a052'; // Gold
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, width - 20, height - 20);
        ctx.lineWidth = 1;
        ctx.strokeRect(15, 15, width - 30, height - 30);
      }

      // Add a dark overlay to make text pop
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Avatar Background (Gold Ring)
      const avatarX = width / 2;
      const avatarY = height / 2 - 40;
      const avatarRadius = 100;

      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarRadius + 6, 0, Math.PI * 2, true);
      ctx.fillStyle = '#c4a052'; // Gold
      ctx.fill();

      // 3. Draw Avatar
      const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
      try {
        const avatar = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        ctx.restore();
      } catch (e) {
        // Fallback if avatar fails
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
        ctx.fillStyle = '#333';
        ctx.fill();
      }

      // 4. Draw Text
      ctx.textAlign = 'center';
      
      // Welcome Text
      ctx.font = 'bold 50px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Welcome to the Manor', width / 2, height - 100);

      // Username Text
      ctx.font = '35px sans-serif';
      ctx.fillStyle = '#c4a052'; // Gold
      ctx.fillText(member.user.tag, width / 2, height - 50);

      // Generate Image
      const buffer = await canvas.encode('png');
      const attachment = new AttachmentBuilder(buffer, { name: 'welcome-image.png' });

      // Build Message
      let content = config.message || `Welcome to the Manor, <@${member.user.id}>!`;
      content = content
        .replace(/{user}/g, `<@${member.user.id}>`)
        .replace(/{username}/g, member.user.username)
        .replace(/{server}/g, member.guild.name)
        .replace(/{membercount}/g, member.guild.memberCount.toString());

      await channel.send({
        content,
        files: [attachment],
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to execute guildMemberAddWelcomer');
    }
  },
};
