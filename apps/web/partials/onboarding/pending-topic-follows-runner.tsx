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
import type { TopicOption } from '~/core/topics/use-topic-suggestions';
import { devLog } from '~/core/utils/dev-log';
import { normId } from '~/core/utils/norm-id';

import {
  type HeldFeedTopics,
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
// Past the publish cap, keep checking (read-only) for a late landing: held picks feed For you.
const CAPPED_POLL_MS = 60_000;
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

type Attempt = {
  owner: string;
  spaceId: string;
  mayPublish: boolean;
  fetchFollowedIds: (spaceId: string) => Promise<Set<string> | null>;
  follow: (topics: TopicOption[]) => Promise<boolean>;
  write: (record: HeldFeedTopics) => void;
};

// Writes only over the owner's stored record: the wallet can switch mid-publish, and a newer
// account's picks must survive the old account's run.
function clearFollowed(owner: string, followed: readonly TopicOption[], write: Attempt['write']) {
  const current = heldRecordFor(readStoredFeedTopics(), owner);
  if (!current) return;
  const done = new Set(followed.map(topic => normId(topic.id)));
  const left = current.topics.filter(topic => !done.has(normId(topic.id)));
  write(left.length > 0 ? { address: owner, topics: left } : NO_HELD_FEED_TOPICS);
}

/** One pass over the owner's held picks. Storage is re-read after every await. */
async function attemptHeldFollows({ owner, spaceId, mayPublish, fetchFollowedIds, follow, write }: Attempt) {
  // A tab that waited for the lock finds the picks another tab already followed gone.
  if (heldTopicsFor(readStoredFeedTopics(), owner).length === 0) return 'done';

  const space = await Effect.runPromise(getSpace(spaceId)).catch(() => null);
  if (!space) return 'unindexed';

  const followed = await fetchFollowedIds(spaceId);
  if (!followed) return 'unindexed';

  const latest = heldRecordFor(readStoredFeedTopics(), owner);
  if (!latest || latest.topics.length === 0) return 'done';
  const missing = latest.topics.filter(topic => !followed.has(normId(topic.id)));
  if (missing.length === 0) {
    clearFollowed(owner, latest.topics, write);
    return 'done';
  }
  if (latest.submittedAt && Date.now() - latest.submittedAt < SUBMITTED_GRACE_MS) return 'submitted';
  if (!mayPublish) return 'capped';

  write({ address: owner, topics: latest.topics, submittedAt: Date.now() });
  devLog('[onboarding] following %d onboarding topics in %s', missing.length, spaceId);
  // On failure the marker stays: a timed-out publish may still land.
  if (!(await follow(missing))) return 'failed';

  // Written to storage before the lock is released.
  clearFollowed(owner, latest.topics, write);
  return 'done';
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
  // Anything held that isn't this account's (another owner, or no owner) is dropped.
  const holdsAny = Array.isArray(held) ? held.length > 0 : (held?.topics?.length ?? 0) > 0;
  const heldForAnotherAccount = !!address && holdsAny && picks.length === 0;
  const pending = useAtomValue(pendingPersonalSpaceAtom);
  const { personalSpaceId } = usePersonalSpaceId();
  const { isLoading: isLoadingFollowed } = useFollowedTopics();
  const { follow } = useFollowTopics();
  const queryClient = useQueryClient();

  const [retryTick, setRetryTick] = React.useState(0);
  const runningRef = React.useRef(false);
  // Retry state for one account at a time.
  const budgetRef = React.useRef({ owner: address, indexPolls: 0, publishFailures: 0 });
  const addressRef = React.useRef(address);
  addressRef.current = address;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  // Same rule as PendingPersonalSpaceRunner's pending record: another account's picks are dropped.
  React.useEffect(() => {
    if (heldForAnotherAccount) setHeld(NO_HELD_FEED_TOPICS);
  }, [heldForAnotherAccount, setHeld]);

  React.useEffect(() => {
    if (!address || !personalSpaceId || pending || isLoadingFollowed || !picksKey) return;
    if (budgetRef.current.owner !== address) budgetRef.current = { owner: address, indexPolls: 0, publishFailures: 0 };
    if (runningRef.current) return;
    runningRef.current = true;

    const owner = address;
    const budget = budgetRef.current;

    void (async () => {
      let outcome: Outcome | null | undefined;
      try {
        outcome = await withCrossTabLock(() =>
          attemptHeldFollows({
            owner,
            spaceId: personalSpaceId,
            // Past the cap a pass only checks whether an earlier publish landed.
            mayPublish: budget.publishFailures < MAX_PUBLISH_FAILURES,
            // Fresh, so neither the check nor follow's dedupe trusts a list cached before indexing.
            fetchFollowedIds: spaceId =>
              queryClient
                .fetchQuery({ ...followedTopicsQueryOptions(spaceId), staleTime: 0 })
                .then(rows => new Set(rows.map(row => normId(row.toEntityId))))
                .catch(() => null),
            follow,
            write: setHeld,
          })
        );
      } finally {
        runningRef.current = false;
        const delay = nextDelay(outcome, budget, addressRef.current !== owner, owner);
        if (delay !== null) timerRef.current = setTimeout(() => setRetryTick(n => n + 1), delay);
      }
    })();
  }, [address, personalSpaceId, pending, isLoadingFollowed, picksKey, follow, queryClient, setHeld, retryTick]);

  return null;
}

/** When to run again after a pass, or null to wait for a state change. Updates `budget`. */
function nextDelay(
  outcome: Outcome | null | undefined,
  budget: { indexPolls: number; publishFailures: number },
  ownerChanged: boolean,
  owner: string
): number | null {
  // Retry state belongs to the signed-in account; another account's outcome is ignored, and the
  // account that was turned away by the busy pass runs now.
  if (ownerChanged) return 0;
  switch (outcome) {
    case null:
      return LOCK_RETRY_MS;
    case 'unindexed':
      budget.indexPolls += 1;
      return Math.min(INDEX_POLL_MS * budget.indexPolls, INDEX_POLL_MAX_MS);
    case 'submitted':
      return SUBMITTED_POLL_MS;
    case 'capped':
      return CAPPED_POLL_MS;
    case 'failed':
      budget.publishFailures += 1;
      return PUBLISH_RETRY_MS;
    case 'done':
      // Picks that changed mid-pass were turned away by the busy pass.
      return heldTopicsFor(readStoredFeedTopics(), owner).length > 0 ? 0 : null;
    default:
      return null;
  }
}
