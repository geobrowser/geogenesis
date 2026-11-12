'use client';

import * as React from 'react';

import { BEST_DEBATES_RANKING_LIVE } from '~/core/blocks/ranking/best-debates';
import { PUSH_DOWN_LIVE_NOTE, PUSH_DOWN_VOTE_FAILED_COPY, type PushDownState } from '~/core/blocks/ranking/push-down';
import type { PushedDownDebate } from '~/core/blocks/ranking/use-my-pushed-down-debates';
import { usePushDown } from '~/core/blocks/ranking/use-push-down';

import { SmallButton } from '~/design-system/button';

import { RankingEntryRow } from './ranking-entry-row';

type Props = {
  blockId: string;
  debates: readonly PushedDownDebate[];
  isError: boolean;
  onRetryLoad: () => void;
};

/**
 * "You pushed down" under My ranking on the Best debates ranking screen (GEO-3679): the member's
 * downvoted debates, each with Undo. Renders nothing until there is something to show.
 */
export function RankingComposePushedDown({ blockId, debates, isError, onRetryLoad }: Props) {
  if (debates.length === 0 && !isError) return null;

  return (
    <section aria-label="Debates you pushed down" className="mt-4 flex flex-col">
      {/* The red rule the mockups draw between your ranking and what you pushed down. */}
      <div className="flex items-center gap-3 pb-1 text-footnoteMedium text-red-01">
        <span className="h-px flex-1 bg-red-01/50" aria-hidden />
        <span>You pushed down · {debates.length}</span>
        <span className="h-px flex-1 bg-red-01/50" aria-hidden />
      </div>
      {BEST_DEBATES_RANKING_LIVE ? <p className="mt-2 text-metadata text-grey-04">{PUSH_DOWN_LIVE_NOTE}</p> : null}
      {isError ? (
        <p className="mt-2 text-metadata text-grey-04">
          Couldn’t load the debates you pushed down.{' '}
          <button type="button" className="underline" onClick={onRetryLoad}>
            Try again
          </button>
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col p-0">
        {debates.map(debate => (
          <PushedDownRow key={debate.entityId} blockId={blockId} debate={debate} />
        ))}
      </ul>
    </section>
  );
}

function PushedDownRow({ blockId, debate }: { blockId: string; debate: PushedDownDebate }) {
  // Every row is a downvote gaia counts, so every row renders: the header's count is the rows.
  // An Undo that lands drops the debate from the list itself.
  const { state, isInBallot, undo, retry } = usePushDown(debate.entityId, {
    blockId,
    debateSpaceId: debate.debateSpaceId,
  });

  const isWorking = state.status === 'working';
  const failure = state.status === 'failed' ? state : null;

  return (
    <li className="w-full py-3" data-testid={`pushed-down-${debate.entityId}`}>
      <RankingEntryRow
        entry={debate}
        spaceId={debate.debateSpaceId ?? debate.downvotedSpaceIds[0] ?? ''}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {failure ? (
              <SmallButton onClick={() => void retry()} disabled={isWorking}>
                Retry
              </SmallButton>
            ) : null}
            <SmallButton onClick={() => void undo()} disabled={isWorking} aria-label={`Undo push down: ${debate.name}`}>
              {isWorking ? 'Working…' : 'Undo'}
            </SmallButton>
            <RowStatus state={state} isInBallot={isInBallot} />
          </div>
        }
      />
    </li>
  );
}

function RowStatus({ state, isInBallot }: { state: PushDownState; isInBallot: boolean }) {
  if (state.status === 'failed') {
    return (
      <span role="alert" className="text-metadata text-red-01">
        {state.message || PUSH_DOWN_VOTE_FAILED_COPY}
      </span>
    );
  }
  // Pushed down and still on the ballot: the second step hasn't happened yet.
  if (isInBallot && state.status !== 'working') {
    return <span className="text-metadata text-grey-04">Still in your ranking</span>;
  }
  return null;
}
