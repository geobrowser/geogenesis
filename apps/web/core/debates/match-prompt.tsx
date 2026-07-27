'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { type Debate, type DebateMatch, type DebateMatchParticipant, getCurrentGeoChatUserId } from './api';
import { DebatePreScreen } from './debate-pre-join-screen';
import { DebateRequestDialog } from './debate-request-dialog';
import { type DebateFormatId, debateFormatById, defaultDebateFormatId } from './formats';
import { useAbortDebate, useAcceptDebateMatch, useDeclineDebateMatch, useMarkDebateReady } from './hooks';
import {
  DebateMediaSessionBoundary,
  debateMatchMediaSessionKey,
  debateMediaSessionKey,
  useDebateMediaSession,
} from './media-session';

type DebateMatchPromptProps = {
  spaceId: string;
  matches: DebateMatch[];
  debates?: Debate[];
};

export function DebateMatchPrompt({ spaceId, matches, debates = [] }: DebateMatchPromptProps) {
  return (
    <DebateMediaSessionBoundary>
      <DebateMatchPromptContent spaceId={spaceId} matches={matches} debates={debates} />
    </DebateMediaSessionBoundary>
  );
}

function DebateMatchPromptContent({ spaceId, matches, debates = [] }: DebateMatchPromptProps) {
  const router = useRouter();
  const debateFormatSelectorEnabled = useFeatureFlag('debateFormatSelector');
  const mediaSession = useDebateMediaSession();
  const { activeSessionKey, beginSession, promoteSession, releaseSession, ensurePreview } = mediaSession;
  const acceptMatch = useAcceptDebateMatch(spaceId);
  const declineMatch = useDeclineDebateMatch(spaceId);
  const currentUserId = getCurrentGeoChatUserId();
  const [selectedFormatIds, setSelectedFormatIds] = React.useState<Record<string, DebateFormatId>>({});
  const [acceptedMatchIds, setAcceptedMatchIds] = React.useState<string[]>([]);
  const [queuedReadyMatchIds, setQueuedReadyMatchIds] = React.useState<string[]>([]);
  const [readyError, setReadyError] = React.useState<string | null>(null);
  const [acceptingMatchId, setAcceptingMatchId] = React.useState<string | null>(null);
  const [waitingClaimIds, setWaitingClaimIds] = React.useState<string[]>([]);
  const [dismissedMatchIds, setDismissedMatchIds] = React.useState<string[]>([]);
  const [minimizedMatchIds, setMinimizedMatchIds] = React.useState<string[]>([]);
  const navigatedDebateIdRef = React.useRef<string | null>(null);
  const readyHandoffDebateIdRef = React.useRef<string | null>(null);
  const readyValidationDebateIdRef = React.useRef<string | null>(null);
  const localVideoRef = React.useRef<HTMLVideoElement>(null);

  const navigateToDebate = React.useCallback(
    (debateId: string, matchId: string) => {
      if (navigatedDebateIdRef.current === debateId) return;
      const matchSessionKey = debateMatchMediaSessionKey(matchId);
      const debateSessionKey = debateMediaSessionKey(debateId);
      if (activeSessionKey !== debateSessionKey) {
        if (activeSessionKey !== matchSessionKey) beginSession(matchSessionKey);
        promoteSession(matchSessionKey, debateSessionKey);
      }
      navigatedDebateIdRef.current = debateId;
      router.push(`/space/${spaceId}/debates/${debateId}`);
    },
    [activeSessionKey, beginSession, promoteSession, router, spaceId]
  );

  React.useEffect(() => {
    const activeIds = new Set(matches.map(match => match.id));
    setAcceptedMatchIds(current => current.filter(id => activeIds.has(id)));
    setQueuedReadyMatchIds(current => current.filter(id => activeIds.has(id)));
    setAcceptingMatchId(current => (current && activeIds.has(current) ? current : null));
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

    const matchWithDebate = matches.find(
      match => match.debate_id && participantForUser(match, currentUserId)?.accepted === true
    );
    if (matchWithDebate?.debate_id) {
      if (queuedReadyMatchIds.includes(matchWithDebate.id)) return;
      navigateToDebate(matchWithDebate.debate_id, matchWithDebate.id);
      return;
    }

    const waitingClaimIdSet = new Set([
      ...waitingClaimIds,
      ...matches
        .filter(match => participantForUser(match, currentUserId)?.accepted === true)
        .map(match => match.claim.id),
    ]);
    if (waitingClaimIdSet.size === 0) return;

    const debate = debates.find(
      debate =>
        waitingClaimIdSet.has(debate.claim.id) &&
        debate.participants.some(participant => participant.user_id === currentUserId) &&
        !['complete', 'cancelled'].includes(debate.status)
    );
    if (debate) {
      const matchId =
        matches.find(match => match.claim.id === debate.claim.id)?.id ?? acceptedMatchIds[0] ?? queuedReadyMatchIds[0];
      if (matchId && !queuedReadyMatchIds.includes(matchId)) navigateToDebate(debate.id, matchId);
    }
  }, [acceptedMatchIds, currentUserId, debates, matches, navigateToDebate, queuedReadyMatchIds, waitingClaimIds]);

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
  const activeMatchId = activeMatch?.id ?? null;
  const minimizedMatch = activeMatch && minimizedMatchIds.includes(activeMatch.id) ? activeMatch : null;
  const myParticipant = activeMatch && currentUserId ? participantForUser(activeMatch, currentUserId) : null;
  const waiting = Boolean(
    activeMatch &&
    (acceptedMatchIds.includes(activeMatch.id) ||
      waitingClaimIds.includes(activeMatch.claim.id) ||
      myParticipant?.accepted === true)
  );
  const matchedDebate = activeMatch
    ? (debates.find(
        debate =>
          debate.claim.id === activeMatch.claim.id &&
          Boolean(currentUserId && debate.participants.some(participant => participant.user_id === currentUserId)) &&
          !['complete', 'cancelled'].includes(debate.status)
      ) ?? null)
    : null;
  const debateLocalParticipant =
    matchedDebate?.participants.find(participant => participant.user_id === currentUserId) ?? null;
  const debateRemoteParticipant =
    matchedDebate?.participants.find(participant => participant.user_id !== currentUserId) ?? null;
  const markReady = useMarkDebateReady(matchedDebate?.id ?? '');
  const abortDebate = useAbortDebate(matchedDebate?.id ?? '');
  const submitReady = React.useCallback(
    (debate: Debate, matchId: string) => {
      if (readyHandoffDebateIdRef.current === debate.id) return;
      readyHandoffDebateIdRef.current = debate.id;
      markReady.mutate(undefined, {
        onSuccess: () => navigateToDebate(debate.id, matchId),
        onError: error => {
          readyHandoffDebateIdRef.current = null;
          setReadyError(error instanceof Error ? error.message : 'Could not mark you ready.');
        },
      });
    },
    [markReady, navigateToDebate]
  );

  React.useEffect(() => {
    if (!activeMatchId || !waiting || navigatedDebateIdRef.current) return;
    const sessionKey = debateMatchMediaSessionKey(activeMatchId);
    beginSession(sessionKey);
    void ensurePreview().catch(() => undefined);
    return () => releaseSession(sessionKey);
  }, [activeMatchId, beginSession, ensurePreview, releaseSession, waiting]);

  React.useEffect(
    () => () => {
      readyValidationDebateIdRef.current = null;
    },
    [activeMatchId]
  );

  React.useEffect(() => {
    if (!activeMatch || !matchedDebate || !queuedReadyMatchIds.includes(activeMatch.id) || readyError) return;
    if (debateLocalParticipant?.ready_at) {
      readyValidationDebateIdRef.current = null;
      navigateToDebate(matchedDebate.id, activeMatch.id);
      return;
    }
    if (readyHandoffDebateIdRef.current === matchedDebate.id) return;
    if (readyValidationDebateIdRef.current === matchedDebate.id) return;
    readyValidationDebateIdRef.current = matchedDebate.id;
    void ensurePreview()
      .then(tracks => {
        if (readyValidationDebateIdRef.current !== matchedDebate.id) return;
        const hasLiveTrack = (kind: 'audio' | 'video') =>
          tracks.some(track => track.mediaStreamTrack.kind === kind && track.mediaStreamTrack.readyState !== 'ended');
        if (!hasLiveTrack('audio') || !hasLiveTrack('video')) {
          throw new Error('Camera and microphone access is required before joining the debate.');
        }
        readyValidationDebateIdRef.current = null;
        submitReady(matchedDebate, activeMatch.id);
      })
      .catch(error => {
        if (readyValidationDebateIdRef.current !== matchedDebate.id) return;
        readyValidationDebateIdRef.current = null;
        setReadyError(error instanceof Error ? error.message : 'Could not verify your camera and microphone.');
      });
  }, [
    activeMatch,
    debateLocalParticipant?.ready_at,
    ensurePreview,
    matchedDebate,
    navigateToDebate,
    queuedReadyMatchIds,
    readyError,
    submitReady,
  ]);

  if (!activeMatch || !currentUserId) return null;

  const selectedFormatId = selectedFormatIds[activeMatch.id] ?? formatIdForMatch(activeMatch);
  const error =
    readyError ??
    (acceptMatch.error instanceof Error
      ? acceptMatch.error.message
      : declineMatch.error instanceof Error
        ? declineMatch.error.message
        : abortDebate.error instanceof Error
          ? abortDebate.error.message
          : null);
  const busy =
    acceptingMatchId === activeMatch.id ||
    acceptMatch.isPending ||
    declineMatch.isPending ||
    markReady.isPending ||
    abortDebate.isPending;

  const setSelectedFormatId = (formatId: DebateFormatId) => {
    setSelectedFormatIds(current => ({ ...current, [activeMatch.id]: formatId }));
  };

  const accept = () => {
    setReadyError(null);
    setAcceptingMatchId(activeMatch.id);
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
            navigateToDebate(debateId, activeMatch.id);
            return;
          }
          setAcceptingMatchId(null);
          setAcceptedMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
          setWaitingClaimIds(current => Array.from(new Set([...current, activeMatch.claim.id])));
        },
        onError: () => {
          setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
        },
      }
    );
  };

  const dismiss = () => {
    readyValidationDebateIdRef.current = null;
    setDismissedMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
    setAcceptedMatchIds(current => current.filter(id => id !== activeMatch.id));
    setQueuedReadyMatchIds(current => current.filter(id => id !== activeMatch.id));
    setWaitingClaimIds(current => current.filter(id => id !== activeMatch.claim.id));
    setMinimizedMatchIds(current => current.filter(id => id !== activeMatch.id));
    setReadyError(null);
  };

  const decline = () => {
    dismiss();
    declineMatch.mutate(activeMatch.id, {
      onError: () => {
        setDismissedMatchIds(current => current.filter(id => id !== activeMatch.id));
      },
    });
  };

  const ready = () => {
    setReadyError(null);
    setQueuedReadyMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
  };

  const leavePreScreen = () => {
    if (!matchedDebate) {
      decline();
      return;
    }
    abortDebate.mutate(undefined, {
      onSuccess: () => {
        dismiss();
        releaseSession(debateMatchMediaSessionKey(activeMatch.id));
      },
    });
  };

  if (waiting) {
    const preScreenParticipants = matchedDebate?.participants ?? activeMatch.participants;
    const localReady = Boolean(
      debateLocalParticipant?.ready_at || (queuedReadyMatchIds.includes(activeMatch.id) && !readyError)
    );

    return (
      <DebatePreScreen
        claim={activeMatch.claim.claim}
        participants={preScreenParticipants}
        currentUserId={currentUserId}
        localReady={localReady}
        remoteReady={Boolean(debateRemoteParticipant?.ready_at)}
        localVideoRef={localVideoRef}
        previewStream={mediaSession.previewStream}
        previewState={mediaSession.previewState}
        previewBusy={mediaSession.previewBusy}
        error={error ?? mediaSession.previewError}
        audioInputDevices={mediaSession.audioInputDevices}
        audioOutputDevices={mediaSession.audioOutputDevices}
        videoInputDevices={mediaSession.videoInputDevices}
        selectedAudioInputId={mediaSession.selectedAudioInputId}
        selectedAudioOutputId={mediaSession.selectedAudioOutputId}
        selectedVideoInputId={mediaSession.selectedVideoInputId}
        audioOutputSupported={mediaSession.audioOutputSupported}
        audioOutputError={mediaSession.audioOutputError}
        onAudioInputChange={mediaSession.changeAudioInput}
        onAudioOutputChange={mediaSession.changeAudioOutput}
        onVideoInputChange={mediaSession.changeVideoInput}
        onRetryMedia={() => void ensurePreview({ forceRestart: true }).catch(() => undefined)}
        readyBusy={markReady.isPending}
        onReady={ready}
        onLeave={leavePreScreen}
        leaveDisabled={busy}
      />
    );
  }

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
    <DebateRequestDialog
      claim={activeMatch.claim.claim}
      participants={activeMatch.participants}
      currentUserId={currentUserId}
      formatId={selectedFormatId}
      formatSelector={
        debateFormatSelectorEnabled && myParticipant?.participant_slot === 1
          ? {
              value: selectedFormatId,
              selectedFormatId: activeMatch.turn_format_id,
              name: `debate-match-format-${activeMatch.id}`,
              onChange: setSelectedFormatId,
            }
          : undefined
      }
      busy={busy}
      error={error}
      onAccept={accept}
      onReject={decline}
    />
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
    <aside className="max-sm:right-3 max-sm:bottom-3 max-sm:left-3 max-sm:w-auto fixed right-6 bottom-6 z-1100 grid w-[min(360px,calc(100vw-48px))] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 text-text shadow-card">
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

function speakerLabel(participant: { display_name: string | null; profile_space_id: string }) {
  return participant.display_name || participant.profile_space_id;
}

function formatIdForMatch(match: DebateMatch): DebateFormatId {
  return debateFormatById(match.turn_format_id)?.id ?? defaultDebateFormatId;
}
