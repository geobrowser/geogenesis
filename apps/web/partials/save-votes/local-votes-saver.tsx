'use client';

import { usePrivy } from '@geogenesis/auth';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ActionContextProvider } from '~/core/action-context-provider';
import { currentAuthAttempt } from '~/core/auth-attempt';
import { useEntityResponse } from '~/core/hooks/use-entity-vote';
import { useOnSignOut } from '~/core/hooks/use-on-sign-out';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSetToast } from '~/core/hooks/use-toast';
import { readViewerResponseForReplay } from '~/core/responses/replay-viewer-response';
import { captureLocalVoteDropped, isSaveVotesSignIn } from '~/core/save-votes-analytics';
import { savedVotesCopy, savingVotesCopy } from '~/core/save-votes-copy';
import {
  type LocalVote,
  bindSaveToAccount,
  clearLocalVotes,
  isLocalVoteCurrent,
  removeLocalVote,
  resetSaveRequest,
  useLocalVotes,
} from '~/core/state/local-votes';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';

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
 * somebody else's. A save is bound to the account its sign-in completed for, so a different account
 * signing in later — after a session expired, say — clears what is left rather than inheriting it.
 */
export function LocalVotesSaver() {
  const { ready, authenticated, user } = usePrivy();
  const accountId = authenticated ? (user?.id ?? null) : null;
  const state = useLocalVotes();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const setToast = useSetToast();
  const reportError = useReportError();
  const [failed, setFailed] = React.useState(false);
  /** How many votes this save started with, for the toasts. 0 while no save is under way. */
  const totalRef = React.useRef(0);

  const voteCount = state.votes.length;
  const boundTo = state.save?.accountId ?? null;
  const bound = accountId !== null && boundTo === accountId;

  // Signed in: a save if the sign-in that just completed was a save prompt's, otherwise somebody
  // else's votes — including a save bound to another account.
  React.useEffect(() => {
    if (!ready || accountId === null || voteCount === 0 || bound) return;
    if (boundTo === null && isSaveVotesSignIn(currentAuthAttempt())) {
      bindSaveToAccount(accountId);
      return;
    }
    state.votes.forEach(vote => captureLocalVoteDropped('other_sign_in', vote, voteCount));
    clearLocalVotes();
  }, [accountId, bound, boundTo, ready, state, voteCount]);

  // Signed out mid-save: what is left was bound to that account, not to the next one here.
  useOnSignOut(() => {
    resetSaveRequest();
    totalRef.current = 0;
  });

  const hasPersonalSpace = Boolean(smartAccount && isRegistered && personalSpaceId);
  const saving = bound && hasPersonalSpace && voteCount > 0 && !failed;

  React.useEffect(() => {
    if (!saving || totalRef.current > 0) return;
    totalRef.current = voteCount;
    setToast(<span>{savingVotesCopy(voteCount)}</span>, { persistent: true });
  }, [saving, setToast, voteCount]);

  // Every vote written: say so, and forget the save, so the next signed-out session starts clean.
  React.useEffect(() => {
    if (!bound || voteCount > 0) return;
    if (totalRef.current > 0) setToast(<span>{savedVotesCopy(totalRef.current)}</span>);
    totalRef.current = 0;
    clearLocalVotes();
  }, [bound, setToast, voteCount]);

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
        // Replaced while the read was out — a signed-in press on this claim removes its device vote
        // and publishes its own side. Publishing this one now would overwrite the newer press.
        if (!isLocalVoteCurrent(vote)) return;
        await latest.current.submitResponseAsync(vote.direction);
        latest.current.onSaved('saved');
      } catch (error) {
        latest.current.onFailed(error);
      }
    })();
  }, [queryClient, vote]);

  return null;
}
