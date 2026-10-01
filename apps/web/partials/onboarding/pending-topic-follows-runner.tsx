'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useAtomValue } from 'jotai';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { useFollowTopics } from '~/core/topics/use-follow-topics';
import { followedTopicsQueryOptions, useFollowedTopics } from '~/core/topics/use-followed-topics';
import { devLog } from '~/core/utils/dev-log';
import { normId } from '~/core/utils/norm-id';

import {
  NO_HELD_FEED_TOPICS,
  feedTopicsAtom,
  heldRecordFor,
  heldTopicsFor,
  readStoredFeedTopics,
} from '~/atoms/onboarding-feed-topics';

const INDEX_POLL_MS = 3_000;
const INDEX_POLL_MAX_MS = 30_000;
const PUBLISH_RETRY_MS = 30_000;
const LOCK_RETRY_MS = 5_000;
const LOCK_NAME = 'geo:onboarding-topic-follows';
// A submitted follow can land minutes after it was reported failed (receipt waits run ~90s per try)
// or after a reload. Until this passes, wait for its follows to be indexed rather than publish again.
const SUBMITTED_GRACE_MS = 10 * 60_000;
const SUBMITTED_POLL_MS = 10_000;
// Each failed publish shows the user an error, so stop after a few until the next page load.
const MAX_PUBLISH_FAILURES = 3;

type Outcome = 'done' | 'unindexed' | 'submitted' | 'failed' | 'capped';

// Picks sync across tabs through localStorage, but follow's dedupe is per tab, so only one tab may
// publish them. Resolves null when another tab holds the lock.
function withCrossTabLock(run: () => Promise<Outcome>): Promise<Outcome | null> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return run();
  return locks.request(LOCK_NAME, { ifAvailable: true }, lock => (lock ? run() : null));
}

/**
 * Follows onboarding topic picks once the personal space is rendered and indexed; publishing to an
 * unindexed space shows a status-bar error. Picks persist until a follow succeeds, so reloads resume.
 */
export function PendingTopicFollowsRunner() {
  const [held, setHeld] = useAtom(feedTopicsAtom);
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const picks = heldTopicsFor(held, address);
  // Re-runs when the set of topics changes, not only its size.
  const picksKey = picks
    .map(topic => normId(topic.id))
    .sort()
    .join(',');
  // An unowned value (the earlier plain-array shape) counts as another account's.
  const holdsAny = Array.isArray(held) ? held.length > 0 : (held?.topics?.length ?? 0) > 0;
  const heldForAnotherAccount = !!address && holdsAny && picks.length === 0;
  const pending = useAtomValue(pendingPersonalSpaceAtom);
  const { personalSpaceId } = usePersonalSpaceId();
  const { isLoading: isLoadingFollowed } = useFollowedTopics();
  const { follow } = useFollowTopics();
  const queryClient = useQueryClient();

  const [retryTick, setRetryTick] = React.useState(0);
  const runningRef = React.useRef(false);
  const indexPollsRef = React.useRef(0);
  const publishFailuresRef = React.useRef(0);
  const ownerRef = React.useRef(address);
  const addressRef = React.useRef(address);
  addressRef.current = address;

  // Writes only over this owner's stored record: the wallet can switch mid-publish, and a newer
  // account's picks must survive the old account's run.
  const clearFollowed = React.useCallback(
    (owner: string, followed: readonly { id: string }[]) => {
      const current = heldRecordFor(readStoredFeedTopics(), owner);
      if (!current) return;
      const done = new Set(followed.map(topic => normId(topic.id)));
      const left = current.topics.filter(topic => !done.has(normId(topic.id)));
      setHeld(left.length > 0 ? { address: owner, topics: left } : NO_HELD_FEED_TOPICS);
    },
    [setHeld]
  );

  // Same rule as PendingPersonalSpaceRunner's pending record: another account's picks are dropped.
  React.useEffect(() => {
    if (heldForAnotherAccount) setHeld(NO_HELD_FEED_TOPICS);
  }, [heldForAnotherAccount, setHeld]);

  React.useEffect(() => {
    if (!address || !personalSpaceId || pending || isLoadingFollowed || !picksKey) return;
    // Retry budgets belong to one account.
    if (ownerRef.current !== address) {
      ownerRef.current = address;
      indexPollsRef.current = 0;
      publishFailuresRef.current = 0;
    }
    if (runningRef.current) return;
    runningRef.current = true;

    const spaceId = personalSpaceId;
    const owner = address;
    // Past the cap this run only checks whether an earlier publish landed.
    const mayPublish = publishFailuresRef.current < MAX_PUBLISH_FAILURES;

    void (async () => {
      let delay: number | null = null;
      let outcome: Outcome | null | undefined;
      try {
        outcome = await withCrossTabLock(async () => {
          // Read under the lock: a tab that waited finds the picks another tab already followed gone.
          if (heldTopicsFor(readStoredFeedTopics(), owner).length === 0) return 'done';

          const space = await Effect.runPromise(getSpace(spaceId)).catch(() => null);
          if (!space) return 'unindexed';

          // Fresh, so neither this check nor follow's dedupe trusts a list cached before indexing.
          const rows = await queryClient
            .fetchQuery({ ...followedTopicsQueryOptions(spaceId), staleTime: 0 })
            .catch(() => null);
          if (!rows) return 'unindexed';
          const followed = new Set(rows.map(row => normId(row.toEntityId)));

          // Re-read after the awaits, like every write here: see clearFollowed.
          const latest = heldRecordFor(readStoredFeedTopics(), owner);
          if (!latest || latest.topics.length === 0) return 'done';
          const missing = latest.topics.filter(topic => !followed.has(normId(topic.id)));
          if (missing.length === 0) {
            clearFollowed(owner, latest.topics);
            return 'done';
          }
          if (latest.submittedAt && Date.now() - latest.submittedAt < SUBMITTED_GRACE_MS) return 'submitted';
          if (!mayPublish) return 'capped';

          setHeld({ address: owner, topics: latest.topics, submittedAt: Date.now() });
          devLog('[onboarding] following %d onboarding topics in %s', missing.length, spaceId);
          // On failure the marker stays: a timed-out publish may still land.
          if (!(await follow(missing))) return 'failed';

          // Written to storage before the lock is released.
          clearFollowed(owner, latest.topics);
          return 'done';
        });

        // Retry state belongs to the signed-in account; another account's outcome is ignored.
        if (addressRef.current !== owner) {
          delay = 0;
        } else if (outcome === null) {
          delay = LOCK_RETRY_MS;
        } else if (outcome === 'unindexed') {
          indexPollsRef.current += 1;
          delay = Math.min(INDEX_POLL_MS * indexPollsRef.current, INDEX_POLL_MAX_MS);
        } else if (outcome === 'submitted') {
          delay = SUBMITTED_POLL_MS;
        } else if (outcome === 'failed') {
          publishFailuresRef.current += 1;
          delay = PUBLISH_RETRY_MS;
        }
      } finally {
        runningRef.current = false;
        // A newer account, or picks changed mid-run, were turned away by runningRef.
        if (delay === null && addressRef.current !== owner) delay = 0;
        if (outcome === 'done' && heldTopicsFor(readStoredFeedTopics(), owner).length > 0) delay = 0;
        if (delay !== null) setTimeout(() => setRetryTick(n => n + 1), delay);
      }
    })();
  }, [
    address,
    personalSpaceId,
    pending,
    isLoadingFollowed,
    picksKey,
    follow,
    queryClient,
    clearFollowed,
    setHeld,
    retryTick,
  ]);

  return null;
}
