'use client';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { normId } from '~/core/utils/norm-id';

import { CreateSmall } from '~/design-system/icons/create-small';
import { TickSmall } from '~/design-system/icons/tick-small';

import { useFollowTopics } from '../use-follow-topics';
import { useFollowedTopics } from '../use-followed-topics';

/**
 * Follow this topic, from the page the reader decided they cared about it on.
 *
 * What is deliberately *not* copied is that button's `return null` when there is no personal
 * space. Verify is a statement one account makes about another, so a signed-out visitor has
 * nothing to say and is shown nothing. A follow is the entry point to the For you feed, so a
 * signed-out visitor is exactly who it exists to reach: the control stays, and pressing it opens
 * Privy the way every other signed-out gate in the app does.
 */
export function TopicFollowButton({
  topicId,
  spaceId,
  topicName,
}: {
  topicId: string;
  spaceId: string;
  topicName?: string | null;
}) {
  const { smartAccount, isLoading: isLoadingAccount } = useSmartAccount();
  const { topicIds, isLoading: isLoadingFollows } = useFollowedTopics();
  const { follow, unfollow, isPending, canFollow } = useFollowTopics();
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'topic_page',
      target_id: topicId,
      target_type: 'topic',
      auth_control: 'follow_topic',
      auth_intent: 'follow_topic',
      auth_continuation: 'repeat',
    },
  });

  const isSignedIn = Boolean(smartAccount?.account.address);
  const isFollowing = topicIds.has(normId(topicId));
  const isWriting = isPending(topicId);

  if (isLoadingAccount) return null;
  if (isSignedIn && isLoadingFollows) return null;

  const isAwaitingPersonalSpace = isSignedIn && !canFollow;

  const press = () => {
    if (!isSignedIn) {
      promptSignIn();
      return;
    }
    if (isFollowing) {
      void unfollow([topicId]);
      return;
    }
    void follow([{ id: topicId, name: topicName ?? null, spaceId }]);
  };

  const label = isWriting ? (isFollowing ? 'Unfollowing…' : 'Following…') : isFollowing ? 'Following' : 'Follow';

  const className = isFollowing
    ? 'inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-text px-1.5 text-[12px] leading-[13px] tracking-[-0.35px] text-white transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-50'
    : 'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-dashed border-grey-03 pr-1.5 pl-1 text-[12px] leading-[13px] tracking-[-0.35px] text-grey-04 transition-colors hover:border-grey-04 hover:text-text disabled:cursor-wait disabled:opacity-50';

  return (
    <button
      type="button"
      onClick={press}
      disabled={isWriting || isAwaitingPersonalSpace}
      aria-pressed={isFollowing}
      title={
        isAwaitingPersonalSpace
          ? 'Your personal space is still being set up'
          : !isSignedIn
            ? 'Sign in to follow this topic'
            : isWriting
              ? undefined
              : isFollowing
                ? 'Unfollow'
                : 'Follow'
      }
      className={className}
    >
      {isFollowing ? <TickSmall /> : <CreateSmall />}
      {label}
    </button>
  );
}
