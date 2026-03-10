import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { streamApi } from '@grammyjs/stream';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import {
  buildTelegramJid,
  parseTelegramJid,
} from '../telegram-jid.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  SendMessageOptions,
} from '../types.js';
export { buildTelegramJid as buildTopicJid, parseTelegramJid as parseTopicJid } from '../telegram-jid.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;
  private streamMessage: ReturnType<typeof streamApi>['streamMessage'] | null = null;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3 }));
    this.streamMessage = streamApi(this.bot.api.raw).streamMessage;

    // Command to get chat ID (useful for registration)
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const threadId = ctx.message.message_thread_id;
      const chatJid = buildTelegramJid(ctx.chat.id, threadId);
      const parentJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || parentJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata at parent (chat-level) JID for discovery
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(parentJid, timestamp, chatName, 'telegram', isGroup);
      // Ensure topic JID also has a chats row (satisfies FK on messages table)
      if (chatJid !== parentJid) {
        this.opts.onChatMetadata(chatJid, timestamp, chatName, 'telegram', isGroup);
      }

      // Only deliver full message for registered groups (registered at parent JID)
      const group = this.opts.registeredGroups()[parentJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // Handle inline keyboard button presses
    this.bot.on('callback_query:data', async (ctx) => {
      const chatId = ctx.callbackQuery.message?.chat.id;
      if (!chatId) {
        await ctx.answerCallbackQuery();
        return;
      }

      const threadId = ctx.callbackQuery.message?.message_thread_id;
      const chatJid = buildTelegramJid(chatId, threadId);
      const parentJid = `tg:${chatId}`;
      const senderName =
        ctx.from.first_name || ctx.from.username || String(ctx.from.id);
      const content = `@${ASSISTANT_NAME} [Button: ${ctx.callbackQuery.data}]`;

      const group = this.opts.registeredGroups()[parentJid];
      if (!group) {
        await ctx.answerCallbackQuery();
        return;
      }

      this.opts.onMessage(chatJid, {
        id: ctx.callbackQuery.id,
        chat_jid: chatJid,
        sender: String(ctx.from.id),
        sender_name: senderName,
        content,
        timestamp: new Date().toISOString(),
        is_from_me: false,
      });

      await ctx.answerCallbackQuery();
      logger.info(
        { chatJid, sender: senderName, data: ctx.callbackQuery.data },
        'Telegram button press stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const threadId = ctx.message?.message_thread_id;
      const chatJid = buildTelegramJid(ctx.chat.id, threadId);
      const parentJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[parentJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(parentJid, timestamp, undefined, 'telegram', isGroup);
      if (chatJid !== parentJid) {
        this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      }
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    this.bot.on('message:photo', (ctx) => storeNonText(ctx, '[Photo]'));
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    this.bot.on('message:voice', (ctx) =>
      storeNonText(ctx, '[Voice message]'),
    );
    this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  async sendMessage(jid: string, text: string, options?: SendMessageOptions): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const { chatId, threadId } = parseTelegramJid(jid);

      // Build inline keyboard if buttons provided
      let reply_markup: Record<string, unknown> | undefined;
      logger.info({ hasButtons: !!options?.buttons, buttonsLength: options?.buttons?.length, buttons: JSON.stringify(options?.buttons) }, 'sendMessage debug');
      if (options?.buttons) {
        reply_markup = buildInlineKeyboard(options.buttons);
      }

      const STREAM_THRESHOLD = 100;
      if (this.streamMessage && text.length > STREAM_THRESHOLD) {
        // Stream text progressively using sendMessageDraft for typing animation
        const sendOpts: Record<string, any> = {};
        if (reply_markup) sendOpts.reply_markup = reply_markup;
        if (threadId) sendOpts.message_thread_id = threadId;
        const draftOpts = threadId ? { message_thread_id: threadId } : undefined;
        await this.streamMessage(
          Number(chatId),
          Date.now(),
          textChunks(text),
          draftOpts, // sendMessageDraft options
          Object.keys(sendOpts).length ? sendOpts : undefined, // sendMessage options
        );
      } else {
        // Short messages: send directly without streaming overhead
        const sendOpts: Record<string, any> = {};
        if (reply_markup) sendOpts.reply_markup = reply_markup;
        if (threadId) sendOpts.message_thread_id = threadId;
        await this.bot.api.sendMessage(chatId, text, ...Object.keys(sendOpts).length ? [sendOpts] : []);
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  async sendLiveMessage(jid: string, text: string): Promise<number | null> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return null;
    }

    try {
      const { chatId, threadId } = parseTelegramJid(jid);
      const message = threadId
        ? await this.bot.api.sendMessage(chatId, text, {
            message_thread_id: threadId,
          })
        : await this.bot.api.sendMessage(chatId, text);
      return message?.message_id ?? null;
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram live message');
      return null;
    }
  }

  async editLiveMessage(
    jid: string,
    messageId: number,
    text: string,
  ): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const { chatId } = parseTelegramJid(jid);
      await this.bot.api.editMessageText(chatId, messageId, text);
    } catch (err) {
      if (isMessageNotModifiedError(err)) return;
      logger.error({ jid, messageId, err }, 'Failed to edit Telegram live message');
    }
  }

  async deleteLiveMessage(jid: string, messageId: number): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const { chatId } = parseTelegramJid(jid);
      await this.bot.api.deleteMessage(chatId, messageId);
    } catch (err) {
      logger.error({ jid, messageId, err }, 'Failed to delete Telegram live message');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const { chatId, threadId } = parseTelegramJid(jid);
      if (threadId) {
        await this.bot.api.sendChatAction(chatId, 'typing', { message_thread_id: threadId });
      } else {
        await this.bot.api.sendChatAction(chatId, 'typing');
      }
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

/** Yield text in word-boundary chunks for natural streaming appearance. */
async function* textChunks(text: string): AsyncIterable<string> {
  const CHUNK_SIZE = 40;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    yield text.slice(i, i + CHUNK_SIZE);
  }
}

function buildInlineKeyboard(
  buttons: NonNullable<SendMessageOptions['buttons']>,
): Record<string, unknown> | undefined {
  if (buttons.length === 0) return undefined;

  const inline_keyboard = [];
  for (const row of buttons) {
    if (row.length === 0) {
      logger.warn({ buttons }, 'Skipping invalid Telegram keyboard with empty row');
      return undefined;
    }

    const keyboardRow = [];
    for (const btn of row) {
      if (!btn.text) {
        logger.warn({ button: btn }, 'Skipping invalid Telegram keyboard button with empty text');
        return undefined;
      }
      const callbackBytes = Buffer.byteLength(btn.data, 'utf8');
      if (callbackBytes < 1 || callbackBytes > 64) {
        logger.warn(
          { button: btn, callbackBytes },
          'Skipping invalid Telegram keyboard button with callback data outside 1-64 bytes',
        );
        return undefined;
      }
      keyboardRow.push({ text: btn.text, callback_data: btn.data });
    }
    inline_keyboard.push(keyboardRow);
  }

  return { inline_keyboard };
}

function isMessageNotModifiedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.toLowerCase().includes('message is not modified');
}
