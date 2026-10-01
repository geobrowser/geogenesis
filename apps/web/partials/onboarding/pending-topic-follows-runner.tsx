'use client';

import * as React from 'react';

import { Effect } from 'effect';
import { useAtom, useAtomValue } from 'jotai';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getSpace } from '~/core/io/queries';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { useFollowTopics } from '~/core/topics/use-follow-topics';
import { useFollowedTopics } from '~/core/topics/use-followed-topics';
import { devLog } from '~/core/utils/dev-log';

import { feedTopicsAtom, readStoredFeedTopics } from '~/atoms/onboarding-feed-topics';

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
  const [picks, setPicks] = useAtom(feedTopicsAtom);
  const pending = useAtomValue(pendingPersonalSpaceAtom);
  const { personalSpaceId } = usePersonalSpaceId();
  const { isLoading: isLoadingFollowed } = useFollowedTopics();
  const { follow } = useFollowTopics();

  const [retryTick, setRetryTick] = React.useState(0);
  const runningRef = React.useRef(false);
  const indexPollsRef = React.useRef(0);
  const publishFailuresRef = React.useRef(0);

  React.useEffect(() => {
    if (!personalSpaceId || pending || isLoadingFollowed || picks.length === 0) return;
    if (publishFailuresRef.current >= MAX_PUBLISH_FAILURES) return;
    if (runningRef.current) return;
    runningRef.current = true;

    const spaceId = personalSpaceId;

    void (async () => {
      let delay: number | null = null;
      try {
        const outcome = await withCrossTabLock(async () => {
          // Read under the lock: a tab that waited finds the picks another tab already followed gone.
          const sent = readStoredFeedTopics();
          if (sent.length === 0) return 'done';

          const space = await Effect.runPromise(getSpace(spaceId)).catch(() => null);
          if (!space) return 'unindexed';

          devLog('[onboarding] following %d onboarding topics in %s', sent.length, spaceId);
          if (!(await follow(sent))) return 'failed';

          // Written to storage before the lock is released.
          const done = new Set(sent.map(topic => topic.id));
          setPicks(readStoredFeedTopics().filter(topic => !done.has(topic.id)));
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
  }, [personalSpaceId, pending, isLoadingFollowed, picks, follow, setPicks, retryTick]);

  return null;
}
