import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicFollowButton } from './topic-follow-button';

const TOPIC_ID = '33333333-3333-3333-3333-333333333333';
const SPACE_ID = '44444444-4444-4444-4444-444444444444';

const mocks = vi.hoisted(() => ({
  address: '0xabc' as string | null,
  isLoadingAccount: false,
  followedTopicIds: new Set<string>(),
  isLoadingFollows: false,
  pendingTopicIds: new Set<string>(),
  canFollow: true,
  follow: vi.fn(),
  unfollow: vi.fn(),
  promptSignIn: vi.fn(),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({
    smartAccount: mocks.address ? { account: { address: mocks.address } } : null,
    isLoading: mocks.isLoadingAccount,
  }),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

vi.mock('../use-followed-topics', () => ({
  useFollowedTopics: () => ({ topicIds: mocks.followedTopicIds, rows: [], isLoading: mocks.isLoadingFollows }),
}));

vi.mock('../use-follow-topics', () => ({
  useFollowTopics: () => ({
    follow: mocks.follow,
    unfollow: mocks.unfollow,
    isPending: (topicId: string) => mocks.pendingTopicIds.has(topicId),
    canFollow: mocks.canFollow,
  }),
}));

beforeEach(() => {
  mocks.address = '0xabc';
  mocks.isLoadingAccount = false;
  mocks.followedTopicIds = new Set();
  mocks.isLoadingFollows = false;
  mocks.pendingTopicIds = new Set();
  mocks.canFollow = true;
  mocks.follow.mockReset().mockResolvedValue(true);
  mocks.unfollow.mockReset().mockResolvedValue(true);
  mocks.promptSignIn.mockReset();
});

afterEach(cleanup);

function renderButton() {
  return render(<TopicFollowButton topicId={TOPIC_ID} spaceId={SPACE_ID} topicName="Mental health" />);
}

describe('TopicFollowButton', () => {
  it('follows the topic in one press, naming the space it was read in', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Follow' }));

    expect(mocks.follow).toHaveBeenCalledWith([{ id: TOPIC_ID, name: 'Mental health', spaceId: SPACE_ID }]);
  });

  it('reads as followed once the follow lands', () => {
    mocks.followedTopicIds = new Set([TOPIC_ID.replaceAll('-', '')]);
    renderButton();

    const button = screen.getByRole('button', { name: 'Following' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  /*
   * The set holds dashless ids and the page hands over the entity's own, which carries dashes.
   * Comparing them raw reads every followed topic as unfollowed — the page would open on `Follow`
   * for a topic the viewer already follows, and the press would publish a second row.
   */
  it('recognises a followed topic whose stored id is dashless', () => {
    mocks.followedTopicIds = new Set([TOPIC_ID.replaceAll('-', '')]);
    renderButton();

    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  it('unfollows from the same button', async () => {
    mocks.followedTopicIds = new Set([TOPIC_ID.replaceAll('-', '')]);
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Following' }));

    expect(mocks.unfollow).toHaveBeenCalledWith([TOPIC_ID]);
  });

  it('waits under the cursor while the publish is out, without claiming it landed', () => {
    mocks.pendingTopicIds = new Set([TOPIC_ID]);
    renderButton();

    const button = screen.getByRole('button', { name: 'Following…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  describe('signed out', () => {
    beforeEach(() => {
      mocks.address = null;
      mocks.canFollow = false;
    });

    // The Verify button this one is shaped after renders nothing without a personal space. Copying
    // that here would leave a signed-out visitor — the reader this control exists to convert —
    // with nothing on the page to press.
    it('still offers the button, and prompts sign-in rather than erroring', async () => {
      renderButton();

      const button = screen.getByRole('button', { name: 'Follow' });
      expect(button).toBeEnabled();

      await userEvent.click(button);

      expect(mocks.promptSignIn).toHaveBeenCalled();
      expect(mocks.follow).not.toHaveBeenCalled();
    });
  });

  /*
   * Privy restores a returning viewer's session over a moment in which there is no smart account.
   * Drawing then is not an empty frame but a wrong one: the button would offer a login to someone
   * already signed in, and they would get Privy's dialog for pressing Follow.
   */
  it('draws nothing while the wallet is still resolving', () => {
    mocks.isLoadingAccount = true;
    mocks.address = null;
    renderButton();

    expect(screen.queryByRole('button')).toBeNull();
  });

  /*
   * A follower must see `Following` on arrival (AC3), so the button cannot open on the unfollowed
   * state and correct itself: that is a flip under the reader's eyes, and a press landing inside
   * the window publishes a duplicate row.
   */
  it('draws nothing until the follow list has answered', () => {
    mocks.isLoadingFollows = true;
    renderButton();

    expect(screen.queryByRole('button')).toBeNull();
  });

  /*
   * Signed in with the personal space still being created. The write has nowhere to land, so the
   * button says so and refuses the press.
   *
   * `disabled` is the whole guard here, and the assertions stop there on purpose. A press cannot
   * reach the handler on a disabled button, so any claim about which branch it *would* have taken
   * — that it opens Privy, that it does not — passes whatever the handler says, and would read as
   * coverage of a decision nothing is checking.
   */
  it('disables itself while the personal space is still being set up', () => {
    mocks.canFollow = false;
    renderButton();

    const button = screen.getByRole('button', { name: 'Follow' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Your personal space is still being set up');
  });
});
