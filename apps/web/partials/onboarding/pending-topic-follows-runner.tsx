'use client';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useAtomValue } from 'jotai';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { useFollowTopics } from '~/core/topics/use-follow-topics';
import { useFollowedTopics } from '~/core/topics/use-followed-topics';
import { devLog } from '~/core/utils/dev-log';

import {
  NO_HELD_FEED_TOPICS,
  feedTopicsAtom,
  heldTopicsFor,
  readStoredFeedTopics,
} from '~/atoms/onboarding-feed-topics';

const INDEX_POLL_MS = 3_000;
const INDEX_POLL_MAX_MS = 30_000;
const PUBLISH_RETRY_MS = 30_000;
const LOCK_RETRY_MS = 5_000;
const LOCK_NAME = 'geo:onboarding-topic-follows';
// Each failed publish shows the user an error, so stop after a few until the next page load.
const MAX_PUBLISH_FAILURES = 3;

type Outcome = 'done' | 'unindexed' | 'failed';

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
  // An unowned value (the earlier plain-array shape) counts as another account's.
  const holdsAny = Array.isArray(held) ? held.length > 0 : (held?.topics?.length ?? 0) > 0;
  const heldForAnotherAccount = !!address && holdsAny && picks.length === 0;
  const pending = useAtomValue(pendingPersonalSpaceAtom);
  const { personalSpaceId } = usePersonalSpaceId();
  const { isLoading: isLoadingFollowed } = useFollowedTopics();
  const { follow } = useFollowTopics();

  const [retryTick, setRetryTick] = React.useState(0);
  const runningRef = React.useRef(false);
  const indexPollsRef = React.useRef(0);
  const publishFailuresRef = React.useRef(0);

  // Same rule as PendingPersonalSpaceRunner's pending record: another account's picks are dropped.
  React.useEffect(() => {
    if (heldForAnotherAccount) setHeld(NO_HELD_FEED_TOPICS);
  }, [heldForAnotherAccount, setHeld]);

  React.useEffect(() => {
    if (!address || !personalSpaceId || pending || isLoadingFollowed || picks.length === 0) return;
    if (publishFailuresRef.current >= MAX_PUBLISH_FAILURES) return;
    if (runningRef.current) return;
    runningRef.current = true;

    const spaceId = personalSpaceId;
    const owner = address;

    void (async () => {
      let delay: number | null = null;
      try {
        const outcome = await withCrossTabLock(async () => {
          // Read under the lock: a tab that waited finds the picks another tab already followed gone.
          const sent = heldTopicsFor(readStoredFeedTopics(), owner);
          if (sent.length === 0) return 'done';

          const space = await Effect.runPromise(getSpace(spaceId)).catch(() => null);
          if (!space) return 'unindexed';

          devLog('[onboarding] following %d onboarding topics in %s', sent.length, spaceId);
          if (!(await follow(sent))) return 'failed';

          // Written to storage before the lock is released.
          const done = new Set(sent.map(topic => topic.id));
          const left = heldTopicsFor(readStoredFeedTopics(), owner).filter(topic => !done.has(topic.id));
          setHeld(left.length > 0 ? { address: owner, topics: left } : NO_HELD_FEED_TOPICS);
          return 'done';
        });

        if (outcome === null) {
          delay = LOCK_RETRY_MS;
        } else if (outcome === 'unindexed') {
          indexPollsRef.current += 1;
          delay = Math.min(INDEX_POLL_MS * indexPollsRef.current, INDEX_POLL_MAX_MS);
        } else if (outcome === 'failed') {
          publishFailuresRef.current += 1;
          delay = PUBLISH_RETRY_MS;
        }
      } finally {
        runningRef.current = false;
        if (delay !== null) setTimeout(() => setRetryTick(n => n + 1), delay);
      }
    })();
  }, [address, personalSpaceId, pending, isLoadingFollowed, picks.length, follow, setHeld, retryTick]);

  return null;
}
