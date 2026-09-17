import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { LevelingService } from '../economy/LevelingService.js';

export class PetCardGenerator {
  public static async generate(pet: any, user: any): Promise<Buffer> {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1b26');
    gradient.addColorStop(1, '#24283b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Decorative border
    ctx.strokeStyle = '#bb9af7';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Header (User's Pet)
    ctx.fillStyle = '#a9b1d6';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${user.username}'s Companion`, 40, 50);

    // Pet Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(pet.name, 40, 100);

    // Species Badge
    ctx.fillStyle = '#7aa2f7';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Lv. ${pet.level} ${pet.species}`, 40, 140);

    // Pet Emoji Graphic (Large emoji representing the pet)
    const speciesEmojiMap: Record<string, string> = {
      'Dragon': '🐉',
      'Wolf': '🐺',
      'Phoenix': '🦅',
      'Griffin': '🦁'
    };
    const emoji = speciesEmojiMap[pet.species] || '🐾';
    
    ctx.font = '150px sans-serif';
    ctx.fillText(emoji, 550, 200);

    // --- Progress Bars ---
    
    const drawProgressBar = (x: number, y: number, label: string, current: number, max: number, color: string) => {
      // Label
      ctx.fillStyle = '#a9b1d6';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(label, x, y);

      // Ratio text
      ctx.fillStyle = '#565f89';
      ctx.font = '18px sans-serif';
      ctx.fillText(`${current} / ${max}`, x + 350, y);

      // Background Bar
      ctx.fillStyle = '#16161e';
      ctx.beginPath();
      ctx.roundRect(x, y + 15, 400, 20, 10);
      ctx.fill();

      // Foreground Bar
      const percentage = Math.max(0, Math.min(1, current / max));
      if (percentage > 0) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y + 15, 400 * percentage, 20, 10);
        ctx.fill();
      }
    };

    // XP Bar
    const requiredXp = LevelingService.requiredTotalXp(pet.level + 1);
    drawProgressBar(40, 200, 'Experience Points', pet.xp, requiredXp, '#9ece6a');

    // Hunger Bar
    let hungerColor = '#e0af68';
    if (pet.hunger < 30) hungerColor = '#f7768e';
    drawProgressBar(40, 260, 'Hunger (Needs Food)', pet.hunger, 100, hungerColor);

    // Energy Bar
    let energyColor = '#7dcfff';
    if (pet.energy < 30) energyColor = '#f7768e';
    drawProgressBar(40, 320, 'Energy (Battle Stamina)', pet.energy, 100, energyColor);

    return canvas.toBuffer('image/png');
  }
}
