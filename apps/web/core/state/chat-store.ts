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

export const addDataPanelExpandedAtom = atomWithStorage('geo:add-data-panel-expanded', true);

export type ChatSize = { width: number; height: number };

export const DEFAULT_CHAT_SIZE: ChatSize = { width: 320, height: 450 };
export const EXPANDED_CHAT_SIZE: ChatSize = { width: 480, height: 600 };

export const MIN_CHAT_WIDTH = 280;
export const MIN_CHAT_HEIGHT = 320;

export const chatSizeAtom = atomWithStorage<ChatSize>('geo:chat-dimensions', DEFAULT_CHAT_SIZE);
