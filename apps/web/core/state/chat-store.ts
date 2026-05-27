import type { UIMessage } from 'ai';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { InjectType } from '~/core/chat/inject-types';

export const isChatOpenAtom = atom(false);

export const hasSeenAssistantAtom = atomWithStorage('geo:has-seen-assistant', false);

export type AssistantSeed =
  | { mode: 'ingestion'; url: string }
  | { mode: 'inject'; url: string; jobId: string; injectType: InjectType };

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
export const currentChatAtom = atomWithStorage<PersistedChat | null>('geo:chat:current', null);
export const chatHistoryAtom = atomWithStorage<PersistedChat[]>('geo:chat:history', []);

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

// Quota-aware update for chatHistoryAtom. `update` receives the prior list
// and returns the desired next list. Functional form so callers reading
// chatHistory inside the same tick (after a previous setter that React hasn't
// committed yet) still see the freshest value via `prev`. On
// QuotaExceededError, drops the oldest archived chat and retries once.
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
  } catch (err) {
    const captured = computed as PersistedChat[] | null;
    if (!isQuotaError(err) || !captured || captured.length === 0) return;
    try {
      set(captured.slice(0, -1));
    } catch {
      // Give up — in-memory state still works.
    }
  }
}
