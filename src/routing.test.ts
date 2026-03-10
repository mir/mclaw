import { describe, it, expect, beforeEach } from 'vitest';

import { _initTestDatabase, getAllChats, storeChatMetadata } from './db.js';
import { getAvailableGroups, _setRegisteredGroups } from './index.js';

beforeEach(() => {
  _initTestDatabase();
  _setRegisteredGroups({});
});

describe('Telegram JID ownership patterns', () => {
  it('matches direct chat JIDs', () => {
    expect('tg:123456789'.startsWith('tg:')).toBe(true);
  });

  it('matches supergroup JIDs', () => {
    expect('tg:-1001234567890'.startsWith('tg:')).toBe(true);
  });

  it('matches topic-qualified JIDs', () => {
    expect('tg:-1001234567890:topic:7'.startsWith('tg:')).toBe(true);
  });
});

describe('getAvailableGroups', () => {
  it('returns only Telegram groups, excludes DMs', () => {
    storeChatMetadata('tg:-1001', '2024-01-01T00:00:01.000Z', 'Group 1', 'telegram', true);
    storeChatMetadata('tg:42', '2024-01-01T00:00:02.000Z', 'Direct Chat', 'telegram', false);
    storeChatMetadata('tg:-1002', '2024-01-01T00:00:03.000Z', 'Group 2', 'telegram', true);

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.jid)).toEqual(['tg:-1002', 'tg:-1001']);
  });

  it('marks registered groups correctly', () => {
    storeChatMetadata('tg:-1001', '2024-01-01T00:00:01.000Z', 'Registered', 'telegram', true);
    storeChatMetadata('tg:-1002', '2024-01-01T00:00:02.000Z', 'Unregistered', 'telegram', true);

    _setRegisteredGroups({
      'tg:-1001': {
        name: 'Registered',
        folder: 'registered',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    });

    const groups = getAvailableGroups();
    expect(groups.find((g) => g.jid === 'tg:-1001')?.isRegistered).toBe(true);
    expect(groups.find((g) => g.jid === 'tg:-1002')?.isRegistered).toBe(false);
  });

  it('orders groups by most recent activity', () => {
    storeChatMetadata('tg:-1001', '2024-01-01T00:00:01.000Z', 'Old', 'telegram', true);
    storeChatMetadata('tg:-1003', '2024-01-01T00:00:05.000Z', 'New', 'telegram', true);
    storeChatMetadata('tg:-1002', '2024-01-01T00:00:03.000Z', 'Mid', 'telegram', true);

    const groups = getAvailableGroups();
    expect(groups.map((g) => g.jid)).toEqual([
      'tg:-1003',
      'tg:-1002',
      'tg:-1001',
    ]);
  });

  it('includes topic-qualified Telegram chats', () => {
    storeChatMetadata(
      'tg:-1001234567890:topic:7',
      '2024-01-01T00:00:01.000Z',
      'Topic Chat',
      'telegram',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('tg:-1001234567890:topic:7');
  });

  it('leaves chat metadata queryable for debugging', () => {
    storeChatMetadata('tg:-1001', '2024-01-01T00:00:01.000Z', 'Group', 'telegram', true);
    expect(getAllChats()[0].channel).toBe('telegram');
  });
});
