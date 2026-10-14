'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';

import { useActionContext } from '~/core/action-context-provider';
import { runObservedAction } from '~/core/analytics-operations';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { useFollowEntities } from '~/core/topics/use-follow-topics';
import { useFollowedEntities } from '~/core/topics/use-followed-topics';
import { normId } from '~/core/utils/norm-id';

/**
 * What a Follow button follows. A topic by its entity id (GEO-3191); a person by their personal
 * space id (GEO-3236), the id every surface that shows a person already has.
 */
export type FollowTarget = { kind: 'topic' | 'person'; id: string; name?: string | null };

export type FollowButtonVariant = 'compact' | 'page' | 'secondary' | 'overlay';

const NO_PERSONAL_SPACE_HINT = 'You need a personal space to follow';
const UNREGISTERED_SPACE_HINT = 'Your personal space needs to finish setting up before you can follow';

const BASE_CLASS =
  'group/follow inline-flex shrink-0 items-center justify-center rounded-full border whitespace-nowrap transition-colors duration-150 disabled:cursor-default';

/**
 * - `compact`: a card's action row, a list row, the side panel.
 * - `page`: a topic header's only action — the black pill until followed, then the white one,
 *   because the press is done and no longer needs asking for.
 * - `secondary`: the same size as `page`, but white until followed, beside a black pill that is the
 *   page's main action (a profile's Request debate). Followed, it fills grey-01, the same settled
 *   state the compact pill takes.
 * - `overlay`: over video, at the height, type and fill of the Agree / Disagree chip beside it.
 */
const VARIANT_CLASS: Record<
  FollowButtonVariant,
  { shape: string; innerGap: string; idle: string; following: string; plus: number; tick: number }
> = {
  compact: {
    shape: 'h-[22px] gap-[5px] pr-2 pl-[7px] text-[14px] leading-none tracking-[-0.35px] text-[#151515]',
    innerGap: 'gap-[5px]',
    idle: 'border-grey-02 bg-white hover:border-grey-04',
    following: 'min-w-[86px] border-grey-02 bg-grey-01 hover:border-grey-04',
    plus: 10,
    tick: 12,
  },
  page: {
    shape: 'h-7 gap-1.5 pr-[11px] pl-[9px] text-[16px] leading-[13px] tracking-[-0.35px]',
    innerGap: 'gap-1.5',
    idle: 'border-transparent bg-[#151515] text-white hover:bg-grey-05',
    following: 'min-w-[116px] border-grey-02 bg-white text-[#151515] hover:border-text',
    plus: 11,
    tick: 12,
  },
  secondary: {
    shape: 'h-7 gap-1.5 pr-[11px] pl-[9px] text-[16px] leading-[13px] tracking-[-0.35px] text-[#151515]',
    innerGap: 'gap-1.5',
    idle: 'border-grey-02 bg-white hover:border-text',
    following: 'min-w-[116px] border-grey-02 bg-grey-01 hover:border-text',
    plus: 11,
    tick: 12,
  },
  overlay: {
    shape: 'h-4 gap-1 px-1.5 text-[0.75rem] leading-none',
    innerGap: 'gap-1',
    idle: 'border-transparent bg-white/85 text-text hover:bg-white',
    following: 'min-w-[70px] border-transparent bg-white/25 text-white hover:bg-white/35',
    plus: 8,
    tick: 9,
  },
};

const KIND = {
  topic: {
    component: 'topic_follow_button',
    targetType: 'topic',
    follow: 'follow_topic',
    unfollow: 'unfollow_topic',
    fallbackName: 'this topic',
  },
  person: {
    component: 'person_follow_button',
    targetType: 'person',
    follow: 'follow_person',
    unfollow: 'unfollow_person',
    fallbackName: 'this person',
  },
} as const;

/**
 * Follow or unfollow one topic or person: in place of the votes wherever it stands, since following
 * is what either is for.
 *
 * A follow is an Interested vote, for a topic and a person alike. Signed out, the press is held in
 * the app-level queue and sign-in opens; the follow lands once the new account has a personal space,
 * without a second press. Signed in with no personal space, it can't be written at all and says so.
 * While the viewer's own follows are loading it can't be pressed, or a follow would be written for
 * something already followed. Nobody follows themselves, so on your own profile there is no button.
 */
export function FollowButton({
  target,
  variant = 'compact',
  className,
}: {
  target: FollowTarget;
  variant?: FollowButtonVariant;
  className?: string;
}) {
  const kind = KIND[target.kind];
  const targetId = normId(target.id);
  const { follow, unfollow, isPending } = useFollowEntities({ kind: target.kind });
  const { topicIds: followedIds, isLoading: isLoadingFollows } = useFollowedEntities({ kind: target.kind });
  const { ready: authReady, authenticated } = usePrivy();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId: anyPersonalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace } = usePersonalSpaceId();
  // A follow is an Interested cast from the personal space on chain, so one not yet registered
  // there can't write it.
  const personalSpaceId = isRegistered ? anyPersonalSpaceId : null;
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const getContext = useActionContext(kind.component, kind.targetType, targetId);

  const followed = followedIds.has(targetId);
  // Nobody follows themselves. Read again when a queued press replays, since the press can come
  // before the account it belongs to is known: their own row, pressed signed out.
  const isSelf =
    target.kind === 'person' && Boolean(anyPersonalSpaceId) && normId(anyPersonalSpaceId ?? '') === targetId;
  const targetRef = React.useMemo(() => ({ id: targetId, name: target.name ?? null }), [targetId, target.name]);

  const observed = React.useCallback(
    (action: 'follow' | 'unfollow', write: () => Promise<boolean>) =>
      runObservedAction(kind[action], getContext(), write, ok => (ok ? null : 'publish_failed')),
    [getContext, kind]
  );

  const queuedFollow = useQueuedAction({
    id: `follow-${target.kind}:${targetId}`,
    component: kind.component,
    label: 'your follow',
    // The write reads the personal space from the render, which the press predates.
    liveOnly: true,
    ready: !isLoadingFollows,
    run: async () => {
      // Signed in to an account that already follows it, or that is this person: nothing to write.
      if (followed || isSelf) return;
      // The runner drops an action whose run resolves, so a follow that didn't land has to throw.
      if (!(await observed('follow', () => follow([targetRef])))) {
        throw new Error('Your follow could not be saved yet.');
      }
    },
  });

  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: kind.component,
      target_type: kind.targetType,
      target_id: targetId,
      auth_control: 'follow',
      auth_intent: kind.follow,
      auth_continuation: 'queued',
    },
  });

  // Your own profile: there is nothing to follow.
  if (isSelf) return null;

  const saving = isPending(targetId);
  const shownFollowed = followed || queuedFollow.isQueued;
  const signedIn = Boolean(smartAccount);
  // Not yet known to be signed out: Privy still starting, or signed in with the account still
  // loading. A press then would open sign-in for someone already signed in, so it waits instead.
  const authResolving = !authReady || (authenticated && !signedIn);
  const noPersonalSpace =
    signedIn && !personalSpaceId && !isLoadingPersonalSpace && !isAccountSetupPending && !queuedFollow.isQueued;
  // Until the viewer's own space is known, a person button can't tell whether it is their own row.
  const ownSpaceUnknown = target.kind === 'person' && isLoadingPersonalSpace;
  const disabled =
    authResolving || ownSpaceUnknown || noPersonalSpace || (Boolean(personalSpaceId) && isLoadingFollows);

  const onPress = (event: React.MouseEvent) => {
    // Cards are links and side-panel triggers underneath; the press is the button's alone.
    event.preventDefault();
    event.stopPropagation();
    if (saving || disabled) return;

    if (followed) {
      void observed('unfollow', () => unfollow([targetId]));
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
      void observed('follow', () => follow([targetRef]));
      return;
    }
    // Signed in with the personal space still on its way: hold the press until it exists.
    queuedFollow.queue();
  };

  const styles = VARIANT_CLASS[variant];
  const name = target.name ?? kind.fallbackName;

  return (
    <button
      type="button"
      aria-pressed={shownFollowed}
      aria-label={shownFollowed ? `Unfollow ${name}` : `Follow ${name}`}
      title={noPersonalSpace ? (anyPersonalSpaceId ? UNREGISTERED_SPACE_HINT : NO_PERSONAL_SPACE_HINT) : undefined}
      disabled={disabled}
      aria-busy={saving || undefined}
      onClick={onPress}
      data-geo-analytics-label={shownFollowed ? kind.unfollow : kind.follow}
      className={cx(
        BASE_CLASS,
        styles.shape,
        shownFollowed ? styles.following : styles.idle,
        saving && (variant === 'compact' ? 'text-link' : 'opacity-60'),
        disabled && 'opacity-50',
        className
      )}
    >
      {shownFollowed ? (
        <>
          <span className={cx('inline-flex items-center', styles.innerGap, !saving && 'group-hover/follow:hidden')}>
            <svg width={styles.tick} height={styles.tick} viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M1.5 6L4.5 9L10.5 3" stroke="currentColor" strokeWidth={variant === 'overlay' ? 1.4 : 1} />
            </svg>
            Following
          </span>
          {!saving ? <span className="hidden group-hover/follow:inline">Unfollow</span> : null}
        </>
      ) : (
        <>
          <svg
            width={styles.plus}
            height={styles.plus}
            viewBox="0 0 13 13"
            fill="none"
            aria-hidden
            className={variant === 'compact' || variant === 'secondary' ? 'text-grey-04' : undefined}
          >
            <path d="M6.5 0V13" stroke="currentColor" strokeWidth={variant === 'overlay' ? 1.6 : 1.3} />
            <path d="M0 6.5L13 6.5" stroke="currentColor" strokeWidth={variant === 'overlay' ? 1.6 : 1.3} />
          </svg>
          Follow
        </>
      )}
      {saving ? <SavingDots /> : null}
    </button>
  );
}

/** A topic's Follow button; see `FollowButton`. */
export function FollowTopicButton({
  topic,
  ...props
}: { topic: { id: string; name?: string | null } } & Omit<React.ComponentProps<typeof FollowButton>, 'target'>) {
  return <FollowButton target={{ kind: 'topic', id: topic.id, name: topic.name }} {...props} />;
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
