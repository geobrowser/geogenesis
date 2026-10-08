'use client';

import * as React from 'react';

import cx from 'classnames';

import { useActionContext } from '~/core/action-context-provider';
import { runObservedAction } from '~/core/analytics-operations';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { normId } from '~/core/utils/norm-id';

import { isInterestedFollowEnabled } from './interested';
import { useFollowTopics } from './use-follow-topics';
import { useFollowedTopics } from './use-followed-topics';

export type FollowTopicButtonVariant = 'compact' | 'page';

const NO_PERSONAL_SPACE_HINT = 'You need a personal space to follow';
const UNREGISTERED_SPACE_HINT = 'Your personal space needs to finish setting up before you can follow';

const BASE_CLASS =
  'group/follow inline-flex shrink-0 items-center justify-center rounded-full border whitespace-nowrap transition-colors duration-150 disabled:cursor-default';

/**
 * Compact sits in a card's action row beside the comment count. Page is the topic header's only
 * action, so it is the black pill until followed, then steps down to the white one: the press is
 * done, and the button no longer needs to ask for it.
 */
const VARIANT_CLASS: Record<
  FollowTopicButtonVariant,
  { shape: string; innerGap: string; idle: string; following: string }
> = {
  compact: {
    shape: 'h-[22px] gap-[5px] pr-2 pl-[7px] text-[14px] leading-none tracking-[-0.35px] text-[#151515]',
    innerGap: 'gap-[5px]',
    idle: 'border-grey-02 bg-white hover:border-grey-04',
    following: 'min-w-[86px] border-grey-02 bg-grey-01 hover:border-grey-04',
  },
  page: {
    shape: 'h-7 gap-1.5 pr-[11px] pl-[9px] text-[16px] leading-[13px] tracking-[-0.35px]',
    innerGap: 'gap-1.5',
    idle: 'border-transparent bg-[#151515] text-white hover:bg-grey-05',
    following: 'min-w-[116px] border-grey-02 bg-white text-[#151515] hover:border-text',
  },
};

/**
 * Follow or unfollow one topic (GEO-3191). The topic's only action, in place of the votes.
 *
 * Signed out, the press is held in the app-level queue and sign-in opens; the follow lands once the
 * new account has a personal space, without a second press. Signed in with no personal space, it
 * can't be written at all and says so. While the viewer's own follows are loading it can't be
 * pressed, or a follow would be written for a topic already followed.
 */
export function FollowTopicButton({
  topic,
  variant = 'compact',
  className,
}: {
  topic: { id: string; name?: string | null };
  variant?: FollowTopicButtonVariant;
  className?: string;
}) {
  const topicId = normId(topic.id);
  const { follow, unfollow, isPending } = useFollowTopics();
  const { topicIds, isLoading: isLoadingFollows } = useFollowedTopics();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId: anyPersonalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace } = usePersonalSpaceId();
  // An Interested follow is cast from the personal space on chain, so one not yet registered there
  // can't write it; a `Following` relation only needs the space to exist.
  const personalSpaceId = isInterestedFollowEnabled() && !isRegistered ? null : anyPersonalSpaceId;
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const getContext = useActionContext('topic_follow_button', 'topic', topicId);

  const followed = topicIds.has(topicId);
  const topicRef = React.useMemo(() => ({ id: topicId, name: topic.name ?? null }), [topicId, topic.name]);

  const observed = React.useCallback(
    (kind: 'follow_topic' | 'unfollow_topic', write: () => Promise<boolean>) =>
      runObservedAction(kind, getContext(), write, ok => (ok ? null : 'publish_failed')),
    [getContext]
  );

  const queuedFollow = useQueuedAction({
    id: `follow-topic:${topicId}`,
    component: 'topic_follow_button',
    label: 'your follow',
    // The write reads the personal space from the render, which the press predates.
    liveOnly: true,
    ready: !isLoadingFollows,
    run: async () => {
      // Signed in to an account that already follows it: what the press asked for is already true.
      if (followed) return;
      // The runner drops an action whose run resolves, so a follow that didn't land has to throw.
      if (!(await observed('follow_topic', () => follow([topicRef])))) {
        throw new Error('Your follow could not be saved yet.');
      }
    },
  });

  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'topic_follow_button',
      target_type: 'topic',
      target_id: topicId,
      auth_control: 'follow',
      auth_intent: 'follow_topic',
      auth_continuation: 'queued',
    },
  });

  const saving = isPending(topicId);
  const shownFollowed = followed || queuedFollow.isQueued;
  const signedIn = Boolean(smartAccount);
  const noPersonalSpace =
    signedIn && !personalSpaceId && !isLoadingPersonalSpace && !isAccountSetupPending && !queuedFollow.isQueued;
  const disabled = noPersonalSpace || (Boolean(personalSpaceId) && isLoadingFollows);

  const onPress = (event: React.MouseEvent) => {
    // Cards are links and side-panel triggers underneath; the press is the button's alone.
    event.preventDefault();
    event.stopPropagation();
    if (saving || disabled) return;

    if (followed) {
      void observed('unfollow_topic', () => unfollow([topicId]));
      return;
    }
    if (queuedFollow.isQueued) {
      queuedFollow.cancel();
      return;
    }
    if (!signedIn) {
      queuedFollow.queue();
      promptSignIn(undefined, { onCancel: queuedFollow.cancel });
      return;
    }
    if (personalSpaceId) {
      void observed('follow_topic', () => follow([topicRef]));
      return;
    }
    // Signed in with the personal space still on its way: hold the press until it exists.
    queuedFollow.queue();
  };

  const styles = VARIANT_CLASS[variant];
  const iconSize = variant === 'page' ? 11 : 10;

  return (
    <button
      type="button"
      aria-pressed={shownFollowed}
      aria-label={shownFollowed ? `Unfollow ${topic.name ?? 'this topic'}` : `Follow ${topic.name ?? 'this topic'}`}
      title={noPersonalSpace ? (anyPersonalSpaceId ? UNREGISTERED_SPACE_HINT : NO_PERSONAL_SPACE_HINT) : undefined}
      disabled={disabled}
      aria-busy={saving || undefined}
      onClick={onPress}
      data-geo-analytics-label={shownFollowed ? 'unfollow_topic' : 'follow_topic'}
      className={cx(
        BASE_CLASS,
        styles.shape,
        shownFollowed ? styles.following : styles.idle,
        saving && (variant === 'page' ? 'opacity-60' : 'text-link'),
        disabled && 'opacity-50',
        className
      )}
    >
      {shownFollowed ? (
        <>
          <span className={cx('inline-flex items-center', styles.innerGap, !saving && 'group-hover/follow:hidden')}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M1.5 6L4.5 9L10.5 3" stroke="currentColor" />
            </svg>
            Following
          </span>
          {!saving ? <span className="hidden group-hover/follow:inline">Unfollow</span> : null}
        </>
      ) : (
        <>
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 13 13"
            fill="none"
            aria-hidden
            className={variant === 'compact' ? 'text-grey-04' : undefined}
          >
            <path d="M6.5 0V13" stroke="currentColor" strokeWidth="1.3" />
            <path d="M0 6.5L13 6.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Follow
        </>
      )}
      {saving ? <SavingDots /> : null}
    </button>
  );
}

function SavingDots() {
  return (
    <span className="ml-px inline-flex gap-0.5" aria-hidden>
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="size-[3px] animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
