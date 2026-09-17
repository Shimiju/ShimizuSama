import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { LevelingService } from './LevelingService.js';

export const PET_SPECIES = ['Dragon', 'Wolf', 'Phoenix', 'Griffin'];

export class PetService {
  public static async adoptPet(guildId: string, userId: string, name: string, species: string) {
    if (!PET_SPECIES.includes(species)) {
      throw new Error(`Invalid species. Choose from: ${PET_SPECIES.join(', ')}`);
    }

    const profile = await prisma.userGuildProfile.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: {},
      create: { guildId, userId }
    });

    const existingPet = await prisma.userPet.findUnique({
      where: { profileId: profile.id }
    });

    if (existingPet) {
      throw new Error('You already have a pet!');
    }

    return await prisma.userPet.create({
      data: {
        profileId: profile.id,
        name,
        species
      }
    });
  }

  public static async getPet(guildId: string, userId: string) {
    const profile = await prisma.userGuildProfile.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });

    if (!profile) return null;

    return await prisma.userPet.findUnique({
      where: { profileId: profile.id }
    });
  }

  public static async feedPet(guildId: string, userId: string) {
    const profile = await prisma.userGuildProfile.findUnique({
      where: { guildId_userId: { guildId, userId } },
      include: { pet: true }
    });

    if (!profile || !profile.pet) {
      throw new Error("You don't have a pet yet! Use `/pet adopt`.");
    }

    if (profile.balance < 10) {
      throw new Error("You need at least 10 Manor Gold to buy pet food!");
    }

    if (profile.pet.hunger >= 100) {
      throw new Error(`${profile.pet.name} is already full!`);
    }

    const newHunger = Math.min(profile.pet.hunger + 30, 100);
    const xpGained = Math.floor(Math.random() * 10) + 10; // 10-20 XP
    const newXp = profile.pet.xp + xpGained;
    
    // Level up check
    let newLevel = profile.pet.level;
    const requiredXp = LevelingService.requiredTotalXp(newLevel + 1);
    
    if (newXp >= requiredXp) {
      newLevel++;
    }

    await prisma.$transaction([
      prisma.userGuildProfile.update({
        where: { id: profile.id },
        data: { balance: { decrement: 10 } }
      }),
      prisma.economyTransaction.create({
        data: {
          guildId,
          userId,
          type: 'PET_FEED',
          amount: -10,
          balanceAfter: profile.balance - 10
        }
      }),
      prisma.userPet.update({
        where: { id: profile.pet.id },
        data: {
          hunger: newHunger,
          xp: newXp,
          level: newLevel,
          lastFedAt: new Date()
        }
      })
    ]);

    return {
      petName: profile.pet.name,
      hungerRestored: newHunger - profile.pet.hunger,
      xpGained,
      leveledUp: newLevel > profile.pet.level,
      newLevel
    };
  }

  public static async battlePet(guildId: string, userId: string) {
    const profile = await prisma.userGuildProfile.findUnique({
      where: { guildId_userId: { guildId, userId } },
      include: { pet: true }
    });

    if (!profile || !profile.pet) {
      throw new Error("You don't have a pet yet! Use `/pet adopt`.");
    }

    if (profile.pet.energy < 20) {
      throw new Error(`${profile.pet.name} is too tired to battle right now. They need to rest!`);
    }
    
    if (profile.pet.hunger < 20) {
      throw new Error(`${profile.pet.name} is too hungry to battle! Feed them first.`);
    }

    const winChance = 0.6 + (profile.pet.level * 0.01); // 60% base chance + 1% per level
    const isWin = Math.random() < winChance;
    
    const energyLost = 20;
    const hungerLost = 10;
    
    let goldWon = 0;
    let xpGained = 0;
    let leveledUp = false;
    let newLevel = profile.pet.level;

    if (isWin) {
      goldWon = Math.floor(Math.random() * 40) + 10; // 10-50 gold
      xpGained = Math.floor(Math.random() * 20) + 15; // 15-35 xp
      
      const newXp = profile.pet.xp + xpGained;
      const requiredXp = LevelingService.requiredTotalXp(newLevel + 1);
      
      if (newXp >= requiredXp) {
        newLevel++;
        leveledUp = true;
      }
      
      await prisma.$transaction([
        prisma.userGuildProfile.update({
          where: { id: profile.id },
          data: { 
            balance: { increment: goldWon },
            totalCoinsEarned: { increment: goldWon }
          }
        }),
        prisma.economyTransaction.create({
          data: {
            guildId,
            userId,
            type: 'PET_BATTLE',
            amount: goldWon,
            balanceAfter: profile.balance + goldWon
          }
        }),
        prisma.userPet.update({
          where: { id: profile.pet.id },
          data: {
            energy: { decrement: energyLost },
            hunger: { decrement: hungerLost },
            xp: newXp,
            level: newLevel,
            lastBattledAt: new Date()
          }
        })
      ]);
    } else {
      await prisma.userPet.update({
        where: { id: profile.pet.id },
        data: {
          energy: { decrement: energyLost },
          hunger: { decrement: hungerLost },
          lastBattledAt: new Date()
        }
      });
    }

    return {
      petName: profile.pet.name,
      isWin,
      goldWon,
      xpGained,
      leveledUp,
      newLevel,
      energyLost,
      hungerLost
    };
  }
  
  // Method to naturally restore energy over time (can be called before getting pet status)
  public static async processTimeTick(pet: any) {
    const now = Date.now();
    
    const timeSinceLastBattle = now - new Date(pet.lastBattledAt).getTime();
    const hoursSinceLastBattle = timeSinceLastBattle / (1000 * 60 * 60);
    
    // Restore 10 energy per hour
    const energyToRestore = Math.floor(hoursSinceLastBattle * 10);
    
    const timeSinceLastFed = now - new Date(pet.lastFedAt).getTime();
    const hoursSinceLastFed = timeSinceLastFed / (1000 * 60 * 60);
    
    // Lose 5 hunger per hour
    const hungerToLose = Math.floor(hoursSinceLastFed * 5);
    
    if (energyToRestore > 0 || hungerToLose > 0) {
      const newEnergy = Math.min(100, pet.energy + energyToRestore);
      const newHunger = Math.max(0, pet.hunger - hungerToLose);
      
      if (newEnergy !== pet.energy || newHunger !== pet.hunger) {
        return await prisma.userPet.update({
          where: { id: pet.id },
          data: {
            energy: newEnergy,
            hunger: newHunger,
            lastBattledAt: energyToRestore > 0 ? new Date() : pet.lastBattledAt,
            lastFedAt: hungerToLose > 0 ? new Date() : pet.lastFedAt
          }
        });
      }
    }
    
    return pet;
  }
}
