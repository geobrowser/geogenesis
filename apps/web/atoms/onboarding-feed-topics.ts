import { atomWithStorage } from 'jotai/utils';

import type { TopicOption } from '~/core/topics/use-topic-suggestions';

export type HeldFeedTopics = { address: string; topics: TopicOption[] };

export const FEED_TOPICS_STORAGE_KEY = 'onboardingFeedTopics';
export const NO_HELD_FEED_TOPICS: HeldFeedTopics = { address: '', topics: [] };

/**
 * Topics picked on onboarding's 'customize-feed' step, held until PendingTopicFollowsRunner follows
 * them. getOnInit so For you sends them on its first request rather than refetching a beat later.
 */
export const feedTopicsAtom = atomWithStorage<HeldFeedTopics>(FEED_TOPICS_STORAGE_KEY, NO_HELD_FEED_TOPICS, undefined, {
  getOnInit: true,
});

/** The held picks if `address` chose them, else none: a wallet can switch without a logout. */
export function heldTopicsFor(held: unknown, address: string | null | undefined): TopicOption[] {
  if (!address || !held || typeof held !== 'object' || Array.isArray(held)) return [];
  const record = held as Partial<HeldFeedTopics>;
  if (typeof record.address !== 'string' || record.address.toLowerCase() !== address.toLowerCase()) return [];
  return Array.isArray(record.topics) ? record.topics : [];
}

/** The record as stored right now, which another tab may have changed since this one last rendered. */
export function readStoredFeedTopics(): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(FEED_TOPICS_STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}
