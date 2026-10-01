import { atomWithStorage } from 'jotai/utils';

import type { TopicOption } from '~/core/topics/use-topic-suggestions';

/**
 * Topics picked on onboarding's 'customize-feed' step, held until PendingTopicFollowsRunner follows
 * them. getOnInit so For you sends them on its first request rather than refetching a beat later.
 */
export const feedTopicsAtom = atomWithStorage<TopicOption[]>('onboardingFeedTopics', [], undefined, {
  getOnInit: true,
});
