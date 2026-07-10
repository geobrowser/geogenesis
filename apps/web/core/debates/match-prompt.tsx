'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { type Debate, type DebateMatch, type DebateMatchParticipant, getCurrentGeoChatUserId } from './api';
import { DebateFormatSelector } from './format-selector';
import { type DebateFormatId, debateFormatById, defaultDebateFormatId } from './formats';
import { useAcceptDebateMatch, useDeclineDebateMatch } from './hooks';

type DebateMatchPromptProps = {
  spaceId: string;
  matches: DebateMatch[];
  debates?: Debate[];
};

export function DebateMatchPrompt({ spaceId, matches, debates = [] }: DebateMatchPromptProps) {
  const router = useRouter();
  const acceptMatch = useAcceptDebateMatch(spaceId);
  const declineMatch = useDeclineDebateMatch(spaceId);
  const currentUserId = getCurrentGeoChatUserId();
  const [selectedFormatIds, setSelectedFormatIds] = React.useState<Record<string, DebateFormatId>>({});
  const [acceptedMatchIds, setAcceptedMatchIds] = React.useState<string[]>([]);
  const [waitingQuestionIds, setWaitingQuestionIds] = React.useState<string[]>([]);
  const [dismissedMatchIds, setDismissedMatchIds] = React.useState<string[]>([]);
  const [minimizedMatchIds, setMinimizedMatchIds] = React.useState<string[]>([]);
  const navigatedDebateIdRef = React.useRef<string | null>(null);

  const navigateToDebate = React.useCallback(
    (debateId: string) => {
      if (navigatedDebateIdRef.current === debateId) return;
      navigatedDebateIdRef.current = debateId;
      router.push(`/space/${spaceId}/debates/${debateId}`);
    },
    [router, spaceId]
  );

  React.useEffect(() => {
    const activeIds = new Set(matches.map(match => match.id));
    setAcceptedMatchIds(current => current.filter(id => activeIds.has(id)));
    setDismissedMatchIds(current => current.filter(id => activeIds.has(id)));
    setMinimizedMatchIds(current => current.filter(id => activeIds.has(id)));
    setSelectedFormatIds(
      current =>
        Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id))) as Record<
          string,
          DebateFormatId
        >
    );
  }, [matches]);

  React.useEffect(() => {
    if (!currentUserId) return;

    const debateIdFromMatch = matches.find(
      match => match.debate_id && participantForUser(match, currentUserId)
    )?.debate_id;
    if (debateIdFromMatch) {
      navigateToDebate(debateIdFromMatch);
      return;
    }

    const waitingQuestionIdSet = new Set(waitingQuestionIds);
    if (waitingQuestionIdSet.size === 0) return;

    const debate = debates.find(
      debate =>
        waitingQuestionIdSet.has(debate.question.id) &&
        debate.participants.some(participant => participant.user_id === currentUserId) &&
        !['complete', 'cancelled'].includes(debate.status)
    );
    if (debate) {
      navigateToDebate(debate.id);
    }
  }, [currentUserId, debates, matches, navigateToDebate, waitingQuestionIds]);

  const waitingMatch =
    matches.find(match => {
      if (!currentUserId || dismissedMatchIds.includes(match.id)) return false;
      const participant = participantForUser(match, currentUserId);
      return (
        acceptedMatchIds.includes(match.id) ||
        waitingQuestionIds.includes(match.question.id) ||
        participant?.accepted === true
      );
    }) ?? null;
  const activeMatch =
    waitingMatch ??
    (waitingQuestionIds.length === 0 ? (matches.find(match => !dismissedMatchIds.includes(match.id)) ?? null) : null);
  const minimizedMatch = activeMatch && minimizedMatchIds.includes(activeMatch.id) ? activeMatch : null;

  if (!activeMatch || !currentUserId) return null;

  const selectedFormatId = selectedFormatIds[activeMatch.id] ?? formatIdForMatch(activeMatch);
  const myParticipant = participantForUser(activeMatch, currentUserId);
  const waiting =
    acceptedMatchIds.includes(activeMatch.id) ||
    waitingQuestionIds.includes(activeMatch.question.id) ||
    myParticipant?.accepted === true;
  const error =
    acceptMatch.error instanceof Error
      ? acceptMatch.error.message
      : declineMatch.error instanceof Error
        ? declineMatch.error.message
        : null;
  const busy = acceptMatch.isPending || declineMatch.isPending;

  const setSelectedFormatId = (formatId: DebateFormatId) => {
    setSelectedFormatIds(current => ({ ...current, [activeMatch.id]: formatId }));
  };

  const accept = () => {
    acceptMatch.mutate(
      {
        matchId: activeMatch.id,
        formatId: myParticipant?.participant_slot === 1 ? selectedFormatId : undefined,
      },
      {
        onSuccess: result => {
          setMinimizedMatchIds(current => current.filter(id => id !== activeMatch.id));
          const debateId = result.debate?.id ?? result.match.debate_id;
          if (debateId) {
            navigateToDebate(debateId);
            return;
          }
          setAcceptedMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
          setWaitingQuestionIds(current => Array.from(new Set([...current, activeMatch.question.id])));
        },
      }
    );
  };

  const decline = () => {
    setDismissedMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
    setAcceptedMatchIds(current => current.filter(id => id !== activeMatch.id));
    setWaitingQuestionIds(current => current.filter(id => id !== activeMatch.question.id));
    setMinimizedMatchIds(current => current.filter(id => id !== activeMatch.id));
    declineMatch.mutate(activeMatch.id, {
      onError: () => {
        setDismissedMatchIds(current => current.filter(id => id !== activeMatch.id));
      },
    });
  };

  if (minimizedMatch) {
    return (
      <MinimizedMatchPrompt
        match={minimizedMatch}
        currentUserId={currentUserId}
        waiting={waiting}
        onOpen={() => setMinimizedMatchIds(current => current.filter(id => id !== minimizedMatch.id))}
      />
    );
  }

  return (
    <MatchDialog
      match={activeMatch}
      currentUserId={currentUserId}
      selectedFormatId={selectedFormatId}
      waiting={waiting}
      busy={busy}
      error={error}
      onAccept={accept}
      onDecline={decline}
      onFormatChange={setSelectedFormatId}
      onMinimize={() => setMinimizedMatchIds(current => Array.from(new Set([...current, activeMatch.id])))}
    />
  );
}

function MatchDialog({
  match,
  currentUserId,
  selectedFormatId,
  waiting,
  busy,
  error,
  onAccept,
  onDecline,
  onFormatChange,
  onMinimize,
}: {
  match: DebateMatch;
  currentUserId: string;
  selectedFormatId: DebateFormatId;
  waiting: boolean;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onFormatChange: (formatId: DebateFormatId) => void;
  onMinimize: () => void;
}) {
  const myParticipant = participantForUser(match, currentUserId);
  const canChooseFormat = myParticipant?.participant_slot === 1 && !waiting;
  const other = otherParticipant(match, currentUserId);

  return (
    <div className="max-sm:items-end max-sm:p-0 fixed inset-0 z-[1200] flex items-center justify-center bg-text/20 p-5 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-match-title"
        className="max-sm:max-h-[calc(100dvh-1rem)] max-sm:rounded-b-none max-sm:border-b-0 grid max-h-[calc(100dvh-2rem)] w-[min(540px,100%)] gap-4 overflow-hidden rounded-lg border border-grey-02 bg-white p-5 text-text shadow-card"
      >
        <header className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <Text as="div" variant="metadataMedium" color="grey-04" className="uppercase">
              Match found
            </Text>
            <h2 id="debate-match-title" className="mt-1 block text-smallTitle text-text">
              {waiting ? 'Waiting for the other person' : `${speakerLabel(other)} wants to debate`}
            </h2>
          </div>
          {!waiting && (
            <Button type="button" variant="secondary" small onClick={onMinimize} disabled={busy}>
              Minimize
            </Button>
          )}
        </header>

        <div className="min-h-0 overflow-y-auto pr-1">
          <Text as="p" variant="body" color="grey-04" className="mb-4">
            {match.question.question}
          </Text>

          <div className="grid grid-cols-2 gap-2">
            {orderedParticipants(match).map(participant => {
              return (
                <div key={participant.user_id} className="min-w-0 rounded-lg border border-grey-02 bg-bg p-3">
                  <Text as="div" variant="metadataMedium" color="ctaPrimary" className="truncate">
                    {participant.answer.label}
                  </Text>
                  <Text as="div" variant="bodySemibold" color="text" className="mt-1 truncate">
                    {speakerLabel(participant)}
                    {participant.user_id === currentUserId ? ' (You)' : ''}
                  </Text>
                </div>
              );
            })}
          </div>

          {!waiting && (
            <DebateFormatSelector
              value={selectedFormatId}
              selectedFormatId={match.turn_format_id}
              canChoose={canChooseFormat}
              disabled={busy}
              onChange={onFormatChange}
              name={`debate-match-format-${match.id}`}
              className="mt-4"
            />
          )}

          {myParticipant && (
            <Text as="p" variant="metadata" color="grey-04" className="mt-3">
              You chose {myParticipant.answer.label}.
            </Text>
          )}

          {error && (
            <Text as="p" variant="body" color="red-01" className="mt-3">
              {error}
            </Text>
          )}
        </div>

        <footer className="max-sm:grid max-sm:grid-cols-1 flex flex-wrap justify-end gap-2 border-t border-grey-02 pt-4">
          {waiting ? (
            <>
              <Text as="p" variant="body" color="grey-04" className="min-w-0 flex-1 self-center">
                Waiting for the other person to say yes.
              </Text>
              <Button type="button" variant="secondary" onClick={onDecline} disabled={busy}>
                Cancel and skip
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onDecline} disabled={busy}>
                Skip this person for 10 min
              </Button>
              <Button type="button" onClick={onAccept} disabled={busy}>
                Yes
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function MinimizedMatchPrompt({
  match,
  currentUserId,
  waiting,
  onOpen,
}: {
  match: DebateMatch;
  currentUserId: string;
  waiting: boolean;
  onOpen: () => void;
}) {
  const other = otherParticipant(match, currentUserId);
  const myParticipant = participantForUser(match, currentUserId);

  return (
    <aside className="max-sm:right-3 max-sm:bottom-3 max-sm:left-3 max-sm:w-auto fixed right-6 bottom-6 z-[1100] grid w-[min(360px,calc(100vw-48px))] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 text-text shadow-card">
      <span className="grid min-w-0 gap-0.5">
        <Text as="span" variant="bodySemibold" color="text" className="truncate">
          {waiting ? `${speakerLabel(other)} is waiting` : `Match found: ${speakerLabel(other)}`}
        </Text>
        <Text as="span" variant="metadata" color="grey-04" className="truncate">
          {myParticipant ? `${myParticipant.answer.label} · ` : ''}
          {match.question.question}
        </Text>
      </span>
      <Button type="button" small onClick={onOpen}>
        Open
      </Button>
    </aside>
  );
}

function participantForUser(match: DebateMatch, userId: string): DebateMatchParticipant | null {
  return match.participants.find(participant => participant.user_id === userId) ?? null;
}

function otherParticipant(match: DebateMatch, userId: string): DebateMatchParticipant {
  return match.participants.find(participant => participant.user_id !== userId) ?? match.participants[0]!;
}

function orderedParticipants(match: DebateMatch) {
  return [...match.participants].sort((a, b) => a.participant_slot - b.participant_slot);
}

function speakerLabel(participant: { display_name: string | null; profile_space_id: string }) {
  return participant.display_name || participant.profile_space_id;
}

function formatIdForMatch(match: DebateMatch): DebateFormatId {
  return debateFormatById(match.turn_format_id)?.id ?? defaultDebateFormatId;
}
