import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const isChatOpenAtom = atom(false);

export const hasSeenAssistantAtom = atomWithStorage('geo:has-seen-assistant', false);

export type ChatSize = { width: number; height: number };

export const DEFAULT_CHAT_SIZE: ChatSize = { width: 320, height: 450 };
export const EXPANDED_CHAT_SIZE: ChatSize = { width: 480, height: 600 };

export const MIN_CHAT_WIDTH = 280;
export const MIN_CHAT_HEIGHT = 320;

export const chatSizeAtom = atomWithStorage<ChatSize>('geo:chat-dimensions', DEFAULT_CHAT_SIZE);
