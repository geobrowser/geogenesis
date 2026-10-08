import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FollowTopicButton } from './follow-topic-button';

const TOPIC = '5ef5a5860f274d8e8f6c59ae5b3e89e2';

const mocks = vi.hoisted(() => ({
  follow: vi.fn(async () => true),
  unfollow: vi.fn(async () => true),
  pendingIds: new Set<string>(),
  followedIds: new Set<string>(),
  isLoadingFollows: false,
  authReady: true,
  authenticated: true,
  smartAccount: {} as object | null,
  personalSpaceId: 'personal-space' as string | null,
  isRegistered: true,
  isLoadingPersonalSpace: false,
  isAccountSetupPending: false,
  promptSignIn: vi.fn(),
  queue: vi.fn(),
  cancel: vi.fn(),
  isQueued: false,
  queuedRun: null as null | (() => Promise<void> | void),
  observed: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated }),
}));
vi.mock('./use-follow-topics', () => ({
  useFollowTopics: () => ({
    follow: mocks.follow,
    unfollow: mocks.unfollow,
    isPending: (id: string) => mocks.pendingIds.has(id),
    canFollow: true,
  }),
}));
vi.mock('./use-followed-topics', () => ({
  useFollowedTopics: () => ({ topicIds: mocks.followedIds, rows: [], isLoading: mocks.isLoadingFollows }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.smartAccount }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({
    personalSpaceId: mocks.personalSpaceId,
    isRegistered: mocks.isRegistered,
    isLoading: mocks.isLoadingPersonalSpace,
  }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: mocks.isAccountSetupPending, topicId: null }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: (options: { run: () => Promise<void> | void }) => {
    mocks.queuedRun = options.run;
    return { intent: undefined, isQueued: mocks.isQueued, queue: mocks.queue, cancel: mocks.cancel };
  },
}));
vi.mock('~/core/action-context-provider', () => ({
  useActionContext: () => () => ({ component: 'topic_follow_button', target_type: 'topic', target_id: TOPIC }),
}));
vi.mock('~/core/analytics-operations', () => ({
  runObservedAction: (action: string, _context: unknown, run: () => Promise<unknown>) => {
    mocks.observed(action);
    return run();
  },
}));

beforeEach(() => {
  mocks.follow.mockReset().mockResolvedValue(true);
  mocks.unfollow.mockReset().mockResolvedValue(true);
  mocks.pendingIds = new Set();
  mocks.followedIds = new Set();
  mocks.isLoadingFollows = false;
  mocks.authReady = true;
  mocks.authenticated = true;
  mocks.smartAccount = {};
  mocks.personalSpaceId = 'personal-space';
  mocks.isRegistered = true;
  mocks.isLoadingPersonalSpace = false;
  mocks.isAccountSetupPending = false;
  mocks.promptSignIn.mockReset();
  mocks.queue.mockReset();
  mocks.cancel.mockReset();
  mocks.isQueued = false;
  mocks.queuedRun = null;
  mocks.observed.mockReset();
});

afterEach(cleanup);

const renderButton = () => render(<FollowTopicButton topic={{ id: TOPIC, name: 'Nuclear energy' }} />);

describe('FollowTopicButton', () => {
  it('follows a topic the viewer does not follow', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Follow Nuclear energy' });

    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);

    expect(mocks.follow).toHaveBeenCalledWith([{ id: TOPIC, name: 'Nuclear energy' }]);
    expect(mocks.observed).toHaveBeenCalledWith('follow_topic');
  });

  it('reads Following once followed, and unfollows in one press', () => {
    mocks.followedIds = new Set([TOPIC]);
    renderButton();
    const button = screen.getByRole('button', { name: 'Unfollow Nuclear energy' });

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Following');
    fireEvent.click(button);

    expect(mocks.unfollow).toHaveBeenCalledWith([TOPIC]);
    expect(mocks.observed).toHaveBeenCalledWith('unfollow_topic');
  });

  it('ignores presses while a write for the topic is saving', () => {
    mocks.pendingIds = new Set([TOPIC]);
    renderButton();
    const button = screen.getByRole('button');

    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);

    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it("can't be pressed before the viewer's follows have loaded", () => {
    mocks.isLoadingFollows = true;
    renderButton();

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('queues the follow and opens sign-in when signed out', () => {
    mocks.authenticated = false;
    mocks.smartAccount = null;
    mocks.personalSpaceId = null;
    renderButton();
    fireEvent.click(screen.getByRole('button'));

    expect(mocks.queue).toHaveBeenCalled();
    expect(mocks.promptSignIn).toHaveBeenCalledWith(undefined, { onCancel: mocks.cancel });
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it('waits rather than opening sign-in while a signed-in account is still loading', () => {
    mocks.smartAccount = null;
    mocks.personalSpaceId = null;
    mocks.isLoadingPersonalSpace = true;
    renderButton();
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('waits while Privy is still starting', () => {
    mocks.authReady = false;
    mocks.authenticated = false;
    mocks.smartAccount = null;
    renderButton();

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('says why when signed in with no personal space', () => {
    mocks.personalSpaceId = null;
    renderButton();
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'You need a personal space to follow');
  });

  it('says the space must finish registering when an Interested follow needs it on chain', () => {
    vi.stubEnv('NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED', 'true');
    mocks.isRegistered = false;
    renderButton();
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Your personal space needs to finish setting up before you can follow');
    vi.unstubAllEnvs();
  });

  it('holds the press while a new personal space is on its way', () => {
    mocks.personalSpaceId = null;
    mocks.isAccountSetupPending = true;
    renderButton();
    fireEvent.click(screen.getByRole('button'));

    expect(mocks.queue).toHaveBeenCalled();
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
  });

  it('draws a queued follow as Following, and a second press withdraws it', () => {
    mocks.authenticated = false;
    mocks.smartAccount = null;
    mocks.personalSpaceId = null;
    mocks.isQueued = true;
    renderButton();
    const button = screen.getByRole('button');

    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);

    expect(mocks.cancel).toHaveBeenCalled();
  });

  describe('replaying a queued follow', () => {
    it('follows once the account is ready', async () => {
      renderButton();
      await mocks.queuedRun?.();

      expect(mocks.follow).toHaveBeenCalledWith([{ id: TOPIC, name: 'Nuclear energy' }]);
    });

    it('writes nothing for an account that already follows the topic', async () => {
      mocks.followedIds = new Set([TOPIC]);
      renderButton();
      await mocks.queuedRun?.();

      expect(mocks.follow).not.toHaveBeenCalled();
    });

    it('throws when the follow did not land, so the queue keeps it', async () => {
      mocks.follow.mockResolvedValue(false);
      renderButton();

      await expect(mocks.queuedRun?.()).rejects.toThrow('Your follow could not be saved yet.');
    });
  });
});
