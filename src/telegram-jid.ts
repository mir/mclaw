export interface TelegramJidParts {
  jid: string;
  parentJid: string;
  chatId: string;
  threadId?: number;
}

/** Build a Telegram JID that encodes the optional forum topic ID. */
export function buildTelegramJid(
  chatId: number | string,
  threadId?: number,
): string {
  const base = `tg:${chatId}`;
  return threadId ? `${base}:topic:${threadId}` : base;
}

/** Parse a Telegram JID back into chat ID and optional thread ID. */
export function parseTelegramJid(jid: string): TelegramJidParts {
  const m = jid.match(/^tg:(-?\d+)(?::topic:(\d+))?$/);
  if (!m) {
    const chatId = jid.replace(/^tg:/, '');
    return { jid, parentJid: `tg:${chatId}`, chatId };
  }

  const chatId = m[1];
  const threadId = m[2] ? Number(m[2]) : undefined;
  return {
    jid,
    parentJid: `tg:${chatId}`,
    chatId,
    threadId,
  };
}

/** Topic JIDs resolve to their parent chat registration; other JIDs are unchanged. */
export function getParentTelegramJid(jid: string): string {
  return parseTelegramJid(jid).parentJid;
}
