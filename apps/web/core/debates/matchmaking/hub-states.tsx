'use client';

import * as React from 'react';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { GeoChatRequestError, isAccountWarmingUpQuery, isGeoChatRefusal } from '../api';
import type { DebateAnalyticsSurface } from './hub-analytics';
import { HubSwap } from './hub-motion';
import { HubPillButton } from './hub-pill-button';

/**
 * geo-chat ships the matchmaking endpoints separately from this UI, so a 404 is an expected
 * "not deployed yet" state rather than a failure worth surfacing as an error.
 */
export function isMatchmakingUnavailable(error: unknown) {
  return error instanceof GeoChatRequestError && error.status === 404;
}

/**
 * geo-chat refusing an anonymous read of a matchmaking list.
 *
 * The logged-out hub asks for Claims and People without a token. Whether geo-chat serves those
 * anonymously is its call, not ours, and it can change without this UI changing — so a refusal is
 * handled as a defined state rather than an error, the same way the 404 above is. If it serves
 * them, nobody sees this; if it doesn't, a signed-out viewer gets the sign-in prompt they would
 * have got anyway instead of "Something went wrong."
 */
export function isSignInRequired(error: unknown) {
  return isGeoChatRefusal(error);
}

/**
 * Horizontally neutral: every tab already insets its content by 16px, so self-padding here would
 * double it and make the empty state sit further in than the list it replaces.
 */
export function HubMessage({
  children,
  note,
  action,
}: {
  children: React.ReactNode;
  /**
   * A second sentence under the message, set closer to it than the action is.
   *
   * Rendered as given rather than wrapped in a `Text` of its own: a note that decides at runtime it
   * has nothing to say returns null, and a wrapper here would still leave an empty paragraph in the
   * markup and the a11y tree. Notes bring their own {@link HubMessageNote}.
   */
  note?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex flex-col gap-1">
        <Text as="p" variant="metadata" color="grey-04">
          {children}
        </Text>
        {note}
      </div>
      {action}
    </div>
  );
}

/** The type the message itself is set in, so a `note` sits with it rather than beside it. */
export function HubMessageNote({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" variant="metadata" color="grey-04">
      {children}
    </Text>
  );
}

type HubQueryStateProps = {
  analyticsSurface: DebateAnalyticsSurface;
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage: string;
  /**
   * A second line under `emptyMessage`. Where {@link DebateHoursNote} goes — which is why it is a
   * node rather than a string: it holds a timer of its own, so it has to mount and unmount with the
   * empty state rather than be computed by a tab that is rendering for other reasons.
   */
  emptyNote?: React.ReactNode;
  /** Offered alongside `emptyMessage` — an empty tab should say what to do next. */
  emptyAction?: { label: string; onClick: () => void };
  /** Enables a retry on the error state. */
  onRetry?: () => void;
  /** Offered when the list is only reachable signed in. See {@link isSignInRequired}. */
  signInAction?: { label: string; message: string; onClick: () => void };
  /**
   * The failure behind an attempt still in flight — react-query's `failureReason`.
   *
   * For the states worth naming *before* the retries are exhausted. A refusal aimed at an account
   * geo-chat has not registered is waited out over about a minute, and without this the viewer
   * watches a skeleton for all of it.
   */
  failureReason?: unknown;
  children: React.ReactNode;
};

/** Shared loading / unavailable / error / empty handling for every hub tab. */
export function HubQueryState({
  analyticsSurface,
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  emptyNote,
  emptyAction,
  onRetry,
  signInAction,
  failureReason,
  children,
}: HubQueryStateProps) {
  const needsSignIn = Boolean(signInAction) && isSignInRequired(error);
  /**
   * The same refusal, read for a caller that has already established the viewer is signed in — so
   * it is geo-chat not knowing them yet rather than them needing to sign in. See the predicate.
   *
   * `failureReason` as well as `error`, and it is the one that matters: these reads wait a
   * warming-up refusal out over about a minute, and until the last attempt fails react-query calls
   * that loading. So a viewer who had just signed up watched a skeleton for the whole minute, told
   * nothing, which reads worse than the error did — at least an error says something. The failure
   * in hand is what is happening *now*, so this says so on the first refusal and the retries carry
   * on underneath.
   */
  const warmingUp = !signInAction && isAccountWarmingUpQuery({ error, failureReason });
  // Settled, rather than still being waited out. `error` is only set once react-query has given up;
  // a refusal that is still being retried reaches us through `failureReason` alone.
  const retriesSpent = Boolean(error);
  const state = needsSignIn
    ? 'sign-in'
    : warmingUp
      ? 'warming-up'
      : error
        ? 'error'
        : isLoading
          ? 'loading'
          : isEmpty
            ? 'empty'
            : 'content';

  return (
    <HubSwap activeKey={state}>
      {state === 'sign-in' ? (
        <HubMessage
          action={
            <HubPillButton analyticsSurface={analyticsSurface} onClick={signInAction!.onClick}>
              {signInAction!.label}
            </HubPillButton>
          }
        >
          {signInAction!.message}
        </HubMessage>
      ) : state === 'warming-up' ? (
        // Deliberately not "Something went wrong", which is wrong about something going right, and
        // not the sign-in prompt, which is wrong at somebody who just did.
        //
        // The button appears only once the retries are spent. While they are still running,
        // `refetch()` joins the in-flight retry rather than starting a request, so the button would
        // have been a control that visibly does nothing — worse than no control, because a reader
        // who presses it and sees no change concludes the page is broken rather than busy. Until
        // then the message is the whole state, and the reads are getting on with it.
        <HubMessage
          action={
            retriesSpent && onRetry ? (
              <HubPillButton analyticsSurface={analyticsSurface} onClick={onRetry}>
                Try again
              </HubPillButton>
            ) : null
          }
        >
          Setting up your account. Check back in a minute.
        </HubMessage>
      ) : state === 'error' ? (
        <HubMessage
          action={
            // A "not deployed yet" 404 won't resolve by retrying, so only offer it for real errors.
            isMatchmakingUnavailable(error) || !onRetry ? null : (
              <HubPillButton analyticsSurface={analyticsSurface} onClick={onRetry}>
                Try again
              </HubPillButton>
            )
          }
        >
          {isMatchmakingUnavailable(error) ? "Matchmaking isn't available yet." : 'Something went wrong.'}
        </HubMessage>
      ) : state === 'loading' ? (
        <HubSkeleton />
      ) : state === 'empty' ? (
        <HubMessage
          note={emptyNote}
          action={
            emptyAction ? (
              <HubPillButton analyticsSurface={analyticsSurface} onClick={emptyAction.onClick}>
                {emptyAction.label}
              </HubPillButton>
            ) : null
          }
        >
          {emptyMessage}
        </HubMessage>
      ) : (
        children
      )}
    </HubSwap>
  );
}

export function HubSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
