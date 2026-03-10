import { beforeEach, describe, expect, it } from 'vitest';

import { resolveMessageTargetGroup } from './ipc.js';
import { RegisteredGroup } from './types.js';

const OTHER_GROUP: RegisteredGroup = {
  name: 'Other',
  folder: 'other-group',
  trigger: '@Andy',
  added_at: '2024-01-01T00:00:00.000Z',
};

const THIRD_GROUP: RegisteredGroup = {
  name: 'Third',
  folder: 'third-group',
  trigger: '@Andy',
  added_at: '2024-01-01T00:00:00.000Z',
};

let groups: Record<string, RegisteredGroup>;

beforeEach(() => {
  groups = {
    'other@g.us': OTHER_GROUP,
    'third@g.us': THIRD_GROUP,
    'tg:-100123': {
      name: 'Telegram Other',
      folder: 'other-group',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
    },
    'tg:-100999': {
      name: 'Telegram Third',
      folder: 'third-group',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
    },
  };
});

describe('resolveMessageTargetGroup', () => {
  it('returns the exact chat group for non-topic JIDs', () => {
    expect(resolveMessageTargetGroup(groups, 'other@g.us')).toBe(OTHER_GROUP);
  });

  it('resolves Telegram topic JIDs through the parent chat registration', () => {
    expect(resolveMessageTargetGroup(groups, 'tg:-100123:topic:77')).toEqual(
      groups['tg:-100123'],
    );
  });

  it('does not resolve unknown Telegram topics', () => {
    expect(resolveMessageTargetGroup(groups, 'tg:-100555:topic:77')).toBeUndefined();
  });
});
