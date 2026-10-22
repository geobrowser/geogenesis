'use client';

import * as React from 'react';

import type { DebateParticipantSummary, ScheduledDebateRequest } from '../api';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { ScheduledRow, formatDebateTime } from '../matchmaking/scheduled-debates-section';
import { useGeoChatUserSummaries } from '../matchmaking/use-geo-chat-user-summaries';
import { opponentOf } from '../rooms/room-opponent';
import { sameId } from '../rooms/room-presence';
import { useOpenScheduledRequests } from '../rooms/scheduled-awaiting';
import { useRespondToScheduledDebate, useScheduledDebates } from '../rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useLobbySchedule } from './lobby-schedule';
import type { LobbyPageView } from './lobby-view';

/** Reuses the Requests tab's live list. `debate.requests_changed` refreshes it on this page too. */
export function LobbyScheduledRequests({ lobby }: { lobby: LobbyPageView }) {
  const viewerId = useCurrentGeoChatUserId();
  const query = useScheduledDebates();
  const open = useOpenScheduledRequests(query.data?.requests);
  const incoming = open.filter(request => request.viewer_must_answer);
  const ids = React.useMemo(
    () => incoming.flatMap(request => request.participants.map(person => person.user_id)),
    [incoming]
  );
  const summaries = useGeoChatUserSummaries(ids, incoming.length > 0);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  const visible = incoming.filter(request => !dismissed.has(requestVersion(request)));
  const lookUp = (id: string | null): DebateParticipantSummary | null =>
    id
      ? (lobby.members.find(member => sameId(member.user_id, id)) ??
        summaries.find(person => sameId(person.user_id, id)) ??
        null)
      : null;

  if (visible.length === 0) return null;
  return (
    <aside
      aria-label="Scheduled debate invitations"
      aria-live="polite"
      className="max-h-[50dvh] shrink-0 overflow-y-auto border-b border-grey-02 px-8 py-3 md:px-4"
    >
      <div className="flex max-w-lg flex-col gap-3">
        {visible.map(request => (
          <LobbyScheduledRequest
            key={requestVersion(request)}
            request={request}
            viewerId={viewerId}
            opponent={lookUp(opponentOf(request, viewerId))}
            viewer={lookUp(viewerId)}
            onDismiss={() => setDismissed(previous => new Set([...previous, requestVersion(request)]))}
          />
        ))}
      </div>
    </aside>
  );
}

/** A moved request needs a new answer, even if its previous time was dismissed. */
function requestVersion(request: ScheduledDebateRequest) {
  return `${request.request_id}:${request.scheduled_start_at}:${request.reschedule_count}`;
}

export function LobbyScheduledRequest({
  request,
  viewerId,
  opponent,
  viewer,
  onDismiss,
}: {
  request: ScheduledDebateRequest;
  viewerId: string | null;
  opponent: DebateParticipantSummary | null;
  viewer: DebateParticipantSummary | null;
  onDismiss: () => void;
}) {
  const respond = useRespondToScheduledDebate();
  const schedule = useLobbySchedule();
  const [error, setError] = React.useState<string | null>(null);
  const name = opponent?.display_name || 'Someone';
  const opponentId = opponentOf(request, viewerId);
  const answer = (requestId: string, accepted: boolean) => {
    setError(null);
    respond.mutate(
      { requestId, accepted, surface: 'lobby' },
      {
        onSuccess: result => {
          if (result.outcome === 'conflict')
            setError(`That clashes with a debate ${formatDebateTime(result.conflicting_start_at)}.`);
        },
        onError: failure => setError(failure.message),
      }
    );
  };
  return (
    <div className="flex flex-col gap-2 [&_button]:md:min-h-11">
      <div className="flex items-center justify-between gap-3">
        <p className="text-metadataMedium">{name} asked you to debate later</p>
        <button
          type="button"
          aria-label={`Dismiss scheduled request from ${name}`}
          {...debateActionAnalyticsAttributes('lobby', 'Dismiss scheduled request', 'dismiss_scheduled_request')}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-grey-01 md:size-11"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <ScheduledRow
        request={request}
        opponent={opponent}
        viewer={viewer}
        viewerId={viewerId}
        busy={respond.isPending}
        onAnswer={answer}
        onReschedule={
          opponentId
            ? () => schedule({ userId: opponentId, name, requestId: request.request_id, entry: 'lobby_new_time' })
            : null
        }
        analyticsSurface="lobby"
      />
      {error ? (
        <p role="alert" className="text-footnote text-red-01">
          {error}
        </p>
      ) : null}
    </div>
  );
}
