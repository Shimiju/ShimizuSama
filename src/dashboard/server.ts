import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { ShimizuClient } from '../bot/client.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../database/prisma.js';
import { env } from '../config/env.js';
import { CacheService } from '../services/cacheService.js';

interface AuthUser {
  id: string;
  username: string;
  avatar: string | null;
  access_token: string;
}

// Express 5 types route params as string | string[]; these aliases pin the
// params our guild routes actually use.
type GuildRequest = Request<{ id: string }>;
type CommandRequest = Request<{ id: string; cmdId: string }>;

const app = express();

app.use(cors({ origin: env.DASHBOARD_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

export const startDashboardServer = (client: ShimizuClient) => {
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      (req as any).user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Gate every /api/guilds/:id route: the user must be the bot owner or a
  // member with ManageGuild permission in the target guild.
  const requireGuildAccess = async (req: GuildRequest, res: Response, next: NextFunction) => {
    const guildId = req.params.id;
    if (!client.guilds.cache.has(guildId)) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const user = (req as any).user as AuthUser;
    if (user.id === env.BOT_OWNER_ID) {
      return next();
    }

    try {
      const member = await client.guilds.cache.get(guildId)?.members.fetch(user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return res.status(403).json({ error: 'Missing Permissions' });
      }
      next();
    } catch {
      res.status(403).json({ error: 'Access Denied' });
    }
  };

  app.get('/api/auth/login', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(env.DISCORD_CALLBACK_URL)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
  });

  app.get('/api/auth/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send('No code provided');

    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.DISCORD_CALLBACK_URL,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        throw new Error('Failed to fetch access token');
      }

      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResponse.json();

      const token = jwt.sign(
        {
          id: userData.id,
          username: userData.username,
          avatar: userData.avatar,
          access_token: tokenData.access_token,
        },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      res.redirect(`${env.DASHBOARD_URL}/dashboard`);
    } catch (error) {
      logger.error({ error }, 'OAuth2 error');
      res.redirect(`${env.DASHBOARD_URL}/?error=auth_failed`);
    }
  });

  app.get('/api/users/@me', requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as AuthUser;
    const isBotOwner = user.id === env.BOT_OWNER_ID;
    res.json({ id: user.id, username: user.username, avatar: user.avatar, isBotOwner });
  });

  app.get('/api/guilds', requireAuth, async (req: GuildRequest, res: Response) => {
    try {
      const user = (req as any).user as AuthUser;
      const isBotOwner = user.id === env.BOT_OWNER_ID;

      const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });
      const guilds = await guildsResponse.json();

      if (!Array.isArray(guilds)) {
        return res.status(500).json({ error: 'Failed to fetch guilds from Discord' });
      }

      const MANAGE_GUILD = 0x20;
      let manageableGuilds = guilds;

      if (!isBotOwner) {
        manageableGuilds = guilds.filter(
          (g: any) => (parseInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD
        );
      }

      const finalGuilds = isBotOwner
        ? client.guilds.cache.map((g) => ({ id: g.id, name: g.name, icon: g.iconURL() }))
        : manageableGuilds
            .filter((g: any) => client.guilds.cache.has(g.id))
            .map((g: any) => ({
              id: g.id,
              name: g.name,
              icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            }));

      res.json(finalGuilds);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch guilds');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // All routes below inherit requireAuth + requireGuildAccess.
  app.use('/api/guilds/:id', requireAuth, requireGuildAccess);

  app.get('/api/guilds/:id/settings', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;

    try {
      const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
      const ticketSettings = await prisma.ticketSettings.findUnique({ where: { guildId } });

      const dbSettings = settings || {
        levelingEnabled: true,
        economyEnabled: true,
        levelUpChannelId: null,
        levelUpMessage: null,
        prefix: 's!',
      };
      const dbTicketSettings = ticketSettings || {
        categoryId: null,
        supportRoleId: null,
        transcriptChannelId: null,
      };

      const guild = client.guilds.cache.get(guildId);
      const channels =
        guild?.channels.cache.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parentId: c.parentId,
        })) || [];
      const roles =
        guild?.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.color })) || [];

      const memberCount = guild?.memberCount || 0;
      const openTickets = await prisma.ticket.count({ where: { guildId, status: 'OPEN' } });

      const usersWithCoins = await prisma.userGuildProfile.aggregate({
        where: { guildId },
        _sum: { balance: true },
      });
      const totalCoins = usersWithCoins._sum.balance || 0;

      res.json({
        settings: dbSettings,
        ticketSettings: dbTicketSettings,
        stats: { memberCount, openTickets, totalCoins },
        channels,
        roles,
      });
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/api/guilds/:id/settings', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;

    const {
      levelingEnabled,
      economyEnabled,
      levelUpChannelId,
      levelUpMessage,
      prefix,
      categoryId,
      supportRoleId,
      transcriptChannelId,
    } = req.body;

    try {
      const updatedSettings = await prisma.guildSettings.upsert({
        where: { guildId },
        update: { levelingEnabled, economyEnabled, levelUpChannelId, levelUpMessage, prefix },
        create: {
          guildId,
          levelingEnabled,
          economyEnabled,
          levelUpChannelId,
          levelUpMessage,
          prefix,
        },
      });

      const updatedTicketSettings = await prisma.ticketSettings.upsert({
        where: { guildId },
        update: { categoryId, supportRoleId, transcriptChannelId },
        create: { guildId, categoryId, supportRoleId, transcriptChannelId },
      });

      await CacheService.delete(`guild:settings:${guildId}`);

      res.json({ settings: updatedSettings, ticketSettings: updatedTicketSettings });
    } catch {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  app.get('/api/guilds/:id/custom-commands', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    try {
      const commands = await prisma.customCommand.findMany({ where: { guildId } });
      res.json(commands);
    } catch {
      res.status(500).json({ error: 'Failed to fetch custom commands' });
    }
  });

  app.post('/api/guilds/:id/custom-commands', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    const { trigger, response } = req.body;
    try {
      const cmd = await prisma.customCommand.create({
        data: { guildId, trigger, response },
      });
      await CacheService.delete(`customcommands:${guildId}`);
      res.json(cmd);
    } catch {
      res.status(500).json({ error: 'Failed to create command' });
    }
  });

  app.put('/api/guilds/:id/custom-commands/:cmdId', async (req: CommandRequest, res: Response) => {
    const guildId = req.params.id;
    const { trigger, response } = req.body;
    try {
      const cmd = await prisma.customCommand.update({
        where: { id: req.params.cmdId },
        data: { trigger, response },
      });
      await CacheService.delete(`customcommands:${guildId}`);
      res.json(cmd);
    } catch {
      res.status(500).json({ error: 'Failed to update command' });
    }
  });

  app.delete('/api/guilds/:id/custom-commands/:cmdId', async (req: CommandRequest, res: Response) => {
    const guildId = req.params.id;
    try {
      await prisma.customCommand.delete({ where: { id: req.params.cmdId } });
      await CacheService.delete(`customcommands:${guildId}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete command' });
    }
  });

  app.get('/api/guilds/:id/moderation', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    try {
      const logConfig = await prisma.logConfig.findUnique({ where: { guildId } });
      const autoModRules = await prisma.autoModRule.findMany({ where: { guildId } });

      const dbLogConfig = logConfig || {
        moderationLogs: null,
        messageLogs: null,
        memberLogs: null,
      };

      res.json({ logConfig: dbLogConfig, autoModRules });
    } catch {
      res.status(500).json({ error: 'Failed to fetch moderation settings' });
    }
  });

  app.post('/api/guilds/:id/moderation', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    const { logConfig, autoModRules } = req.body;

    try {
      const updatedLogs = await prisma.logConfig.upsert({
        where: { guildId },
        update: logConfig,
        create: { guildId, ...logConfig },
      });

      await prisma.autoModRule.deleteMany({ where: { guildId } });
      if (autoModRules && autoModRules.length > 0) {
        await prisma.autoModRule.createMany({
          data: autoModRules.map((r: any) => ({
            guildId,
            type: r.type,
            action: r.action,
            enabled: r.enabled,
            data: r.data || null,
          })),
        });
      }
      const newRules = await prisma.autoModRule.findMany({ where: { guildId } });

      await CacheService.delete(`automod:rules:${guildId}`);

      res.json({ logConfig: updatedLogs, autoModRules: newRules });
    } catch {
      res.status(500).json({ error: 'Failed to update moderation settings' });
    }
  });

  app.get('/api/guilds/:id/welcome', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    try {
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId } });
      const dbConfig = config || {
        enabled: false,
        channelId: null,
        message: '',
        goodbyeChannelId: null,
        goodbyeMessage: '',
      };
      res.json(dbConfig);
    } catch {
      res.status(500).json({ error: 'Failed to fetch welcome settings' });
    }
  });

  app.post('/api/guilds/:id/welcome', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    const { enabled, channelId, message, goodbyeChannelId, goodbyeMessage } = req.body;
    try {
      const config = await prisma.welcomeConfig.upsert({
        where: { guildId },
        update: { enabled, channelId, message, goodbyeChannelId, goodbyeMessage },
        create: { guildId, enabled, channelId, message, goodbyeChannelId, goodbyeMessage },
      });
      res.json(config);
    } catch (error) {
      logger.error({ error }, 'Welcome settings update failed');
      res.status(500).json({ error: 'Failed to update welcome settings' });
    }
  });

  app.get('/api/guilds/:id/autoroles', async (req: GuildRequest, res: Response) => {
    try {
      const autoroles = await prisma.autorole.findMany({ where: { guildId: req.params.id } });
      res.json(autoroles.map((ar: any) => ar.roleId));
    } catch {
      res.status(500).json({ error: 'Failed to fetch autoroles' });
    }
  });

  app.post('/api/guilds/:id/autoroles', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    const { roleIds } = req.body;
    try {
      await prisma.$transaction([
        prisma.autorole.deleteMany({ where: { guildId } }),
        ...roleIds.map((roleId: string) => prisma.autorole.create({ data: { guildId, roleId } })),
      ]);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Autorole update failed');
      res.status(500).json({ error: 'Failed to update autoroles' });
    }
  });

  app.get('/api/guilds/:id/role-menus', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    try {
      const menus = await prisma.roleMenu.findMany({
        where: { guildId },
        include: { items: true },
      });
      res.json(menus);
    } catch {
      res.status(500).json({ error: 'Failed to fetch role menus' });
    }
  });

  app.post('/api/guilds/:id/role-menus', async (req: GuildRequest, res: Response) => {
    const guildId = req.params.id;
    const { channelId, title, description, roles } = req.body;

    if (!roles || roles.length === 0 || roles.length > 5) {
      return res.status(400).json({ error: 'Must provide between 1 and 5 roles.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        return res.status(400).json({ error: 'Invalid Text Channel' });
      }

      const roleMenu = await prisma.roleMenu.create({
        data: {
          guildId,
          channelId,
          items: {
            create: roles.map((r: any) => ({
              roleId: r.roleId,
              label: r.label,
              emoji: r.emoji || null,
            })),
          },
        },
        include: { items: true },
      });

      const embed = new EmbedBuilder()
        .setTitle(title || 'Role Selection')
        .setDescription(description || 'Click the buttons below to receive the corresponding role!')
        .setColor(0x5865f2);

      const actionRow = new ActionRowBuilder<ButtonBuilder>();

      for (const item of roleMenu.items) {
        const btn = new ButtonBuilder()
          .setCustomId(`rolepanel_${roleMenu.id}_${item.roleId}`)
          .setLabel(item.label)
          .setStyle(ButtonStyle.Primary);

        if (item.emoji) {
          btn.setEmoji(item.emoji);
        }

        actionRow.addComponents(btn);
      }

      const msg = await channel.send({ embeds: [embed], components: [actionRow] });

      const updatedMenu = await prisma.roleMenu.update({
        where: { id: roleMenu.id },
        data: { messageId: msg.id },
        include: { items: true },
      });

      res.json(updatedMenu);
    } catch (error) {
      logger.error({ error }, 'Failed to create role menu');
      res.status(500).json({ error: 'Failed to create role menu' });
    }
  });

  app.use((err: any, req: any, res: any, _next: any) => {
    logger.error({ err }, 'Express unhandled error');
    res.status(500).json({ error: 'Internal Server Error' });
  });

  app.listen(env.DASHBOARD_PORT, env.BIND_HOST, () => {
    logger.info(
      { host: env.BIND_HOST, port: env.DASHBOARD_PORT },
      'Dashboard API listening'
    );
  });
};
