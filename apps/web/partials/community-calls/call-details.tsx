'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  deleteRecording,
  getCallAttendees,
  getCallChat,
  getCallTranscript,
  listRecordings,
} from '~/core/community-calls/api';
import { OCCURRENCE_MATCH_TOLERANCE_MS, detailsHref, parseRoomName } from '~/core/community-calls/constants';
import { formatDateTime, formatDuration, formatFullDate, formatTimeRange } from '~/core/community-calls/format';
import {
  CallAttendee,
  CallChatLogMessage,
  Occurrence,
  Recording,
  TranscriptSegment,
} from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { usePublishRecordings } from '~/core/community-calls/use-publish-recordings';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { normId } from '~/core/utils/norm-id';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';

import { OccurrenceSelector } from './occurrence-selector';
import { RecordingPlayer } from './recording-player';

const SYSTEM_SENDER_IDENTITY = 'system';

type Tab = 'overview' | 'recordings' | 'attendees' | 'transcript' | 'chat' | 'call-log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'attendees', label: 'Attendees' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'chat', label: 'Chat' },
  { id: 'call-log', label: 'Call Log' },
];

export function CallDetails({
  spaceId,
  callId,
  seriesName,
  seriesDescription,
  occurrence,
  schedule,
}: {
  spaceId: string;
  callId: string;
  seriesName: string;
  seriesDescription: string;
  occurrence: Occurrence;
  schedule: string;
}) {
  const { isEditor, isLoading: accessLoading } = useAccessControl(spaceId);
  const { identityToken, getToken } = useCommunityCallIdentityToken();
  const [tab, setTab] = React.useState<Tab>('overview');

  const ended = Date.now() > occurrence.endMs;

  const { data: recordingsData, refetch: refetchRecordings } = useQuery({
    queryKey: ['community-call-details-recordings', spaceId, callId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { recordings: [] };
      return listRecordings(token);
    },
    enabled: isEditor && Boolean(identityToken) && ended,
  });
  // Match by normalized id + start-time proximity, not exact roomName equality: calls hosted
  // before this call existed as a GRC-20 entity have a dashed-UUID callId baked into their
  // recording's roomName (curator's buildRoomName never normalizes it), and their occurrenceStart
  // may have been computed by a different RRULE engine — both would fail a strict `===`.
  const recordings = (recordingsData?.recordings ?? []).filter(r => {
    const parsed = parseRoomName(r.roomName);
    if (!parsed) return false;
    return (
      normId(parsed.spaceId) === normId(spaceId) &&
      normId(parsed.callId) === normId(callId) &&
      Math.abs(parsed.occurrenceStart - occurrence.startMs) <= OCCURRENCE_MATCH_TOLERANCE_MS
    );
  });

  const { data: attendeesData } = useQuery({
    queryKey: ['community-call-details-attendees', spaceId, callId, occurrence.startMs],
    queryFn: () => getCallAttendees({ spaceId, callId, occurrenceStart: occurrence.startMs }),
    enabled: ended,
  });
  const attendees = attendeesData?.attendees ?? [];

  const { data: chatData } = useQuery({
    queryKey: ['community-call-details-chat', spaceId, callId, occurrence.startMs],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { messages: [] };
      return getCallChat({ spaceId, callId, occurrenceStart: occurrence.startMs }, token);
    },
    enabled: isEditor && Boolean(identityToken) && ended,
  });
  const chatMessages = chatData?.messages ?? [];
  const chat = chatMessages.filter(m => m.senderIdentity !== SYSTEM_SENDER_IDENTITY);
  const callLog = chatMessages.filter(m => m.senderIdentity === SYSTEM_SENDER_IDENTITY);

  const { data: transcriptData } = useQuery({
    queryKey: ['community-call-details-transcript', spaceId, callId, occurrence.startMs],
    queryFn: () => getCallTranscript({ spaceId, callId, occurrenceStart: occurrence.startMs }),
    enabled: ended,
  });
  const transcriptSegments = transcriptData?.segments ?? [];

  if (accessLoading) {
    return <p className="p-8 text-metadata text-grey-04">Loading…</p>;
  }

  if (!isEditor) {
    return <p className="p-8 text-metadata text-grey-04">Only space editors can view call details.</p>;
  }

  if (!ended) {
    return (
      <p className="p-8 text-metadata text-grey-04">
        Details for this occurrence will be available once the call has ended.
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-smallTitle">{seriesName} — Details</span>
          <span className="text-metadata text-grey-04">
            {formatFullDate(occurrence.startMs)} · {formatTimeRange(occurrence.startMs, occurrence.endMs)}
          </span>
        </div>
        <OccurrenceSelector
          schedule={schedule}
          selectedStartMs={occurrence.startMs}
          hrefFor={(startMs, endMs) => detailsHref(spaceId, callId, startMs, endMs)}
        />
      </div>

      <div className="flex items-center gap-4 border-b border-grey-02">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b py-2 text-quoteMedium ${
              tab === t.id ? 'border-text text-text' : 'border-transparent text-grey-04 hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          recordingsCount={recordings.length}
          attendeesCount={attendees.length}
          transcriptCount={transcriptSegments.length}
          chatCount={chat.length}
          callLogCount={callLog.length}
        />
      )}
      {tab === 'recordings' && (
        <RecordingsTab
          recordings={recordings}
          getToken={getToken}
          onChanged={refetchRecordings}
          spaceId={spaceId}
          callId={callId}
          seriesName={seriesName}
          seriesDescription={seriesDescription}
          occurrence={occurrence}
        />
      )}
      {tab === 'attendees' && <AttendeesTab attendees={attendees} />}
      {tab === 'transcript' && <TranscriptTab segments={transcriptSegments} />}
      {tab === 'chat' && <ChatLogTab messages={chat} empty="No chat messages for this occurrence." />}
      {tab === 'call-log' && <CallLogTab messages={callLog} />}
    </div>
  );
}

function OverviewTab({
  recordingsCount,
  attendeesCount,
  transcriptCount,
  chatCount,
  callLogCount,
}: {
  recordingsCount: number;
  attendeesCount: number;
  transcriptCount: number;
  chatCount: number;
  callLogCount: number;
}) {
  const rows = [
    { label: 'Call ended', ready: true },
    { label: `${recordingsCount} recording${recordingsCount === 1 ? '' : 's'}`, ready: recordingsCount > 0 },
    { label: `${attendeesCount} attendee${attendeesCount === 1 ? '' : 's'}`, ready: attendeesCount > 0 },
    { label: `${transcriptCount} transcript segment${transcriptCount === 1 ? '' : 's'}`, ready: transcriptCount > 0 },
    { label: `${chatCount} chat message${chatCount === 1 ? '' : 's'}`, ready: chatCount > 0 },
    { label: `${callLogCount} call log ${callLogCount === 1 ? 'entry' : 'entries'}`, ready: callLogCount > 0 },
  ];

  return (
    <ul className="flex flex-col gap-2 rounded-lg border border-grey-02 p-4">
      {rows.map(row => (
        <li key={row.label} className="flex items-center gap-2 text-metadata">
          <span className={`size-2 rounded-full ${row.ready ? 'bg-green' : 'bg-grey-02'}`} />
          <span className={row.ready ? 'text-text' : 'text-grey-04'}>{row.label}</span>
        </li>
      ))}
    </ul>
  );
}

function RecordingsTab({
  recordings,
  getToken,
  onChanged,
  spaceId,
  callId,
  seriesName,
  seriesDescription,
  occurrence,
}: {
  recordings: Recording[];
  getToken: () => Promise<string | null>;
  onChanged: () => void;
  spaceId: string;
  callId: string;
  seriesName: string;
  seriesDescription: string;
  occurrence: Occurrence;
}) {
  const { publish, publishingKey } = usePublishRecordings();
  const [deletingFilename, setDeletingFilename] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const onDelete = async (filename: string) => {
    setBusy(filename);
    try {
      const token = await getToken();
      if (token) await deleteRecording({ filename }, token);
      onChanged();
    } finally {
      setBusy(null);
      setDeletingFilename(null);
    }
  };

  if (recordings.length === 0) {
    return <p className="text-metadata text-grey-04">No recordings for this occurrence.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {recordings.map(r => (
        <div key={r.filename} className="flex items-center justify-between rounded-lg border border-grey-02 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-metadata text-text">{formatDateTime(r.startedAt)}</span>
            <span className="text-footnote text-grey-04">{formatDuration(r.duration)}</span>
          </div>
          {deletingFilename === r.filename ? (
            <div className="flex items-center gap-2">
              <SmallButton onClick={() => setDeletingFilename(null)} disabled={busy === r.filename}>
                Cancel
              </SmallButton>
              <SmallButton onClick={() => onDelete(r.filename)} disabled={busy === r.filename}>
                {busy === r.filename ? 'Deleting…' : 'Confirm delete'}
              </SmallButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Dialog
                trigger={<SmallButton>Watch</SmallButton>}
                header={<span className="text-smallTitle">{formatDateTime(r.startedAt)}</span>}
                content={<RecordingPlayer recordings={[r]} />}
              />
              <SmallButton
                onClick={() =>
                  publish({
                    recordings: [r],
                    spaceId,
                    callId,
                    seriesName,
                    seriesDescription,
                    occurrence,
                    busyKey: r.filename,
                  })
                }
                disabled={publishingKey === r.filename}
              >
                {publishingKey === r.filename ? 'Publishing…' : 'Publish'}
              </SmallButton>
              <SmallButton onClick={() => setDeletingFilename(r.filename)} disabled={publishingKey === r.filename}>
                Delete
              </SmallButton>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AttendeesTab({ attendees }: { attendees: CallAttendee[] }) {
  if (attendees.length === 0) {
    return <p className="text-metadata text-grey-04">No attendance recorded for this occurrence.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {attendees.map(a => (
        <li key={a.identity} className="flex items-center justify-between rounded-lg border border-grey-02 p-3">
          <div className="flex items-center gap-2">
            <span className="size-6 shrink-0 overflow-hidden rounded-full">
              <Avatar
                value={a.name || a.identity}
                avatarUrl={a.avatarCid ? `ipfs://${a.avatarCid}` : undefined}
                size={24}
              />
            </span>
            <div className="flex flex-col">
              <span className="text-metadata text-text">
                {a.name || a.identity}
                {a.isAdmin && <span className="ml-1.5 text-footnote text-grey-04">Editor</span>}
              </span>
              <span className="text-footnote text-grey-04">
                {formatDateTime(a.firstJoinedAt)} – {formatDateTime(a.lastLeftAt)}
              </span>
            </div>
          </div>
          <span className="text-footnote text-grey-04">
            {a.sessionCount} session{a.sessionCount === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TranscriptTab({ segments }: { segments: TranscriptSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-metadata text-grey-04">No transcript for this occurrence.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {segments.map(s => (
        <li key={s.id} className="flex flex-col gap-0.5 rounded-lg border border-grey-02 p-3">
          <div className="flex items-center justify-between">
            <span className="text-metadataMedium text-text">{s.speakerName}</span>
            <span className="text-footnote text-grey-04">{formatDateTime(s.timestamp)}</span>
          </div>
          <span className="text-metadata text-grey-04">{s.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ChatLogTab({ messages, empty }: { messages: CallChatLogMessage[]; empty: string }) {
  if (messages.length === 0) {
    return <p className="text-metadata text-grey-04">{empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map(m => (
        <li key={m.id} className="flex flex-col gap-0.5 rounded-lg border border-grey-02 p-3">
          <div className="flex items-center justify-between">
            <span className="text-metadataMedium text-text">{m.senderName}</span>
            <span className="text-footnote text-grey-04">{formatDateTime(m.timestamp)}</span>
          </div>
          <span className="text-metadata text-grey-04">{m.content}</span>
        </li>
      ))}
    </ul>
  );
}

/** System events (join/leave/mute/etc.) rendered as a compact log line with the actor bolded inline. */
function CallLogTab({ messages }: { messages: CallChatLogMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-metadata text-grey-04">No call log entries for this occurrence.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {messages.map(m => (
        <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-grey-02 px-3 py-2">
          <span className="text-metadata text-grey-04">
            <span className="text-metadataMedium text-text">{m.senderName}</span> {m.content}
          </span>
          <span className="shrink-0 text-footnote text-grey-04">{formatDateTime(m.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}
