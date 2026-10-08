'use client';

import { usePrivy } from '@geogenesis/auth';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ActionContextProvider } from '~/core/action-context-provider';
import { useEntityResponse } from '~/core/hooks/use-entity-vote';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSetToast } from '~/core/hooks/use-toast';
import { readViewerResponseForReplay } from '~/core/responses/replay-viewer-response';
import { captureLocalVoteDropped } from '~/core/save-votes-analytics';
import {
  type LocalVote,
  clearLocalVotes,
  confirmSaveRequest,
  isSaveRequestLive,
  removeLocalVote,
  resetSaveRequest,
  useLocalVotes,
} from '~/core/state/local-votes';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';

export function savingVotesCopy(count: number) {
  return count === 1 ? 'Saving your vote…' : `Saving ${count} votes…`;
}

export function savedVotesCopy(count: number) {
  return count === 1 ? 'Vote saved' : `${count} votes saved`;
}

/**
 * Publishes the votes a visitor cast on this device once a save prompt has signed them in
 * (GEO-3214).
 *
 * Its own runner rather than `PendingActionsRunner`: a queued claim vote replays through the card
 * for that claim on screen, or the closure of the card that was pressed, and a vote cast on an
 * earlier visit has neither. Each vote is written through `useEntityResponse` in a headless writer,
 * so there is still one write path — the same optimistic state, analytics and space join — and a card
 * that is on screen sees the write as its own, because the progress is cached under the same key.
 *
 * One vote at a time. Smart-account sends are serialised anyway, but a send waiting behind fifty
 * others would trip the queue's two-minute wait.
 *
 * A sign-in no save prompt started clears the votes instead: on a shared browser, they may be
 * somebody else's.
 */
export function LocalVotesSaver() {
  const { ready, authenticated } = usePrivy();
  const state = useLocalVotes();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const setToast = useSetToast();
  const reportError = useReportError();
  const [failed, setFailed] = React.useState(false);
  /** How many votes this save started with, for the toasts. 0 while no save is under way. */
  const totalRef = React.useRef(0);

  const voteCount = state.votes.length;
  const confirmed = state.save?.confirmed ?? false;

  // Signed in: a save if a save prompt started it, otherwise somebody else's votes.
  React.useEffect(() => {
    if (!ready || !authenticated || voteCount === 0 || confirmed) return;
    if (isSaveRequestLive(state)) {
      confirmSaveRequest();
      return;
    }
    state.votes.forEach(vote => captureLocalVoteDropped('other_sign_in', vote, voteCount));
    clearLocalVotes();
  }, [authenticated, confirmed, ready, state, voteCount]);

  // Signed out mid-save: what is left was confirmed for that account, not for the next one here.
  const wasAuthenticated = React.useRef(false);
  React.useEffect(() => {
    if (!ready) return;
    if (wasAuthenticated.current && !authenticated) {
      resetSaveRequest();
      totalRef.current = 0;
    }
    wasAuthenticated.current = authenticated;
  }, [authenticated, ready]);

  const hasPersonalSpace = Boolean(smartAccount && isRegistered && personalSpaceId);
  const saving = authenticated && confirmed && hasPersonalSpace && voteCount > 0 && !failed;

  React.useEffect(() => {
    if (!saving || totalRef.current > 0) return;
    totalRef.current = voteCount;
    setToast(<span>{savingVotesCopy(voteCount)}</span>, { persistent: true });
  }, [saving, setToast, voteCount]);

  // Every vote written: say so, and forget the save, so the next signed-out session starts clean.
  React.useEffect(() => {
    if (!confirmed || voteCount > 0) return;
    if (totalRef.current > 0) setToast(<span>{savedVotesCopy(totalRef.current)}</span>);
    totalRef.current = 0;
    clearLocalVotes();
  }, [confirmed, setToast, voteCount]);

  const next = saving ? state.votes[0] : null;

  const onSaved = React.useCallback((vote: LocalVote, outcome: 'saved' | 'already_held', remaining: number) => {
    if (outcome === 'already_held') captureLocalVoteDropped('already_held', vote, remaining);
    removeLocalVote(vote);
  }, []);

  const onFailed = React.useCallback(
    (error: unknown) => {
      setFailed(true);
      // The persistent "Saving…" toast would otherwise sit over the error indefinitely.
      setToast(null);
      totalRef.current = 0;
      reportError(`Couldn't save your votes: ${describeError(error)}`, () => setFailed(false));
    },
    [reportError, setToast]
  );

  if (!next) return null;
  return (
    // Saved votes are told apart from votes cast signed in by this list id on `action_completed`.
    <ActionContextProvider value={{ list_id: 'local_votes' }}>
      <LocalVoteWriter
        key={`${next.entityId}:${next.spaceId}:${next.responseKind}:${next.direction}`}
        vote={next}
        onSaved={outcome => onSaved(next, outcome, voteCount)}
        onFailed={onFailed}
      />
    </ActionContextProvider>
  );
}

/**
 * Writes one local vote through the same hook the pills use. Publishes the side unless the account
 * already holds it; an account that holds the other side switches, since the newer vote wins.
 */
function LocalVoteWriter({
  vote,
  onSaved,
  onFailed,
}: {
  vote: LocalVote;
  onSaved: (outcome: 'saved' | 'already_held') => void;
  onFailed: (error: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const { submitResponseAsync } = useEntityResponse({
    entityId: vote.entityId,
    entityName: vote.title || null,
    spaceId: vote.spaceId,
    responseKind: vote.responseKind,
  });
  const latest = React.useRef({ submitResponseAsync, onSaved, onFailed });
  latest.current = { submitResponseAsync, onSaved, onFailed };

  // Once per mount, which is once per vote: the saver keys this by the vote.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const held = await readViewerResponseForReplay(queryClient, {
          entityId: vote.entityId,
          spaceId: vote.spaceId,
          responseKind: vote.responseKind,
          // Votes on the entity itself, never on a relation.
          objectType: 0,
        });
        if (held === vote.direction) {
          latest.current.onSaved('already_held');
          return;
        }
        await latest.current.submitResponseAsync(vote.direction);
        latest.current.onSaved('saved');
      } catch (error) {
        latest.current.onFailed(error);
      }
    })();
  }, [queryClient, vote]);

  return null;
}
