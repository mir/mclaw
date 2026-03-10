import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelegramStreamRenderer } from './telegram-stream-renderer.js';

describe('TelegramStreamRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends status and thinking messages after delay, deletes status on success', async () => {
    let nextId = 10;
    const channel = {
      sendLiveMessage: vi.fn().mockImplementation(() => Promise.resolve(nextId++)),
      editLiveMessage: vi.fn().mockResolvedValue(undefined),
      deleteLiveMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    const renderer = new TelegramStreamRenderer(channel, 'tg:1');
    renderer.start();

    await vi.advanceTimersByTimeAsync(1000);
    await renderer.dispose();

    // Should send status ("Working...") and thinking ("...")
    expect(channel.sendLiveMessage).toHaveBeenCalledTimes(2);
    expect(channel.sendLiveMessage).toHaveBeenCalledWith('tg:1', 'Working...');
    expect(channel.sendLiveMessage).toHaveBeenCalledWith('tg:1', '...');

    await renderer.finishSuccess();

    // Status message (id=10) deleted, thinking message stays
    expect(channel.deleteLiveMessage).toHaveBeenCalledWith('tg:1', 10);
    expect(channel.deleteLiveMessage).toHaveBeenCalledTimes(1);
  });

  it('builds tool breadcrumbs from Running messages and ignores finished messages', async () => {
    const channel = {
      sendLiveMessage: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(11),
      editLiveMessage: vi.fn().mockResolvedValue(undefined),
      deleteLiveMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    const renderer = new TelegramStreamRenderer(channel, 'tg:1');
    renderer.start();

    await vi.advanceTimersByTimeAsync(1000);
    await renderer.dispose();

    renderer.updateProgress('Running Bash');
    await vi.advanceTimersByTimeAsync(400);
    await renderer.dispose();

    expect(channel.editLiveMessage).toHaveBeenCalledWith(
      'tg:1',
      10,
      'Working... → Bash',
    );

    // "finished" messages should be ignored
    renderer.updateProgress('Bash finished');
    await vi.advanceTimersByTimeAsync(400);
    await renderer.dispose();

    renderer.updateProgress('Running Read');
    await vi.advanceTimersByTimeAsync(400);
    await renderer.dispose();

    expect(channel.editLiveMessage).toHaveBeenCalledWith(
      'tg:1',
      10,
      'Working... → Bash → Read',
    );
  });

  it('edits thinking message with answer instead of sending new message', async () => {
    let nextId = 10;
    const channel = {
      sendLiveMessage: vi.fn().mockImplementation(() => Promise.resolve(nextId++)),
      editLiveMessage: vi.fn().mockResolvedValue(undefined),
      deleteLiveMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    const renderer = new TelegramStreamRenderer(channel, 'tg:1');
    renderer.start();

    await vi.advanceTimersByTimeAsync(1000);
    await renderer.dispose();

    // status=10, thinking=11
    renderer.updateAnswer('Hello world');
    await renderer.dispose();

    // Should edit the thinking message (id=11), NOT send a new message
    expect(channel.editLiveMessage).toHaveBeenCalledWith('tg:1', 11, 'Hello world');
    // Only the initial 2 sends (status + thinking), no extra send for answer
    expect(channel.sendLiveMessage).toHaveBeenCalledTimes(2);

    await renderer.finishSuccess();

    // Status deleted
    expect(channel.deleteLiveMessage).toHaveBeenCalledWith('tg:1', 10);
  });

  it('edits the live answer and rolls long output into multiple messages', async () => {
    let nextId = 10;
    const channel = {
      sendLiveMessage: vi.fn().mockImplementation(() => Promise.resolve(nextId++)),
      editLiveMessage: vi.fn().mockResolvedValue(undefined),
      deleteLiveMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    const renderer = new TelegramStreamRenderer(channel, 'tg:1');
    renderer.start();

    await vi.advanceTimersByTimeAsync(1000);
    await renderer.dispose();

    // status=10, thinking=11
    const longText = `${'a'.repeat(3900)} ${'b'.repeat(3900)}`;

    renderer.updateAnswer(longText);
    await vi.advanceTimersByTimeAsync(400);
    await renderer.finishSuccess();

    // Thinking message (11) gets edited with first chunk
    expect(channel.editLiveMessage).toHaveBeenCalledWith(
      'tg:1',
      11,
      expect.stringContaining('a'),
    );
    // Second chunk sent as new message (12)
    expect(channel.sendLiveMessage).toHaveBeenCalledWith(
      'tg:1',
      expect.stringContaining('b'),
    );
  });

  it('keeps a failure status visible', async () => {
    const channel = {
      sendLiveMessage: vi.fn().mockResolvedValue(20),
      editLiveMessage: vi.fn().mockResolvedValue(undefined),
      deleteLiveMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    const renderer = new TelegramStreamRenderer(channel, 'tg:1');
    renderer.updateProgress('Running Bash');
    await renderer.dispose();

    await renderer.finishError('Tool failed');

    expect(channel.sendLiveMessage).toHaveBeenCalledWith(
      'tg:1',
      'Working... → Bash',
    );
    expect(channel.editLiveMessage).toHaveBeenCalledWith(
      'tg:1',
      20,
      'Failed: Tool failed',
    );
    expect(channel.deleteLiveMessage).not.toHaveBeenCalled();
  });

  it('seeds thinking message when answer arrives before start delay', async () => {
    const channel = {
      sendLiveMessage: vi.fn().mockResolvedValue(30),
      editLiveMessage: vi.fn().mockResolvedValue(undefined),
      deleteLiveMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    const renderer = new TelegramStreamRenderer(channel, 'tg:1');
    renderer.start();

    // Answer arrives before the 1s delay — no thinking message sent yet
    renderer.updateAnswer('Quick answer');
    await renderer.dispose();

    // Should send a new message since thinking wasn't sent
    expect(channel.sendLiveMessage).toHaveBeenCalledWith('tg:1', 'Quick answer');
  });
});
