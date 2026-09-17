import { createCanvas, loadImage } from '@napi-rs/canvas';
import { GuildMember } from 'discord.js';

export class CardGenerator {
  public static async generateWelcomeCard(
    member: GuildMember,
    memberCount: number
  ): Promise<Buffer> {
    return this.generateCard(
      member,
      'Welcome to the Manor',
      `You are our ${memberCount}th guest.`
    );
  }

  public static async generateLeaveCard(member: GuildMember): Promise<Buffer> {
    return this.generateCard(member, 'Farewell', 'We hope to see you again soon.');
  }

  private static async generateCard(
    member: GuildMember,
    title: string,
    subtitle: string
  ): Promise<Buffer> {
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext('2d');

    // Background Gradient (Dark Red to Black)
    const bgGradient = ctx.createLinearGradient(0, 0, 800, 250);
    bgGradient.addColorStop(0, '#2a0808'); // Dark Manor Red
    bgGradient.addColorStop(1, '#0a0a0a'); // Deep Black

    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gold Trim/Border
    ctx.strokeStyle = '#d4af37'; // Metallic Gold
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Subtle background pattern
    ctx.beginPath();
    ctx.moveTo(10, 60);
    ctx.lineTo(canvas.width - 10, 60);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)'; // Faded Gold
    ctx.lineWidth = 1;
    ctx.stroke();

    // Load Avatar
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    let avatar;
    try {
      avatar = await loadImage(avatarUrl);
    } catch {
      // Fallback if avatar fails to load
      avatar = null;
    }

    const avatarSize = 150;
    const avatarX = 50;
    const avatarY = 50;
    const centerX = avatarX + avatarSize / 2;
    const centerY = avatarY + avatarSize / 2;
    const radius = avatarSize / 2;

    if (avatar) {
      // Draw Avatar Circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } else {
      // Draw Placeholder Circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
    }

    // Draw Gold Ring around Avatar
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Text Settings
    ctx.fillStyle = '#d4af37'; // Gold
    ctx.font = 'bold 42px sans-serif';

    // Draw Title
    ctx.fillText(title, 230, 90);

    // Draw Username
    ctx.fillStyle = '#ffffff'; // White
    ctx.font = 'bold 36px sans-serif';

    // Truncate username if too long
    let username = member.user.username;
    if (username.length > 20) username = username.substring(0, 17) + '...';
    ctx.fillText(username, 230, 145);

    // Draw Subtitle
    ctx.fillStyle = '#aaaaaa'; // Light Grey
    ctx.font = '24px sans-serif';
    ctx.fillText(subtitle, 230, 190);

    // Encode
    return canvas.encode('png');
  }

  public static async generateRankCard(
    user: { username: string; displayAvatarURL: (opts: any) => string },
    level: number,
    currentXp: number,
    nextXp: number,
    rank?: number
  ): Promise<Buffer> {
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext('2d');

    // Background Gradient (Dark Red to Black)
    const bgGradient = ctx.createLinearGradient(0, 0, 800, 250);
    bgGradient.addColorStop(0, '#2a0808'); // Dark Manor Red
    bgGradient.addColorStop(1, '#0a0a0a'); // Deep Black

    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gold Trim/Border
    ctx.strokeStyle = '#d4af37'; // Metallic Gold
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Subtle background pattern
    ctx.beginPath();
    ctx.moveTo(10, 60);
    ctx.lineTo(canvas.width - 10, 60);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)'; // Faded Gold
    ctx.lineWidth = 1;
    ctx.stroke();

    // Load Avatar
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
    let avatar;
    try {
      avatar = await loadImage(avatarUrl);
    } catch {
      avatar = null;
    }

    const avatarSize = 150;
    const avatarX = 40;
    const avatarY = 50;
    const centerX = avatarX + avatarSize / 2;
    const centerY = avatarY + avatarSize / 2;
    const radius = avatarSize / 2;

    if (avatar) {
      // Draw Avatar Circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } else {
      // Draw Placeholder Circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
    }

    // Draw Gold Ring around Avatar
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Draw Username
    ctx.fillStyle = '#ffffff'; // White
    ctx.font = 'bold 36px sans-serif';
    let username = user.username;
    if (username.length > 15) username = username.substring(0, 12) + '...';
    ctx.fillText(username, 230, 95);

    // Draw Level & Rank
    ctx.fillStyle = '#d4af37'; // Gold
    ctx.font = 'bold 30px sans-serif';
    const rankText = rank ? `RANK #${rank}   |   ` : '';
    ctx.fillText(`${rankText}LEVEL ${level}`, 230, 140);

    // Draw XP Bar Background
    const barX = 230;
    const barY = 170;
    const barWidth = 520;
    const barHeight = 25;
    const cornerRadius = 12;

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
    ctx.fill();

    // Draw XP Bar Fill (Gold Gradient)
    const progress = Math.min(1, Math.max(0, currentXp / nextXp));
    if (progress > 0) {
      const fillWidth = barWidth * progress;
      const fillGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      fillGradient.addColorStop(0, '#8a701d');
      fillGradient.addColorStop(1, '#ffd700');

      ctx.fillStyle = fillGradient;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillWidth, barHeight, cornerRadius);
      ctx.fill();
    }

    // Draw XP Text inside Bar
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    const xpText = `${currentXp.toLocaleString()} / ${nextXp.toLocaleString()} XP`;
    const textWidth = ctx.measureText(xpText).width;
    ctx.fillText(xpText, barX + (barWidth / 2) - (textWidth / 2), barY + 18);

    return canvas.encode('png');
  }
}
