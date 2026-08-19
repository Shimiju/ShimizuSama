import { Message, MessagePayload, InteractionReplyOptions } from 'discord.js';
import { ShimizuClient } from '../bot/client.js';

export class PrefixAdapter {
  public message: Message;
  public commandName: string;
  public subcommandName: string;
  public args: Record<string, any>;
  public deferredMessage: Message | null = null;
  public replied: boolean = false;

  constructor(
    message: Message,
    commandName: string,
    subcommandName: string,
    args: Record<string, any> = {}
  ) {
    this.message = message;
    this.commandName = commandName;
    this.subcommandName = subcommandName;
    this.args = args;
  }

  get guild() {
    return this.message.guild;
  }
  get channel() {
    return this.message.channel;
  }
  get member() {
    return this.message.member;
  }
  get user() {
    return this.message.author;
  }
  get client() {
    return this.message.client as ShimizuClient;
  }

  public inCachedGuild() {
    return true;
  }

  public options = {
    getSubcommand: () => this.subcommandName,
    getString: (_name: string) => this.args[_name] ?? null,
    getInteger: (_name: string) => (this.args[_name] ? parseInt(this.args[_name], 10) : null),
    getUser: (_name: string) => null,
    getRole: (_name: string) => null,
  };

  public async deferReply(_options?: any) {
    this.deferredMessage = await (this.message.channel as any).send('⏳ Processing...');
    return this.deferredMessage;
  }

  public async reply(options: string | MessagePayload | InteractionReplyOptions) {
    this.replied = true;
    return await this.message.reply(options as any);
  }

  public async editReply(options: string | MessagePayload | InteractionReplyOptions) {
    if (this.deferredMessage) {
      this.replied = true;
      return await this.deferredMessage.edit(options as any);
    }
    if (!this.replied) {
      this.replied = true;
      return await (this.message.channel as any).send(options as any);
    }
    return await (this.message.channel as any).send(options as any);
  }

  public async followUp(options: string | MessagePayload | InteractionReplyOptions) {
    return await (this.message.channel as any).send(options as any);
  }
}
