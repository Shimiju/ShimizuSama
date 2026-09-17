import { createCanvas, loadImage, GlobalFonts, Image } from '@napi-rs/canvas';
import { resolve } from 'path';

export class RankCardGenerator {
  public static async generateCard(
    username: string,
    avatarUrl: string,
    currentXp: number,
    requiredXp: number,
    level: number,
    rank: number
  ): Promise<Buffer> {
    const width = 900;
    const height = 250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background Gradient (Dark Glassmorphism style)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1b26');
    gradient.addColorStop(1, '#0f111a');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 20);
    ctx.fill();

    // Subtle glow/accent
    ctx.shadowColor = '#7aa2f7';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(122, 162, 247, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.shadowBlur = 0; // Reset shadow

    // 2. Avatar
    const avatarSize = 150;
    const avatarX = 50;
    const avatarY = 50;
    
    try {
      const avatar = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Avatar Border
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#bb9af7';
      ctx.lineWidth = 4;
      ctx.stroke();
    } catch (e) {
      // Fallback if avatar fails to load
      ctx.fillStyle = '#24283b';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Username
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(username, 230, 90);

    // 4. Rank & Level
    const rankText = `RANK #${rank}`;
    const levelText = `LEVEL ${level}`;
    
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#c0caf5';
    ctx.fillText(levelText, 230, 130);
    
    ctx.fillStyle = '#7aa2f7';
    ctx.fillText(rankText, 230 + ctx.measureText(levelText + '  |  ').width, 130);

    // 5. XP Progress Bar Background
    const barX = 230;
    const barY = 170;
    const barWidth = 600;
    const barHeight = 25;
    const barRadius = 12;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, barRadius);
    ctx.fill();

    // 6. XP Progress Bar Fill
    const progress = Math.min(Math.max(currentXp / requiredXp, 0), 1);
    const fillWidth = barWidth * progress;

    if (fillWidth > 0) {
      const fillGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
      fillGradient.addColorStop(0, '#7aa2f7');
      fillGradient.addColorStop(1, '#bb9af7');
      
      ctx.fillStyle = fillGradient;
      ctx.beginPath();
      // Ensure the inner bar has rounded corners properly
      if (fillWidth < barRadius * 2) {
        ctx.roundRect(barX, barY, fillWidth, barHeight, fillWidth / 2);
      } else {
        ctx.roundRect(barX, barY, fillWidth, barHeight, barRadius);
      }
      ctx.fill();
    }

    // 7. XP Text
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#c0caf5';
    
    // Calculate previous level's total XP to show progress within current level
    const prevLevelXp = 100 * Math.pow(level, 2);
    const xpIntoCurrentLevel = currentXp - prevLevelXp;
    const requiredForNextLevel = requiredXp - prevLevelXp;
    
    const xpText = `${xpIntoCurrentLevel.toLocaleString()} / ${requiredForNextLevel.toLocaleString()} XP`;
    const xpTextWidth = ctx.measureText(xpText).width;
    
    ctx.fillText(xpText, barX + barWidth - xpTextWidth, barY - 15);

    return canvas.toBuffer('image/png');
  }
}
