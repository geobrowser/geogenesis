'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

// The debate whose post-debate thank-you screen the user is currently on, or null. The room page
// is the only thing that knows. `/me/debate-activity` nulls `active_debate_id` as soon as the
// thank-you period starts, so the global upload banner can't read it back off the API.
const thankingDebateIdAtom = atom<string | null>(null);

export const useThankingDebateId = () => useAtomValue(thankingDebateIdAtom);

export const useSetThankingDebateId = () => useSetAtom(thankingDebateIdAtom);
