import { atomWithStorage } from 'jotai/utils';

import type { TopicOption } from '~/core/topics/use-topic-suggestions';

/**
 * Topics picked on onboarding's 'customize-feed' step, held until PendingTopicFollowsRunner follows
 * them. getOnInit so For you sends them on its first request rather than refetching a beat later.
 */
export const FEED_TOPICS_STORAGE_KEY = 'onboardingFeedTopics';

export const feedTopicsAtom = atomWithStorage<TopicOption[]>(FEED_TOPICS_STORAGE_KEY, [], undefined, {
  getOnInit: true,
});

/** The picks as stored right now, which another tab may have changed since this one last rendered. */
export function readStoredFeedTopics(): TopicOption[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FEED_TOPICS_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}
