'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { type Debate, type DebateMatch, type DebateMatchParticipant, getCurrentGeoChatUserId } from './api';
import { DebateFormatSelector } from './format-selector';
import { type DebateFormat, type DebateFormatId, debateFormatById, defaultDebateFormatId } from './formats';
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
  const [waitingClaimIds, setWaitingClaimIds] = React.useState<string[]>([]);
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

    const debateIdFromMatch = matches.find(match => match.debate_id && participantForUser(match, currentUserId))
      ?.debate_id;
    if (debateIdFromMatch) {
      navigateToDebate(debateIdFromMatch);
      return;
    }

    const waitingClaimIdSet = new Set(waitingClaimIds);
    if (waitingClaimIdSet.size === 0) return;

    const debate = debates.find(
      debate =>
        waitingClaimIdSet.has(debate.claim.id) &&
        debate.participants.some(participant => participant.user_id === currentUserId) &&
        !['complete', 'cancelled'].includes(debate.status)
    );
    if (debate) {
      navigateToDebate(debate.id);
    }
  }, [currentUserId, debates, matches, navigateToDebate, waitingClaimIds]);

  const waitingMatch =
    matches.find(match => {
      if (!currentUserId || dismissedMatchIds.includes(match.id)) return false;
      const participant = participantForUser(match, currentUserId);
      return (
        acceptedMatchIds.includes(match.id) ||
        waitingClaimIds.includes(match.claim.id) ||
        participant?.accepted === true
      );
    }) ?? null;
  const activeMatch =
    waitingMatch ??
    (waitingClaimIds.length === 0 ? (matches.find(match => !dismissedMatchIds.includes(match.id)) ?? null) : null);
  const minimizedMatch = activeMatch && minimizedMatchIds.includes(activeMatch.id) ? activeMatch : null;

  if (!activeMatch || !currentUserId) return null;

  const selectedFormatId = selectedFormatIds[activeMatch.id] ?? formatIdForMatch(activeMatch);
  const myParticipant = participantForUser(activeMatch, currentUserId);
  const waiting =
    acceptedMatchIds.includes(activeMatch.id) ||
    waitingClaimIds.includes(activeMatch.claim.id) ||
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
          setWaitingClaimIds(current => Array.from(new Set([...current, activeMatch.claim.id])));
        },
      }
    );
  };

  const decline = () => {
    setDismissedMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
    setAcceptedMatchIds(current => current.filter(id => id !== activeMatch.id));
    setWaitingClaimIds(current => current.filter(id => id !== activeMatch.claim.id));
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
  const participants = orderedParticipants(match);
  const firstParticipant = participants[0]!;
  const secondParticipant = participants[1] ?? firstParticipant;
  const selectedFormat = debateFormatById(selectedFormatId) ?? debateFormatById(defaultDebateFormatId)!;

  return (
    <div className="max-sm:items-end max-sm:p-0 fixed inset-0 z-[1200] flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-match-title"
        className="max-sm:max-h-[calc(100dvh-1rem)] max-sm:rounded-b-none max-sm:border-b-0 grid max-h-[calc(100dvh-2rem)] w-[min(668px,100%)] gap-7 overflow-hidden rounded-[1.25rem] bg-bg px-9 py-8 text-text shadow-card max-sm:px-5 max-sm:py-6"
      >
        <header className="min-w-0 text-center">
          <Text as="div" variant="body" color="grey-04">
            Debate request
          </Text>
          <h2 id="debate-match-title" className="mx-auto mt-3 max-w-[500px] text-[2rem] leading-[1.15] font-semibold">
            {waiting ? 'Waiting for the other person' : match.claim.claim}
          </h2>
        </header>

        <div className="min-h-0 overflow-y-auto">
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center rounded-xl border border-grey-02 bg-white px-7 py-5 shadow-inner shadow-grey-02 max-sm:px-4">
            {!waiting && (
              <button
                type="button"
                aria-label="Minimize"
                onClick={onMinimize}
                disabled={busy}
                className="absolute top-3 right-4 text-2xl leading-none text-grey-03 hover:text-text disabled:opacity-50"
              >
                ...
              </button>
            )}
            <ParticipantSummary participant={firstParticipant} currentUserId={currentUserId} />
            <div className="grid h-[132px] w-20 place-items-center border-x border-grey-02">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-grey-02 bg-white text-button text-text">
                VS
              </span>
            </div>
            <ParticipantSummary participant={secondParticipant} currentUserId={currentUserId} />
          </div>

          <section className="mt-7 rounded-xl border border-grey-02 bg-white p-7 max-sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Text as="h3" variant="body" color="grey-04">
                Debate format
              </Text>
              {!waiting && (
                <DebateFormatSelector
                  value={selectedFormatId}
                  selectedFormatId={match.turn_format_id}
                  canChoose={canChooseFormat}
                  disabled={busy}
                  onChange={onFormatChange}
                  name={`debate-match-format-${match.id}`}
                  className="w-[min(260px,100%)]"
                />
              )}
            </div>
            <div className="mt-6 grid gap-2">
              {selectedFormat.turnDurationsMs.map((durationMs, index) => {
                const participant = participants[index % participants.length] ?? firstParticipant;
                return (
                  <DebateFormatTurnRow
                    key={`${selectedFormat.id}-${index}`}
                    participant={participant}
                    currentUserId={currentUserId}
                    durationMs={durationMs}
                    turnIndex={index}
                    format={selectedFormat}
                  />
                );
              })}
            </div>
          </section>

          {myParticipant && (
            <Text as="p" variant="metadata" color="grey-04" className="mt-4 text-center">
              You chose {myParticipant.position_label}.
            </Text>
          )}

          {error && (
            <Text as="p" variant="body" color="red-01" className="mt-3">
              {error}
            </Text>
          )}
        </div>

        <footer className="grid gap-4">
          {waiting ? (
            <>
              <Text as="p" variant="body" color="grey-04" className="text-center">
                Waiting for the other person to say yes.
              </Text>
              <Button type="button" variant="secondary" onClick={onDecline} disabled={busy} className="w-full">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={onAccept} disabled={busy} className="w-full">
                Accept
              </Button>
              <button
                type="button"
                onClick={onDecline}
                disabled={busy}
                className="mx-auto min-h-10 px-4 text-button text-text hover:text-ctaPrimary disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function ParticipantSummary({
  participant,
  currentUserId,
}: {
  participant: DebateMatchParticipant;
  currentUserId: string;
}) {
  return (
    <div className="grid min-w-0 justify-items-center gap-3 text-center">
      <span className="h-9 w-9 overflow-hidden rounded-full">
        <Avatar
          avatarUrl={participant.avatar_cid}
          value={participant.profile_space_id}
          alt={speakerLabel(participant)}
          size={36}
        />
      </span>
      <Text as="div" variant="body" color="text" className="max-w-full truncate">
        {participant.user_id === currentUserId ? 'You' : speakerLabel(participant)}
      </Text>
      <span className="rounded-full bg-grey-02 px-3 py-1 text-metadataMedium text-text">
        {participant.position_label}
      </span>
    </div>
  );
}

function DebateFormatTurnRow({
  participant,
  currentUserId,
  durationMs,
  turnIndex,
  format,
}: {
  participant: DebateMatchParticipant;
  currentUserId: string;
  durationMs: number;
  turnIndex: number;
  format: DebateFormat;
}) {
  const alternate = turnIndex % 2 === 1;

  return (
    <div className={alternate ? 'rounded-lg bg-bg px-2 py-3' : 'px-2 py-3'}>
      <div className="grid grid-cols-[3.5rem_2rem_minmax(0,1fr)] items-center gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-text text-body text-text">
          {formatTurnDuration(durationMs)}
        </span>
        <span className="h-7 w-7 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={participant.avatar_cid}
            value={participant.profile_space_id}
            alt={speakerLabel(participant)}
            size={28}
          />
        </span>
        <Text as="div" variant="bodySemibold" color="text" className="min-w-0 truncate">
          {turnLabel(participant, currentUserId, turnIndex, format)}
        </Text>
      </div>
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
          {myParticipant ? `${myParticipant.position_label} · ` : ''}
          {match.claim.claim}
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

function turnLabel(
  participant: DebateMatchParticipant,
  currentUserId: string,
  turnIndex: number,
  format: DebateFormat
) {
  const name = participant.user_id === currentUserId ? 'You' : speakerLabel(participant);
  const roundIndex = Math.floor(turnIndex / 2);
  if (roundIndex === 0) {
    return `${name} ${name === 'You' ? 'make' : 'makes'} an argument`;
  }
  if (roundIndex === Math.floor((format.turnDurationsMs.length - 1) / 2)) {
    return `${name} ${name === 'You' ? 'rebut' : 'rebuts'}`;
  }
  return `${name} ${name === 'You' ? 'respond' : 'responds'}`;
}

function formatTurnDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  if (seconds > 0 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function formatIdForMatch(match: DebateMatch): DebateFormatId {
  return debateFormatById(match.turn_format_id)?.id ?? defaultDebateFormatId;
}
