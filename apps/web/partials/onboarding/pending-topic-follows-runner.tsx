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

import { feedTopicsAtom } from '~/atoms/onboarding-feed-topics';

const INDEX_POLL_MS = 3_000;
const INDEX_POLL_MAX_MS = 30_000;
const PUBLISH_RETRY_MS = 30_000;
// Each failed publish shows the user an error, so stop after a few until the next page load.
const MAX_PUBLISH_FAILURES = 3;

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

    const sent = picks;
    const spaceId = personalSpaceId;

    void (async () => {
      let delay: number | null = null;
      try {
        const space = await Effect.runPromise(getSpace(spaceId)).catch(() => null);
        if (!space) {
          indexPollsRef.current += 1;
          delay = Math.min(INDEX_POLL_MS * indexPollsRef.current, INDEX_POLL_MAX_MS);
          return;
        }

        devLog('[onboarding] following %d onboarding topics in %s', sent.length, spaceId);
        if (await follow(sent)) {
          const done = new Set(sent.map(topic => topic.id));
          setPicks(prev => prev.filter(topic => !done.has(topic.id)));
          return;
        }

        publishFailuresRef.current += 1;
        delay = PUBLISH_RETRY_MS;
      } finally {
        runningRef.current = false;
        if (delay !== null) setTimeout(() => setRetryTick(n => n + 1), delay);
      }
    })();
  }, [personalSpaceId, pending, isLoadingFollowed, picks, follow, setPicks, retryTick]);

  return null;
}
