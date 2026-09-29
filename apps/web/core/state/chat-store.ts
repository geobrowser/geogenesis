import type { UIMessage } from 'ai';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { InjectType } from '~/core/chat/inject-types';

export const isChatOpenAtom = atom(false);

export const hasSeenAssistantAtom = atomWithStorage('geo:has-seen-assistant', false);

export type AssistantSeed =
  { mode: 'ingestion'; url: string } | { mode: 'inject'; url: string; jobId: string; injectType: InjectType };

// Active in-flight inject job inline UI state. Shared via atom so
// `chat-messages` can render a custom inline progress UI in place of the
// synthetic assistant message's text body, without prop-drilling through
// `ChatPanel`.
export type InjectInlineState = {
  assistantMessageId: string;
  status: 'pending' | 'completed' | 'failed';
  startedAt: number;
};

export const injectInlineAtom = atom<InjectInlineState | null>(null);

export const assistantSeedAtom = atom<AssistantSeed | null>(null);

export const addDataPanelExpandedAtom = atomWithStorage('geo:add-data-panel-expanded', false);

export type ChatSize = { width: number; height: number };

export const DEFAULT_CHAT_SIZE: ChatSize = { width: 320, height: 450 };
export const EXPANDED_CHAT_SIZE: ChatSize = { width: 480, height: 600 };

export const MIN_CHAT_WIDTH = 280;
export const MIN_CHAT_HEIGHT = 320;

export const chatSizeAtom = atomWithStorage<ChatSize>('geo:chat-dimensions', DEFAULT_CHAT_SIZE);

export type PersistedChat = {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
};

// Newest-first; rolls over when full.
export const HISTORY_CAP = 10;

// Split atoms: the in-flight chat changes constantly (every settled message);
// the archive list rarely. Combining them would re-serialize all archived
// chats on every keystroke turn-end.
//
// `getOnInit` so the stored value is there on the first client render. Without
// it `atomWithStorage` starts at the initial value and only reads localStorage
// afterwards — and the widget's restore effect runs once, on mount, so it saw
// `null`, restored nothing, and marked itself hydrated. The persist effect then
// found zero messages and wrote `null` back over the saved chat. That is the
// reload-loses-the-conversation bug: the chat was on disk the whole time, read
// a beat too late, then overwritten. Same reasoning as
// `pendingPersonalSpaceAtom`. Safe during SSR — jotai's default storage
// try/catches `window.localStorage` and falls back to the initial value.
const readStorageOnInit = { getOnInit: true } as const;

export const currentChatAtom = atomWithStorage<PersistedChat | null>(
  'geo:chat:current',
  null,
  undefined,
  readStorageOnInit
);
export const chatHistoryAtom = atomWithStorage<PersistedChat[]>(
  'geo:chat:history',
  [],
  undefined,
  readStorageOnInit
);

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    // Safari throws a generic DOMException with code 22.
    (err as DOMException).code === 22
  );
}

// Quota-aware update for chatHistoryAtom. Functional `update` form so callers
// reading the list within the same tick see the freshest value via `prev`. On
// quota error, evicts the oldest chats until the write succeeds.
export function updateChatHistorySafely(
  set: (next: PersistedChat[] | ((prev: PersistedChat[]) => PersistedChat[])) => void,
  update: (prev: PersistedChat[]) => PersistedChat[]
): void {
  let computed: PersistedChat[] | null = null;
  try {
    set(prev => {
      computed = update(prev);
      return computed;
    });
    return;
  } catch (err) {
    if (!isQuotaError(err) || !computed) return;
  }

  // atomWithStorage mutates memory before the localStorage write, so a quota
  // throw leaves the new list live but unpersisted. List is newest-first; drop
  // from the tail so the just-archived chat (index 0) survives.
  let trimmed = computed as PersistedChat[];
  while (trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
    try {
      set(trimmed);
      return;
    } catch (err) {
      if (!isQuotaError(err)) return;
    }
  }
}
