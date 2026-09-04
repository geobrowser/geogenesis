import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

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

// `getOnInit` reads localStorage when the atom is *created* — module import,
// which in the browser is page load, exactly when a previous session's chat is
// already on disk. So each case has to seed storage and then load the module
// fresh; reading an already-imported atom would measure the wrong moment.
async function atomsLoadedWith(seed: Record<string, unknown>) {
  localStorage.clear();
  for (const [key, value] of Object.entries(seed)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  vi.resetModules();
  return import('./chat-store');
}

describe('chat atoms read storage on init', () => {
  // Without `getOnInit` these atoms start at their initial value and only read
  // localStorage a beat later. The widget restores in a mount effect, so it saw
  // `null`, restored nothing, and marked itself hydrated — then the persist
  // effect found zero messages and wrote `null` over the saved chat. That is the
  // reload-loses-the-conversation bug, so the first read has to be the real one.
  it('yields a chat saved before the page loaded', async () => {
    const saved: PersistedChat = { id: 'chat-1', title: 'Saved', messages: [], updatedAt: 1 };
    const atoms = await atomsLoadedWith({ 'geo:chat:current': saved });

    expect(createStore().get(atoms.currentChatAtom)).toEqual(saved);
  });

  it('yields saved history on the first read', async () => {
    const atoms = await atomsLoadedWith({ 'geo:chat:history': [chat('archived')] });

    expect(createStore().get(atoms.chatHistoryAtom).map(c => c.id)).toEqual(['archived']);
  });

  it('falls back to the initial value when nothing is stored', async () => {
    const atoms = await atomsLoadedWith({});
    const store = createStore();

    expect(store.get(atoms.currentChatAtom)).toBeNull();
    expect(store.get(atoms.chatHistoryAtom)).toEqual([]);
  });

  it('falls back to the initial value when the stored JSON is corrupt', async () => {
    const atoms = await atomsLoadedWith({ 'geo:chat:current': '{not json' });

    expect(createStore().get(atoms.currentChatAtom)).toBeNull();
  });
});
