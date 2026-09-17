import { prisma } from './src/database/prisma.js';

async function main() {
  const welcomes = await prisma.welcomeConfig.findMany();
  const autoroles = await prisma.autorole.findMany();
  
  console.log('--- DB DUMP ---');
  console.log('Welcomes:', welcomes);
  console.log('Autoroles:', autoroles);
  console.log('---------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
