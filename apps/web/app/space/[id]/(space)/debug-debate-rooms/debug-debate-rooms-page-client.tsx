'use client';

import * as React from 'react';

import Link from 'next/link';

import type { ScheduledDebateRequest } from '~/core/debates/api';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import {
  useCreateScheduledDebate,
  useRespondToScheduledDebate,
  useScheduledDebates,
} from '~/core/debates/rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useDebugDebatesPageEnabled } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

/** Long enough to answer in another browser, short enough that the door opens while you watch. */
const DEFAULT_MINUTES_AHEAD = 12;
const DEFAULT_DURATION = 30;

/**
 * Where an invited person accepts, since nothing else renders an incoming request yet (GEO-2940).
 * The form is a fallback proposer for someone offline, who has no People row to pick from.
 */
export function DebugDebateRoomsPageClient() {
  const enabled = useDebugDebatesPageEnabled();
  const viewerId = useCurrentGeoChatUserId();
  const requests = useScheduledDebates(enabled);
  const propose = useCreateScheduledDebate();
  const respond = useRespondToScheduledDebate();

  const [opponent, setOpponent] = React.useState('');
  const [minutesAhead, setMinutesAhead] = React.useState(String(DEFAULT_MINUTES_AHEAD));
  const [conflict, setConflict] = React.useState<string | null>(null);

  if (!enabled) {
    return (
      <div className="px-5 py-8">
        <Text>Turn on the debates debug flag to use this page.</Text>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setConflict(null);
    const ahead = Number(minutesAhead);
    if (!opponent.trim() || Number.isNaN(ahead)) return;
    if (viewerId && opponent.trim().replace(/-/g, '') === viewerId.replace(/-/g, '')) {
      setConflict('That is your own id. A debate needs two people.');
      return;
    }
    propose.mutate({
      opponentUserId: opponent.trim(),
      startsAt: new Date(Date.now() + ahead * 60_000),
      minutes: DEFAULT_DURATION,
    });
  };

  const answer = (requestId: string, accepted: boolean) => {
    setConflict(null);
    respond.mutate(
      { requestId, accepted },
      {
        onSuccess: result => {
          if (result.outcome === 'conflict') {
            setConflict(`Clashes with a debate from ${formatWhen(result.conflicting_start_at)}.`);
          }
        },
        onError: error => setConflict(error.message),
      }
    );
  };

  const rows = requests.data?.requests ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <Text as="h1" variant="mediumTitle">
          Book a debate room
        </Text>
        <Text variant="footnote" color="grey-04">
          Accept below as the person who was invited: that second answer is what books the room. To propose, use Debates
          hub, People, See times, and pick a slot. Your own id is {viewerId ?? 'still resolving'}.
        </Text>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-grey-02 p-4">
        <Text variant="footnote" color="grey-04">
          Fallback proposer, for someone who is not online and so has no People row to pick from.
        </Text>
        <label className="flex flex-col gap-1">
          <Text variant="metadataMedium">Opponent geo-chat user id</Text>
          <input
            value={opponent}
            onChange={event => setOpponent(event.target.value)}
            placeholder="their user id"
            className="rounded border border-grey-02 px-3 py-2 text-metadata"
          />
        </label>
        <label className="flex flex-col gap-1">
          <Text variant="metadataMedium">Starts in (minutes)</Text>
          <input
            value={minutesAhead}
            onChange={event => setMinutesAhead(event.target.value)}
            inputMode="numeric"
            className="w-32 rounded border border-grey-02 px-3 py-2 text-metadata"
          />
          <Text variant="footnote" color="grey-04">
            The door opens 10 minutes before the start, so anything under 10 is open immediately.
          </Text>
        </label>
        <div>
          <Button type="submit" disabled={propose.isPending || !opponent.trim()}>
            {propose.isPending ? 'Proposing…' : 'Propose debate'}
          </Button>
        </div>
        {propose.error && <Text color="red-01">{propose.error.message}</Text>}
      </form>

      {conflict && <Text color="red-01">{conflict}</Text>}

      <section className="flex flex-col gap-3">
        <Text as="h2" variant="metadataMedium">
          Your scheduled debates
        </Text>
        {requests.isLoading && <Text color="grey-04">Loading…</Text>}
        {requests.error && <Text color="red-01">Could not read your schedule: {requests.error.message}</Text>}
        {!requests.isLoading && !requests.error && rows.length === 0 && <Text color="grey-04">Nothing scheduled.</Text>}
        {rows.map(request => (
          <ScheduledRow key={request.request_id} request={request} busy={respond.isPending} onAnswer={answer} />
        ))}
      </section>
    </div>
  );
}

function ScheduledRow({
  request,
  busy,
  onAnswer,
}: {
  request: ScheduledDebateRequest;
  busy: boolean;
  onAnswer: (requestId: string, accepted: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <div className="flex items-center justify-between gap-3">
        <Text variant="metadata">{formatWhen(request.scheduled_start_at)}</Text>
        <Text variant="footnote" color="grey-04">
          {request.status}
        </Text>
      </div>
      <Text variant="footnote" color="grey-04">
        {request.participants.map(p => `${p.user_id.slice(0, 8)}: ${answerLabel(p.accepted)}`).join(' · ')}
      </Text>

      {request.viewer_must_answer && (
        <div className="flex gap-2">
          <Button onClick={() => onAnswer(request.request_id, true)} disabled={busy}>
            Accept
          </Button>
          <Button variant="secondary" onClick={() => onAnswer(request.request_id, false)} disabled={busy}>
            Decline
          </Button>
        </div>
      )}

      {request.room_id && (
        <Link href={debateRoomPath(request.room_id)} className="text-metadata underline">
          Open the room
        </Link>
      )}
    </div>
  );
}

function answerLabel(accepted: boolean | null) {
  return accepted === null ? 'no answer' : accepted ? 'accepted' : 'declined';
}

function formatWhen(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}
