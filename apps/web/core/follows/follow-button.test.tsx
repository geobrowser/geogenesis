import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FollowButton, FollowTopicButton } from './follow-button';

const TOPIC = '5ef5a5860f274d8e8f6c59ae5b3e89e2';
const ADA_SPACE = '73a82967cb12f604f9589ac4bc8024cb';

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
  /** The kind each follow hook was last asked for. */
  writesKind: null as string | null,
  readsKind: null as string | null,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated }),
}));
vi.mock('~/core/topics/use-follow-topics', () => ({
  useFollowEntities: ({ kind }: { kind: string }) => {
    mocks.writesKind = kind;
    return {
      follow: mocks.follow,
      unfollow: mocks.unfollow,
      isPending: (id: string) => mocks.pendingIds.has(id),
      canFollow: true,
    };
  },
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedEntities: ({ kind }: { kind: string }) => {
    mocks.readsKind = kind;
    return { topicIds: mocks.followedIds, rows: [], isLoading: mocks.isLoadingFollows };
  },
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

  it('says the space must finish registering, since a follow is cast from it on chain', () => {
    mocks.isRegistered = false;
    renderButton();
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Your personal space needs to finish setting up before you can follow');
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

  describe('on a person (GEO-3236)', () => {
    const renderPerson = () => render(<FollowButton target={{ kind: 'person', id: ADA_SPACE, name: 'Ada Okafor' }} />);

    it('follows a person by their personal space id, always as an Interested', () => {
      renderPerson();
      fireEvent.click(screen.getByRole('button', { name: 'Follow Ada Okafor' }));

      expect(mocks.follow).toHaveBeenCalledWith([{ id: ADA_SPACE, name: 'Ada Okafor' }]);
      expect(mocks.writesKind).toBe('person');
      expect(mocks.readsKind).toBe('person');
      expect(mocks.observed).toHaveBeenCalledWith('follow_person');
    });

    it('unfollows a person in one press', () => {
      mocks.followedIds = new Set([ADA_SPACE]);
      renderPerson();
      fireEvent.click(screen.getByRole('button', { name: 'Unfollow Ada Okafor' }));

      expect(mocks.unfollow).toHaveBeenCalledWith([ADA_SPACE]);
      expect(mocks.observed).toHaveBeenCalledWith('unfollow_person');
    });

    it('draws nothing on your own profile', () => {
      mocks.personalSpaceId = ADA_SPACE;
      const { container } = renderPerson();

      expect(container).toBeEmptyDOMElement();
    });

    it("can't be pressed until the viewer's own space is known, so it can't be your own row", () => {
      mocks.personalSpaceId = null;
      mocks.isLoadingPersonalSpace = true;
      renderPerson();

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('drops a queued follow that turns out to be for your own space', async () => {
      // Pressed on your own row while signed out; you then sign in as that person.
      mocks.personalSpaceId = ADA_SPACE;
      renderPerson();
      await mocks.queuedRun?.();

      expect(mocks.follow).not.toHaveBeenCalled();
    });

    it('needs a registered personal space, as a topic follow does', () => {
      // A follow is an Interested, which is cast on chain.
      mocks.isRegistered = false;
      renderPerson();

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  it('follows a topic as a topic', () => {
    renderButton();

    expect(mocks.writesKind).toBe('topic');
    expect(mocks.readsKind).toBe('topic');
  });
});

describe('the avatar badge (GEO-3305)', () => {
  // A fresh element per render: React skips re-rendering an element it has already seen.
  const badge = () => <FollowButton target={{ kind: 'person', id: ADA_SPACE, name: 'Ada' }} variant="avatar" />;
  const renderBadge = () => render(badge());
  const TICK = 'path[d="M1.5 6L4.5 9L10.5 3"]';

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a "+" with no label text, and follows on press', () => {
    renderBadge();
    const badge = screen.getByRole('button', { name: 'Follow Ada' });

    expect(badge).not.toHaveTextContent('Follow');
    fireEvent.click(badge);
    expect(mocks.follow).toHaveBeenCalledWith([{ id: ADA_SPACE, name: 'Ada' }]);
  });

  it('draws nothing on a face the viewer already follows', () => {
    mocks.followedIds = new Set([ADA_SPACE]);
    const { container } = renderBadge();

    expect(container).toBeEmptyDOMElement();
  });

  it('confirms a follow with a tick, then goes', () => {
    vi.useFakeTimers();
    const { container, rerender } = renderBadge();

    fireEvent.click(screen.getByRole('button', { name: 'Follow Ada' }));
    mocks.pendingIds = new Set([ADA_SPACE]);
    rerender(badge());
    mocks.pendingIds = new Set();
    mocks.followedIds = new Set([ADA_SPACE]);
    rerender(badge());
    expect(screen.getByRole('button', { name: 'Unfollow Ada' })).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('holds the tick through a write slower than the confirmation, then goes once it lands', () => {
    vi.useFakeTimers();
    const { container, rerender } = renderBadge();

    fireEvent.click(screen.getByRole('button', { name: 'Follow Ada' }));
    mocks.pendingIds = new Set([ADA_SPACE]);
    rerender(badge());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.querySelector(TICK)).not.toBeNull();

    mocks.pendingIds = new Set();
    mocks.followedIds = new Set([ADA_SPACE]);
    rerender(badge());
    expect(container.querySelector(TICK)).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a queued follow ticked and pressable, so it can be withdrawn', () => {
    vi.useFakeTimers();
    mocks.isQueued = true;
    renderBadge();
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unfollow Ada' }));
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });

  /**
   * The queue outlives the control that queued it. A badge that mounts while the follow is queued —
   * scrolled back into view, or remounted by sign-in — never saw the press, and still owes the
   * viewer the moment of confirmation when the replay lands.
   */
  it('confirms a queued follow that lands after the badge remounted', () => {
    vi.useFakeTimers();
    mocks.isQueued = true;
    const { container, rerender } = renderBadge();
    expect(container.querySelector(TICK)).not.toBeNull();

    // The replay writes, then leaves the queue.
    mocks.pendingIds = new Set([ADA_SPACE]);
    rerender(badge());
    mocks.isQueued = false;
    rerender(badge());
    mocks.pendingIds = new Set();
    mocks.followedIds = new Set([ADA_SPACE]);
    rerender(badge());
    expect(container.querySelector(TICK)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('does not mistake a follow that arrives with nothing in flight for a press whose write failed', () => {
    vi.useFakeTimers();
    const { container, rerender } = renderBadge();

    fireEvent.click(screen.getByRole('button', { name: 'Follow Ada' }));
    mocks.pendingIds = new Set([ADA_SPACE]);
    rerender(badge());
    mocks.pendingIds = new Set();
    rerender(badge());
    expect(screen.getByRole('button', { name: 'Follow Ada' })).toBeInTheDocument();

    // Followed from another tab or device, say: it reaches this one as a refetch, with no write here.
    mocks.followedIds = new Set([ADA_SPACE]);
    rerender(badge());
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The pending write is shared by every Follow control for a person, deliberately: following from
   * the side panel while their video plays ticks the face as well, so the badge never reads "+"
   * beside a panel that says Following.
   */
  it('ticks for a follow pressed in another control for the same person, as it lands', () => {
    vi.useFakeTimers();
    const { container, rerender } = renderBadge();

    mocks.pendingIds = new Set([ADA_SPACE]);
    rerender(badge());
    expect(container.querySelector(TICK)).not.toBeNull();

    mocks.pendingIds = new Set();
    mocks.followedIds = new Set([ADA_SPACE]);
    rerender(badge());
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('does not mistake a later follow for a press whose sign-in was dismissed', () => {
    vi.useFakeTimers();
    mocks.smartAccount = null;
    mocks.authenticated = false;
    const { container, rerender } = renderBadge();

    fireEvent.click(screen.getByRole('button', { name: 'Follow Ada' }));
    expect(mocks.promptSignIn).toHaveBeenCalledOnce();

    // Dismissed, then signed in to an account that already follows Ada.
    mocks.smartAccount = {};
    mocks.authenticated = true;
    mocks.followedIds = new Set([ADA_SPACE]);
    rerender(badge());
    expect(container).toBeEmptyDOMElement();
  });

  describe('handed a different person', () => {
    const GRACE_SPACE = '0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e';
    const graceBadge = () => (
      <FollowButton target={{ kind: 'person', id: GRACE_SPACE, name: 'Grace' }} variant="avatar" />
    );

    it("does not read the last person's follow in flight as this person's landing", () => {
      vi.useFakeTimers();
      const { container, rerender } = renderBadge();
      mocks.pendingIds = new Set([ADA_SPACE]);
      rerender(badge());

      mocks.followedIds = new Set([GRACE_SPACE]);
      rerender(graceBadge());
      expect(container).toBeEmptyDOMElement();
    });

    it("does not carry the last person's tick over", () => {
      vi.useFakeTimers();
      const { container, rerender } = renderBadge();
      mocks.pendingIds = new Set([ADA_SPACE]);
      rerender(badge());
      mocks.pendingIds = new Set();
      mocks.followedIds = new Set([ADA_SPACE, GRACE_SPACE]);
      rerender(badge());
      expect(container.querySelector(TICK)).not.toBeNull();

      rerender(graceBadge());
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('comes back as a "+" when a follow it confirmed did not land', () => {
    vi.useFakeTimers();
    renderBadge();

    fireEvent.click(screen.getByRole('button', { name: 'Follow Ada' }));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Follow Ada' })).toHaveAttribute('aria-pressed', 'false');
  });
});
