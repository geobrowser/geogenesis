'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import {
  type Debate,
  type DebateActivity,
  type DebateMatch,
  type DebateMatchParticipant,
  getCurrentGeoChatUserId,
} from './api';
import {
  type DebateMatchTabOwnershipCoordinator,
  createDebateMatchTabOwnershipCoordinator,
  debateMatchOwnershipMatchesDebate,
  readDebateMatchTabOwnership,
} from './debate-match-tab-ownership';
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
  reconcileActivity?: () => Promise<DebateActivity | null>;
};

export function DebateMatchPrompt({ spaceId, matches, debates = [], reconcileActivity }: DebateMatchPromptProps) {
  const currentUserId = getCurrentGeoChatUserId();
  const ownershipScopeKey = `${currentUserId ?? 'anonymous'}:${matches[0]?.id ?? 'none'}`;

  return (
    <DebateMediaSessionBoundary>
      <DebateMatchPromptContent
        key={ownershipScopeKey}
        spaceId={spaceId}
        matches={matches}
        debates={debates}
        reconcileActivity={reconcileActivity}
        currentUserId={currentUserId}
      />
    </DebateMediaSessionBoundary>
  );
}

type DebateMatchPromptContentProps = DebateMatchPromptProps & {
  currentUserId: string | null;
};

type OwnershipState = 'checking' | 'none' | 'pending' | 'confirmed' | 'other-tab';

const acceptanceReconciliationTimeoutMs = 10_000;
const acceptanceReconciliationTimedOut = Symbol('acceptance-reconciliation-timed-out');

function DebateMatchPromptContent({
  spaceId,
  matches,
  debates = [],
  reconcileActivity,
  currentUserId,
}: DebateMatchPromptContentProps) {
  const router = useRouter();
  const debateFormatSelectorEnabled = useFeatureFlag('debateFormatSelector');
  const mediaSession = useDebateMediaSession();
  const { activeSessionKey, beginSession, promoteSession, releaseSession, ensurePreview } = mediaSession;
  const acceptMatch = useAcceptDebateMatch(spaceId);
  const declineMatch = useDeclineDebateMatch(spaceId);
  const ownershipMatch = matches[0] ?? null;
  const [ownershipState, setOwnershipState] = React.useState<OwnershipState>(() =>
    initialOwnershipState(ownershipMatch, currentUserId)
  );
  const [selectedFormatIds, setSelectedFormatIds] = React.useState<Record<string, DebateFormatId>>({});
  const [queuedReadyMatchIds, setQueuedReadyMatchIds] = React.useState<string[]>([]);
  const [readyError, setReadyError] = React.useState<string | null>(null);
  const [acceptingMatchId, setAcceptingMatchId] = React.useState<string | null>(null);
  const [dismissedMatchIds, setDismissedMatchIds] = React.useState<string[]>([]);
  const [minimizedMatchIds, setMinimizedMatchIds] = React.useState<string[]>([]);
  /** Matches already offered to the viewer, so re-opening one doesn't re-minimize it. */
  const surfacedMatchIdsRef = React.useRef<Set<string>>(new Set());
  const navigatedDebateIdRef = React.useRef<string | null>(null);
  const readyHandoffDebateIdRef = React.useRef<string | null>(null);
  const readyValidationDebateIdRef = React.useRef<string | null>(null);
  const matchActionInFlightRef = React.useRef(false);
  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const handleAcceptedElsewhere = React.useCallback(() => setOwnershipState('other-tab'), []);
  const ownershipCoordinator = useMatchTabOwnershipCoordinator(ownershipMatch, currentUserId, handleAcceptedElsewhere);
  const ownershipDebate =
    ownershipMatch && currentUserId
      ? (debates.find(debate => debateMatchesMatch(debate, ownershipMatch, currentUserId)) ?? null)
      : null;

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
    // A match is never something the viewer asked for at this instant — it arrives because the
    // server paired them or because someone accepted their request. So it announces itself in the
    // corner and waits to be opened, rather than taking over whatever they were doing.
    const unseen = [...activeIds].filter(id => !surfacedMatchIdsRef.current.has(id));
    surfacedMatchIdsRef.current = activeIds;

    setQueuedReadyMatchIds(current => current.filter(id => activeIds.has(id)));
    setAcceptingMatchId(current => (current && activeIds.has(current) ? current : null));
    setDismissedMatchIds(current => current.filter(id => activeIds.has(id)));
    setMinimizedMatchIds(current => {
      const retained = current.filter(id => activeIds.has(id));
      if (unseen.length === 0) return retained.length === current.length ? current : retained;
      return [...retained, ...unseen];
    });
    setSelectedFormatIds(
      current =>
        Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id))) as Record<
          string,
          DebateFormatId
        >
    );
  }, [matches]);

  React.useEffect(() => {
    if (!ownershipMatch || !currentUserId) {
      setOwnershipState('none');
      return;
    }
    if (!ownershipCoordinator) return;

    let active = true;
    const record = readDebateMatchTabOwnership(currentUserId);
    const participantAccepted = participantForUser(ownershipMatch, currentUserId)?.accepted === true;
    if (
      !record ||
      record.matchId !== ownershipMatch.id ||
      record.claimId !== ownershipMatch.claim.id ||
      record.spaceId !== ownershipMatch.claim.space_id
    ) {
      // A match born from an accepted debate request arrives with both sides already accepted and
      // no ownership record anywhere — neither participant went through the accept dialog here. The
      // first tab to take the lock runs the ready room; the rest fall back to the other-tab notice.
      if (participantAccepted && isFullyAcceptedMatch(ownershipMatch)) {
        setOwnershipState('checking');
        void ownershipCoordinator.acquire().then(acquired => {
          if (!active) return;
          if (!acquired) {
            setOwnershipState('other-tab');
            return;
          }
          ownershipCoordinator.beginAcceptance();
          setOwnershipState(ownershipCoordinator.confirmAcceptance() ? 'confirmed' : 'other-tab');
        });
      } else {
        setOwnershipState(participantAccepted ? 'other-tab' : 'none');
      }
    } else {
      setOwnershipState('checking');
      void ownershipCoordinator.recover().then(recovered => {
        if (!active) return;
        setOwnershipState(recovered ? record.state : participantAccepted ? 'other-tab' : 'none');
      });
    }
    return () => {
      active = false;
    };
  }, [
    currentUserId,
    ownershipCoordinator,
    ownershipMatch?.claim.id,
    ownershipMatch?.claim.space_id,
    ownershipMatch?.id,
  ]);

  React.useEffect(() => {
    if (!ownershipCoordinator || !ownershipMatch || !currentUserId) return;
    if (participantForUser(ownershipMatch, currentUserId)?.accepted !== true && !ownershipDebate) return;
    if (ownershipState === 'pending') {
      ownershipCoordinator.confirmAcceptance();
      setOwnershipState('confirmed');
    } else if (ownershipState === 'none') {
      setOwnershipState('other-tab');
    }
  }, [currentUserId, ownershipCoordinator, ownershipDebate, ownershipMatch, ownershipState]);

  React.useEffect(() => {
    const otherTabMatchId = ownershipState === 'other-tab' ? ownershipMatch?.id : null;
    if (!otherTabMatchId) return;
    setQueuedReadyMatchIds(current => current.filter(id => id !== otherTabMatchId));
    setMinimizedMatchIds(current => current.filter(id => id !== otherTabMatchId));
    releaseSession(debateMatchMediaSessionKey(otherTabMatchId));

    const frame = window.requestAnimationFrame(() => restorePageFocus(returnFocusRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [ownershipMatch?.id, ownershipState, releaseSession]);

  React.useEffect(() => {
    if (!currentUserId || ownershipState !== 'confirmed' || !ownershipMatch) return;

    const matchWithDebate = matches.find(match => match.id === ownershipMatch.id && match.debate_id);
    if (matchWithDebate?.debate_id) {
      if (queuedReadyMatchIds.includes(matchWithDebate.id)) return;
      navigateToDebate(matchWithDebate.debate_id, matchWithDebate.id);
      return;
    }

    const debate = debates.find(
      debate =>
        debate.claim.id === ownershipMatch.claim.id &&
        debate.participants.some(participant => participant.user_id === currentUserId) &&
        !['complete', 'cancelled'].includes(debate.status)
    );
    if (debate) {
      const matchId = matches.find(match => match.claim.id === debate.claim.id)?.id ?? ownershipMatch.id;
      if (matchId && !queuedReadyMatchIds.includes(matchId)) navigateToDebate(debate.id, matchId);
    }
  }, [currentUserId, debates, matches, navigateToDebate, ownershipMatch, ownershipState, queuedReadyMatchIds]);

  const waitingMatch =
    matches.find(match => {
      if (!currentUserId || dismissedMatchIds.includes(match.id)) return false;
      return ownershipState === 'confirmed' && match.id === ownershipMatch?.id;
    }) ?? null;
  const activeMatch =
    waitingMatch ??
    (ownershipState === 'none' || ownershipState === 'pending'
      ? (matches.find(match => !dismissedMatchIds.includes(match.id)) ?? null)
      : null);
  const activeMatchId = activeMatch?.id ?? null;
  const minimizedMatch = activeMatch && minimizedMatchIds.includes(activeMatch.id) ? activeMatch : null;
  const myParticipant = activeMatch && currentUserId ? participantForUser(activeMatch, currentUserId) : null;
  const waiting = Boolean(activeMatch && ownershipState === 'confirmed');
  const matchedDebate = activeMatch
    ? (debates.find(debate => Boolean(currentUserId && debateMatchesMatch(debate, activeMatch, currentUserId))) ?? null)
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

  if (!activeMatch || !currentUserId) {
    return ownershipState === 'other-tab' ? (
      <p role="status" aria-live="polite" className="sr-only">
        Debate accepted in another tab.
      </p>
    ) : null;
  }

  const selectedFormatId = selectedFormatIds[activeMatch.id] ?? formatIdForMatch(activeMatch);
  const error =
    readyError ??
    (ownershipState !== 'confirmed' && acceptMatch.error instanceof Error
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

  const accept = async () => {
    if (!ownershipCoordinator || matchActionInFlightRef.current) return;
    matchActionInFlightRef.current = true;
    setReadyError(null);
    setAcceptingMatchId(activeMatch.id);
    if (!(await ownershipCoordinator.acquire())) {
      matchActionInFlightRef.current = false;
      setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
      return;
    }
    ownershipCoordinator.beginAcceptance();
    setOwnershipState('pending');
    acceptMatch.mutate(
      {
        matchId: activeMatch.id,
        formatId: myParticipant?.participant_slot === 1 ? selectedFormatId : undefined,
      },
      {
        onSuccess: result => {
          matchActionInFlightRef.current = false;
          setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
          if (!ownershipCoordinator.confirmAcceptance()) return;
          setOwnershipState('confirmed');
          setMinimizedMatchIds(current => current.filter(id => id !== activeMatch.id));
          const debateId = result.debate?.id ?? result.match.debate_id;
          if (debateId) {
            navigateToDebate(debateId, activeMatch.id);
            return;
          }
        },
        onError: () => {
          void reconcileFailedAcceptance(activeMatch, currentUserId, ownershipCoordinator, reconcileActivity)
            .then(result => {
              if (result.status === 'confirmed') {
                setOwnershipState('confirmed');
                if (result.debate) navigateToDebate(result.debate.id, activeMatch.id);
              } else if (result.status === 'rejected') {
                setOwnershipState('none');
              }
            })
            .finally(() => {
              matchActionInFlightRef.current = false;
              setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
            });
        },
      }
    );
  };

  const dismiss = () => {
    readyValidationDebateIdRef.current = null;
    setDismissedMatchIds(current => Array.from(new Set([...current, activeMatch.id])));
    setQueuedReadyMatchIds(current => current.filter(id => id !== activeMatch.id));
    setMinimizedMatchIds(current => current.filter(id => id !== activeMatch.id));
    setReadyError(null);
  };

  const decline = async () => {
    if (!ownershipCoordinator || matchActionInFlightRef.current) return;
    matchActionInFlightRef.current = true;
    setAcceptingMatchId(activeMatch.id);
    if (!(await ownershipCoordinator.acquire())) {
      matchActionInFlightRef.current = false;
      setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
      return;
    }
    dismiss();
    declineMatch.mutate(activeMatch.id, {
      onSuccess: () => {
        matchActionInFlightRef.current = false;
        setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
        setOwnershipState('none');
        void ownershipCoordinator.release({ clearRecord: true });
      },
      onError: () => {
        matchActionInFlightRef.current = false;
        setAcceptingMatchId(current => (current === activeMatch.id ? null : current));
        setDismissedMatchIds(current => current.filter(id => id !== activeMatch.id));
        void ownershipCoordinator.release({ clearRecord: ownershipState !== 'confirmed' });
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
        setOwnershipState('none');
        void ownershipCoordinator?.release({ clearRecord: true });
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

function initialOwnershipState(match: DebateMatch | null, currentUserId: string | null): OwnershipState {
  if (!match || !currentUserId) return 'none';
  const record = readDebateMatchTabOwnership(currentUserId);
  if (record?.matchId === match.id && record.claimId === match.claim.id && record.spaceId === match.claim.space_id) {
    return 'checking';
  }
  if (participantForUser(match, currentUserId)?.accepted !== true) return 'none';
  // The ownership effect resolves this by racing for the lock. See the comment there.
  return isFullyAcceptedMatch(match) ? 'checking' : 'other-tab';
}

/**
 * Both sides accepted without either passing through this prompt — i.e. the match came from an
 * accepted debate request (GEO-2514) rather than the legacy queue pairing.
 */
function isFullyAcceptedMatch(match: DebateMatch) {
  return match.participants.length > 1 && match.participants.every(participant => participant.accepted);
}

type AcceptanceReconciliation =
  { status: 'confirmed'; debate: Debate | null } | { status: 'rejected' } | { status: 'inconclusive' };

async function reconcileFailedAcceptance(
  match: DebateMatch,
  currentUserId: string,
  ownershipCoordinator: DebateMatchTabOwnershipCoordinator,
  reconcileActivity?: () => Promise<DebateActivity | null>
): Promise<AcceptanceReconciliation> {
  if (!reconcileActivity) {
    await ownershipCoordinator.release({ clearRecord: true });
    return { status: 'rejected' };
  }

  let activity: DebateActivity | null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      reconcileActivity(),
      new Promise<typeof acceptanceReconciliationTimedOut>(resolve => {
        timeout = setTimeout(() => resolve(acceptanceReconciliationTimedOut), acceptanceReconciliationTimeoutMs);
      }),
    ]);
    if (result === acceptanceReconciliationTimedOut) return { status: 'inconclusive' };
    activity = result;
  } catch {
    return { status: 'inconclusive' };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!activity) return { status: 'inconclusive' };

  const activityMatch = activity.match?.id === match.id ? activity.match : null;
  const accepted = activityMatch && participantForUser(activityMatch, currentUserId)?.accepted === true;
  const debate =
    activity.debate &&
    debateMatchOwnershipMatchesDebate(
      {
        userId: currentUserId,
        claimId: match.claim.id,
        spaceId: match.claim.space_id,
      },
      activity.debate,
      currentUserId
    )
      ? activity.debate
      : null;

  if (debate && ['complete', 'cancelled'].includes(debate.status)) {
    await ownershipCoordinator.release({ clearRecord: true });
    return { status: 'rejected' };
  }

  if (accepted || debate) {
    return ownershipCoordinator.confirmAcceptance() ? { status: 'confirmed', debate } : { status: 'inconclusive' };
  }

  if (activityMatch || (!activity.match && !activity.debate)) {
    await ownershipCoordinator.release({ clearRecord: true });
    return { status: 'rejected' };
  }
  return { status: 'inconclusive' };
}

function useMatchTabOwnershipCoordinator(
  match: DebateMatch | null,
  currentUserId: string | null,
  onAcceptedElsewhere: () => void
) {
  const [state, setState] = React.useState<{
    matchId: string;
    userId: string;
    coordinator: DebateMatchTabOwnershipCoordinator;
  } | null>(null);

  React.useEffect(() => {
    if (!match || !currentUserId) return;
    const coordinator = createDebateMatchTabOwnershipCoordinator({
      matchId: match.id,
      claimId: match.claim.id,
      spaceId: match.claim.space_id,
      userId: currentUserId,
      onAcceptedElsewhere,
    });
    setState({ matchId: match.id, userId: currentUserId, coordinator });
    return () => coordinator.close();
  }, [currentUserId, match?.claim.id, match?.claim.space_id, match?.id, onAcceptedElsewhere]);

  if (!state || state.matchId !== match?.id || state.userId !== currentUserId) return null;
  return state.coordinator;
}

function debateMatchesMatch(debate: Debate, match: DebateMatch, currentUserId: string) {
  return (
    debate.claim.id === match.claim.id &&
    debate.claim.space_id === match.claim.space_id &&
    debate.participants.some(participant => participant.user_id === currentUserId) &&
    !['complete', 'cancelled'].includes(debate.status)
  );
}

function restorePageFocus(previouslyFocused: HTMLElement | null) {
  if (previouslyFocused?.isConnected && previouslyFocused !== document.body) {
    previouslyFocused.focus();
    return;
  }

  const main = document.querySelector<HTMLElement>('main');
  if (!main) return;
  const hadTabIndex = main.hasAttribute('tabindex');
  if (!hadTabIndex) main.tabIndex = -1;
  main.focus();
  if (!hadTabIndex) {
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
  }
}
