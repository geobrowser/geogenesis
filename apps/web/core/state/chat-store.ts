import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const isChatOpenAtom = atom(false);

export const hasSeenAssistantAtom = atomWithStorage('geo:has-seen-assistant', false);

export type ChatSize = 'default' | 'expanded';

export const chatSizeAtom = atomWithStorage<ChatSize>('geo:chat-size', 'default');
