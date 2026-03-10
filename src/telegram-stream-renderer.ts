import { TelegramChannel } from './channels/telegram.js';
import { logger } from './logger.js';
import { formatOutbound } from './router.js';

const DEFAULT_STATUS_DELAY_MS = 1000;
const DEFAULT_EDIT_THROTTLE_MS = 400;
const TELEGRAM_MESSAGE_LIMIT = 4000;

export interface TelegramStreamRendererOptions {
  statusDelayMs?: number;
  editThrottleMs?: number;
}

export class TelegramStreamRenderer {
  private readonly statusDelayMs: number;
  private readonly editThrottleMs: number;

  private statusMessageId: number | null = null;
  private thinkingMessageId: number | null = null;
  private answerMessageIds: number[] = [];
  private toolBreadcrumbs: string[] = [];
  private pendingStatusText = '';
  private pendingAnswerText = '';
  private renderedStatusText = '';
  private renderedAnswerChunks: string[] = [];
  private statusDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private statusFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private answerFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private operationChain = Promise.resolve();

  constructor(
    private readonly channel: TelegramChannel,
    private readonly jid: string,
    options: TelegramStreamRendererOptions = {},
  ) {
    this.statusDelayMs = options.statusDelayMs ?? DEFAULT_STATUS_DELAY_MS;
    this.editThrottleMs = options.editThrottleMs ?? DEFAULT_EDIT_THROTTLE_MS;
  }

  start(): void {
    if (this.statusDelayTimer) return;
    this.statusDelayTimer = setTimeout(() => {
      this.statusDelayTimer = null;
      if (this.answerMessageIds.length > 0 || this.pendingAnswerText) return;
      this.pendingStatusText = this.pendingStatusText || 'Working...';
      this.scheduleStatusFlush(0);
      this.sendThinkingMessage();
    }, this.statusDelayMs);
  }

  updateProgress(message: string): void {
    const text = message.trim();
    if (!text) return;
    const runningMatch = text.match(/^Running\s+(.+)$/);
    if (runningMatch) {
      this.toolBreadcrumbs.push(runningMatch[1]);
      this.pendingStatusText =
        'Working... → ' + this.toolBreadcrumbs.join(' → ');
    } else if (!text.endsWith('finished')) {
      this.pendingStatusText = text;
    } else {
      return;
    }
    this.scheduleStatusFlush(0);
  }

  updateAnswer(text: string): void {
    const formatted = formatOutbound(text);
    if (!formatted) return;
    this.pendingAnswerText = formatted;
    this.clearStatusDelay();
    this.scheduleAnswerFlush();
  }

  hasAnswer(): boolean {
    return this.answerMessageIds.length > 0 || this.pendingAnswerText.length > 0;
  }

  getAnswerText(): string {
    return this.pendingAnswerText || this.renderedAnswerChunks.join('');
  }

  async finishSuccess(): Promise<void> {
    this.clearStatusDelay();
    this.clearFlushTimers();
    this.seedThinkingAsAnswer();
    await this.flushAnswerNow();
    await this.deleteStatusMessage();
  }

  async finishError(message: string): Promise<void> {
    this.clearStatusDelay();
    this.clearFlushTimers();
    if (message.trim()) {
      this.pendingStatusText = `Failed: ${message.trim()}`;
    } else if (!this.pendingStatusText) {
      this.pendingStatusText = 'Failed.';
    }
    await this.flushAnswerNow();
    await this.flushStatusNow();
  }

  async dispose(): Promise<void> {
    this.clearStatusDelay();
    this.clearFlushTimers();
    await this.operationChain;
  }

  private scheduleStatusFlush(delay = this.editThrottleMs): void {
    if (this.statusMessageId === null) {
      this.enqueue(async () => {
        if (!this.pendingStatusText || this.statusMessageId !== null) return;
        const messageId = await this.channel.sendLiveMessage(
          this.jid,
          this.pendingStatusText,
        );
        if (messageId !== null) {
          this.statusMessageId = messageId;
          this.renderedStatusText = this.pendingStatusText;
        }
      });
      return;
    }

    if (this.statusFlushTimer) return;
    this.statusFlushTimer = setTimeout(() => {
      this.statusFlushTimer = null;
      void this.flushStatusNow();
    }, delay);
  }

  private scheduleAnswerFlush(): void {
    if (this.answerMessageIds.length === 0) {
      this.seedThinkingAsAnswer();
      void this.flushAnswerNow();
      return;
    }

    if (this.answerFlushTimer) return;
    this.answerFlushTimer = setTimeout(() => {
      this.answerFlushTimer = null;
      void this.flushAnswerNow();
    }, this.editThrottleMs);
  }

  private async flushStatusNow(): Promise<void> {
    if (!this.pendingStatusText) return;

    await this.enqueue(async () => {
      if (!this.pendingStatusText) return;
      if (this.statusMessageId === null) {
        const messageId = await this.channel.sendLiveMessage(
          this.jid,
          this.pendingStatusText,
        );
        if (messageId !== null) {
          this.statusMessageId = messageId;
          this.renderedStatusText = this.pendingStatusText;
        }
        return;
      }

      if (this.pendingStatusText === this.renderedStatusText) return;
      await this.channel.editLiveMessage(
        this.jid,
        this.statusMessageId,
        this.pendingStatusText,
      );
      this.renderedStatusText = this.pendingStatusText;
    });
  }

  private async flushAnswerNow(): Promise<void> {
    if (!this.pendingAnswerText) return;

    await this.enqueue(async () => {
      if (!this.pendingAnswerText) return;

      const chunks = chunkTelegramText(this.pendingAnswerText);
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const messageId = this.answerMessageIds[i];
        const renderedChunk = this.renderedAnswerChunks[i];

        if (messageId == null) {
          const newMessageId = await this.channel.sendLiveMessage(this.jid, chunk);
          if (newMessageId !== null) {
            this.answerMessageIds.push(newMessageId);
            this.renderedAnswerChunks[i] = chunk;
          }
          continue;
        }

        if (chunk === renderedChunk) continue;
        await this.channel.editLiveMessage(this.jid, messageId, chunk);
        this.renderedAnswerChunks[i] = chunk;
      }

      while (this.answerMessageIds.length > chunks.length) {
        const extraMessageId = this.answerMessageIds.pop();
        this.renderedAnswerChunks.pop();
        if (extraMessageId != null) {
          await this.channel.deleteLiveMessage(this.jid, extraMessageId);
        }
      }
    });
  }

  private async deleteStatusMessage(): Promise<void> {
    if (this.statusMessageId == null) return;

    await this.enqueue(async () => {
      if (this.statusMessageId == null) return;
      await this.channel.deleteLiveMessage(this.jid, this.statusMessageId);
      this.statusMessageId = null;
      this.renderedStatusText = '';
    });
  }

  private sendThinkingMessage(): void {
    if (this.thinkingMessageId !== null) return;
    this.enqueue(async () => {
      if (this.thinkingMessageId !== null) return;
      const messageId = await this.channel.sendLiveMessage(this.jid, '...');
      if (messageId !== null) {
        this.thinkingMessageId = messageId;
      }
    });
  }

  private seedThinkingAsAnswer(): void {
    if (
      this.thinkingMessageId !== null &&
      this.answerMessageIds.length === 0
    ) {
      this.answerMessageIds.push(this.thinkingMessageId);
      this.renderedAnswerChunks.push('...');
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.operationChain = this.operationChain
      .then(operation)
      .catch((err) => {
        logger.error({ err }, 'TelegramStreamRenderer operation failed');
      });
    return this.operationChain;
  }

  private clearStatusDelay(): void {
    if (!this.statusDelayTimer) return;
    clearTimeout(this.statusDelayTimer);
    this.statusDelayTimer = null;
  }

  private clearFlushTimers(): void {
    if (this.statusFlushTimer) {
      clearTimeout(this.statusFlushTimer);
      this.statusFlushTimer = null;
    }
    if (this.answerFlushTimer) {
      clearTimeout(this.answerFlushTimer);
      this.answerFlushTimer = null;
    }
  }
}

function chunkTelegramText(text: string): string[] {
  if (text.length <= TELEGRAM_MESSAGE_LIMIT) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
    let splitAt = remaining.lastIndexOf('\n', TELEGRAM_MESSAGE_LIMIT);
    if (splitAt < TELEGRAM_MESSAGE_LIMIT / 2) {
      splitAt = remaining.lastIndexOf(' ', TELEGRAM_MESSAGE_LIMIT);
    }
    if (splitAt < TELEGRAM_MESSAGE_LIMIT / 2) {
      splitAt = TELEGRAM_MESSAGE_LIMIT;
    }
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
