'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { Debate, DebateRecording } from '~/core/debates/api';
import { useRecordingUrl, useSpaceDebates } from '~/core/debates/hooks';
import { DebateMatchPrompt } from '~/core/debates/match-prompt';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

type DebatesPageClientProps = {
  spaceId: string;
};

export function DebatesPageClient({ spaceId }: DebatesPageClientProps) {
  const questionsAndDebatesEnabled = useFeatureFlag('questionsTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!questionsAndDebatesEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [questionsAndDebatesEnabled, router, spaceId]);

  if (!questionsAndDebatesEnabled) return null;

  return <DebatesTabSurface spaceId={spaceId} />;
}

function DebatesTabSurface({ spaceId }: DebatesPageClientProps) {
  const debatesQuery = useSpaceDebates(spaceId, true);
  const matches = debatesQuery.data?.matches ?? [];
  const debates = debatesQuery.data?.debates ?? [];

  return (
    <div className="py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="smallTitle" color="text">
          Debates
        </Text>
      </div>

      {debatesQuery.isLoading && matches.length === 0 && debates.length === 0 && (
        <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
          <Text color="grey-04">Loading debates...</Text>
        </div>
      )}

      {debatesQuery.error instanceof Error && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-4">
          <Text color="red-01">{debatesQuery.error.message}</Text>
        </div>
      )}

      {!debatesQuery.isLoading && matches.length === 0 && debates.length === 0 && (
        <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
          <Text as="h3" variant="bodySemibold" color="text">
            No debates yet
          </Text>
          <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[560px]">
            Start from a published question by choosing one side on the Questions tab.
          </Text>
        </div>
      )}

      <div className="space-y-4">
        {debates.length > 0 && (
          <section>
            <Text as="h3" variant="bodySemibold" color="text" className="mb-2 block">
              Space debates
            </Text>
            <div className="space-y-3">
              {debates.map(debate => (
                <DebateCard key={debate.id} debate={debate} spaceId={spaceId} />
              ))}
            </div>
          </section>
        )}
      </div>
      <DebateMatchPrompt spaceId={spaceId} matches={matches} debates={debates} />
    </div>
  );
}

function DebateCard({ debate, spaceId }: { debate: Debate; spaceId: string }) {
  const router = useRouter();
  const isLive = !['complete', 'cancelled'].includes(debate.status);

  return (
    <article className="rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Text as="h3" variant="bodySemibold" color="text" className="block">
            {debate.question.question}
          </Text>
          <Text as="p" variant="body" color="grey-04" className="mt-2">
            {statusLabel(debate.status)} · {formatDate(debate.completed_at ?? debate.started_at ?? debate.created_at)}
          </Text>
          <div className="mt-2 flex flex-wrap gap-2">
            {debate.participants.map(participant => (
              <span
                key={participant.user_id}
                className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text"
              >
                <span className="truncate">
                  {speakerLabel(participant)} ·{' '}
                  {participant.side === 'for' ? debate.question.side_labels.for : debate.question.side_labels.against}
                </span>
              </span>
            ))}
          </div>
        </div>
        {isLive && (
          <Button type="button" small onClick={() => router.push(`/space/${spaceId}/debates/${debate.id}`)}>
            Enter debate
          </Button>
        )}
      </div>

      {debate.recordings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {debate.recordings.map(recording => (
            <RecordingButton key={recording.id} debateId={debate.id} recording={recording} />
          ))}
        </div>
      )}
    </article>
  );
}

function RecordingButton({ debateId, recording }: { debateId: string; recording: DebateRecording }) {
  const recordingUrl = useRecordingUrl();

  const openRecording = () => {
    recordingUrl.mutate(
      { debateId, filename: recording.filename },
      {
        onSuccess: result => {
          window.open(result.url, '_blank', 'noopener,noreferrer');
        },
      }
    );
  };

  return (
    <Button type="button" variant="secondary" small onClick={openRecording} disabled={recordingUrl.isPending}>
      {recording.side === 'for' ? 'For' : 'Against'} recording
    </Button>
  );
}

function speakerLabel(participant: { display_name: string | null; profile_space_id: string }) {
  return participant.display_name || participant.profile_space_id;
}

function statusLabel(status: Debate['status']) {
  return status.replace('_', ' ');
}

function formatDate(value: string | null) {
  if (!value) return 'Not started';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
