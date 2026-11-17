import { cleanup, render } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RedirectedPendingAction, pendingActionsAtom, restorePendingActions } from '~/core/state/pending-actions';

import { FollowTopicButton } from './follow-button';

const TOPIC = '5ef5a5860f274d8e8f6c59ae5b3e89e2';

const mocks = vi.hoisted(() => ({
  follow: vi.fn(async () => true),
  followedIds: new Set<string>(),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => ({ ready: true, authenticated: true }) }));
vi.mock('~/core/topics/use-follow-topics', () => ({
  useFollowEntities: () => ({ follow: mocks.follow, unfollow: vi.fn(), isPending: () => false, canFollow: true }),
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedEntities: () => ({ topicIds: mocks.followedIds, rows: [], isLoading: false }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: {} }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'personal-space', isRegistered: true, isLoading: false }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false, topicId: null }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));
vi.mock('~/core/analytics-operations', () => ({
  runObservedAction: (_action: string, _context: unknown, run: () => Promise<unknown>) => run(),
}));

const savedFollow: RedirectedPendingAction = {
  id: `follow-topic:${TOPIC}`,
  label: 'your follow',
  requires: 'personalSpace',
  intent: 'queued',
  context: {
    component: 'topic_follow_button',
    page_path: '/topic',
    page_type: 'topic',
    page_view_id: 'pv-1',
    target_id: TOPIC,
    target_type: 'topic',
  },
};

let store = createStore();

function returnWithSavedFollow() {
  restorePendingActions(store, [savedFollow]);
  render(
    <Provider store={store}>
      <FollowTopicButton topic={{ id: TOPIC, name: 'Nuclear energy' }} />
    </Provider>
  );
  const [action] = store.get(pendingActionsAtom);
  return action!.run();
}

beforeEach(() => {
  store = createStore();
  mocks.follow.mockReset().mockResolvedValue(true);
  mocks.followedIds = new Set();
});

afterEach(cleanup);

describe('a follow brought back from a Google sign-in', () => {
  it('follows once, through the button on the page it returned to', async () => {
    await returnWithSavedFollow();

    expect(mocks.follow).toHaveBeenCalledTimes(1);
    expect(mocks.follow).toHaveBeenCalledWith([{ id: TOPIC, name: 'Nuclear energy' }]);
  });

  it('is dropped quietly for an account that already follows the topic', async () => {
    mocks.followedIds = new Set([TOPIC]);

    await expect(returnWithSavedFollow()).resolves.toBeUndefined();
    expect(mocks.follow).not.toHaveBeenCalled();
  });
});
