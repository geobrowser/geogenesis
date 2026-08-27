import { describe, expect, it } from 'vitest';

import { type PersistedChat, updateChatHistorySafely } from './chat-store';

function chat(id: string): PersistedChat {
  return { id, title: id, messages: [], updatedAt: 0 };
}

function quotaError(): Error {
  const err = new Error('quota');
  err.name = 'QuotaExceededError';
  return err;
}

// Simulates jotai's atomWithStorage: in-memory updates first, then the
// localStorage write throws on quota. `fits` decides whether a given list size
// is persistable.
function makeStore(fits: (list: PersistedChat[]) => boolean) {
  let memory: PersistedChat[] = [];
  let persisted: PersistedChat[] = [];
  const set = (next: PersistedChat[] | ((prev: PersistedChat[]) => PersistedChat[])) => {
    memory = typeof next === 'function' ? next(memory) : next;
    if (!fits(memory)) throw quotaError();
    persisted = memory;
  };
  return { set, getPersisted: () => persisted };
}

describe('updateChatHistorySafely', () => {
  it('persists everything when under quota', () => {
    const store = makeStore(() => true);
    updateChatHistorySafely(store.set, () => [chat('new'), chat('a'), chat('b')]);
    expect(store.getPersisted().map(c => c.id)).toEqual(['new', 'a', 'b']);
  });

  it('evicts oldest entries until the newest archive fits (GEO-2219)', () => {
    // Only 2 chats fit. Archiving a 4th must drop the two oldest, never the new one.
    const store = makeStore(list => list.length <= 2);
    updateChatHistorySafely(store.set, () => [chat('new'), chat('old1'), chat('old2'), chat('old3')]);
    expect(store.getPersisted().map(c => c.id)).toEqual(['new', 'old1']);
  });

  it('ignores non-quota errors without looping', () => {
    const store = makeStore(() => {
      throw new Error('boom');
    });
    expect(() => updateChatHistorySafely(store.set, () => [chat('new')])).not.toThrow();
    expect(store.getPersisted()).toEqual([]);
  });
});
