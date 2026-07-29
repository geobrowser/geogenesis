'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type {
  Debate,
  DebateMediaResponse,
  DebateTranscriptSegment,
} from '~/core/debates/api';
import { getCurrentGeoChatUserId } from '~/core/debates/api';
import {
  debateQueryKeys,
  useDebateMedia,
  useDebateMediaArtifactUrl,
  useDebateTranscript,
  useRequestDebateMediaProcessing,
  useSpaceDebates,
} from '~/core/debates/hooks';
import { useDebugDebatesPageEnabled } from '~/core/state/feature-flags';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

type DebugDebatesPageClientProps = {
  spaceId: string;
};

type Rendition = {
  kind: 'final_video' | 'final_video_hevc' | 'social_video';
  label: 'WebM' | 'MOV' | 'Share video';
  videoClassName: string;
};

type ProcessingStatus = 'not started' | 'processing' | 'processed' | 'failed';

const renditions: Rendition[] = [
  { kind: 'final_video', label: 'WebM', videoClassName: 'aspect-[8/9] w-1/4 sm:aspect-video sm:w-full' },
  { kind: 'final_video_hevc', label: 'MOV', videoClassName: 'aspect-[8/9] w-1/4 sm:aspect-video sm:w-full' },
  { kind: 'social_video', label: 'Share video', videoClassName: 'aspect-[9/16] w-full' },
];

export function DebugDebatesPageClient({ spaceId }: DebugDebatesPageClientProps) {
  const enabled = useDebugDebatesPageEnabled();
  const router = useRouter();
  const queryClient = useQueryClient();
  const debatesQuery = useSpaceDebates(spaceId, enabled);
  const currentUserId = getCurrentGeoChatUserId();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) router.replace(`/space/${spaceId}`);
  }, [enabled, router, spaceId]);

  const debates = React.useMemo(
    () => [...(debatesQuery.data?.debates ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [debatesQuery.data?.debates]
  );

  const refresh = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: debateQueryKeys.spaceDebates(spaceId) }),
        queryClient.invalidateQueries({ queryKey: ['debates', 'media'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, spaceId]);

  if (!enabled) return null;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-3xl flex-col gap-2">
          <Text as="h1" variant="largeTitle">
            Debug debates
          </Text>
          <Text as="p" color="grey-04">
            Processing diagnostics for at most the latest 50 completed debates, plus active or cancelled debates visible
            to the signed-in participant.
          </Text>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={debatesQuery.isFetching || isRefreshing}
          onClick={() => void refresh()}
        >
          {debatesQuery.isFetching || isRefreshing ? 'Refreshing…' : 'Refresh diagnostics'}
        </Button>
      </header>

      {debatesQuery.isLoading && <StateMessage>Loading debate diagnostics…</StateMessage>}
      {debatesQuery.error && (
        <StateMessage tone="error">Could not load debates: {errorMessage(debatesQuery.error)}</StateMessage>
      )}
      {!debatesQuery.isLoading && !debatesQuery.error && debates.length === 0 && (
        <StateMessage>No debates found for this space.</StateMessage>
      )}

      {debates.length > 0 && (
        <div className="flex flex-col gap-5">
          {debates.map(debate => (
            <DebateDiagnosticsCard key={debate.id} debate={debate} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </main>
  );
}

function DebateDiagnosticsCard({ debate, currentUserId }: { debate: Debate; currentUserId: string | null }) {
  const mediaQuery = useDebateMedia(debate.id, true);
  const reprocessMedia = useRequestDebateMediaProcessing(debate.id);
  const [reprocessError, setReprocessError] = React.useState<string | null>(null);
  const media = mediaQuery.data;
  const status = processingStatus(media);
  const mediaJobStatus = media?.job?.status ?? null;
  const isMediaProcessing = mediaJobStatus === 'queued' || mediaJobStatus === 'running';
  const canReprocess =
    debate.status === 'complete' &&
    !!currentUserId &&
    debate.participants.some(participant => participant.user_id === currentUserId);

  const reprocessVideo = async () => {
    setReprocessError(null);
    try {
      await reprocessMedia.mutateAsync({ force: true });
    } catch (error) {
      setReprocessError(`Could not reprocess video: ${errorMessage(error)}`);
    }
  };

  return (
    <article
      data-debug-debate-card
      data-testid={`debate-card-${debate.id}`}
      id={`debate-${debate.id}`}
      className="flex scroll-mt-24 flex-col gap-5 rounded-xl border border-grey-02 bg-white p-4 shadow-light md:p-6"
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Text as="h2" variant="smallTitle" className="max-w-3xl">
            {debate.claim.claim}
          </Text>
          {canReprocess && (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button
                type="button"
                variant="secondary"
                small
                disabled={isMediaProcessing || reprocessMedia.isPending}
                onClick={() => void reprocessVideo()}
              >
                {isMediaProcessing || reprocessMedia.isPending ? 'Processing…' : 'Reprocess video'}
              </Button>
              {reprocessError && (
                <Text as="p" variant="metadata" color="red-01" className="max-w-sm sm:text-right">
                  {reprocessError}
                </Text>
              )}
            </div>
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <DiagnosticField label="Debate ID" value={debate.id} code />
          <DiagnosticField label="Created" value={formatDate(debate.created_at)} />
          <div className="min-w-0">
            <dt className="text-grey-04">Lifecycle</dt>
            <dd>{debate.status}</dd>
            <dd className="mt-2">
              <ProcessingDetails
                isLoading={mediaQuery.isLoading}
                error={mediaQuery.error}
                media={media}
                status={status}
              />
            </dd>
          </div>
          <DiagnosticField
            label="Media job"
            value={mediaQuery.isLoading ? 'loading' : mediaQuery.error ? 'unavailable' : (media?.job?.status ?? 'none')}
          />
        </dl>
      </header>

      <section aria-label="Participants" className="grid gap-3 sm:grid-cols-2">
        {[...debate.participants]
          .sort((a, b) => a.participant_slot - b.participant_slot)
          .map(participant => (
            <div key={participant.user_id} className="rounded-lg bg-bg px-3 py-2">
              <Text as="p" variant="bodySemibold">
                Slot {participant.participant_slot}: {participant.display_name ?? 'Unnamed participant'}
              </Text>
              <Text as="p" variant="metadata" color="grey-04">
                {participant.position_label} · user {participant.user_id} · profile {participant.profile_space_id}
              </Text>
            </div>
          ))}
      </section>

      {status === 'processed' && media && (
        <section aria-label="Processed videos" className="grid gap-4 lg:grid-cols-3">
          {renditions.map(rendition => (
            <ProcessedRendition
              key={rendition.kind}
              debateId={debate.id}
              rendition={rendition}
              available={media.artifacts.some(artifact => artifact.kind === rendition.kind)}
            />
          ))}
        </section>
      )}

      <TranscriptSection debateId={debate.id} segmentCount={media?.transcript_segment_count} />
    </article>
  );
}

function ProcessingDetails({
  isLoading,
  error,
  media,
  status,
}: {
  isLoading: boolean;
  error: Error | null;
  media: DebateMediaResponse | undefined;
  status: ProcessingStatus;
}) {
  return (
    <section aria-label="Processing details" className="flex flex-col items-start gap-1">
      {isLoading && <StateMessage compact>Loading processing status…</StateMessage>}
      {error && (
        <StateMessage compact tone="error">
          Could not load media: {errorMessage(error)}
        </StateMessage>
      )}
      {!isLoading && !error && <ProcessingBadge status={status} />}
      {media && (
        <div className="flex flex-col gap-1 text-sm">
          <span>Attempts: {media.job?.attempt_count ?? 0}</span>
          {media.job?.last_error && <span className="text-red-02">Latest error: {media.job.last_error}</span>}
        </div>
      )}
    </section>
  );
}

const processingStatusColor: Record<ProcessingStatus, string> = {
  'not started': 'bg-bg text-grey-04',
  processing: 'bg-orange/15 text-orange',
  processed: 'bg-green/15 text-green',
  failed: 'bg-red-01/10 text-red-02',
};

function ProcessingBadge({ status }: { status: ProcessingStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${processingStatusColor[status]}`}>
      Processing: {status}
    </span>
  );
}

function ProcessedRendition({ debateId, rendition, available }: { debateId: string; rendition: Rendition; available: boolean }) {
  const artifactUrl = useDebateMediaArtifactUrl();
  const loadUrlRef = React.useRef(artifactUrl.mutate);
  const [url, setUrl] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [playbackError, setPlaybackError] = React.useState(false);

  React.useEffect(() => {
    loadUrlRef.current = artifactUrl.mutate;
  }, [artifactUrl.mutate]);

  React.useEffect(() => {
    let active = true;
    setUrl(null);
    setLoadError(null);
    setPlaybackError(false);
    if (!available) return;

    loadUrlRef.current(
      { debateId, request: { kind: rendition.kind } },
      {
        onSuccess: response => {
          if (active) setUrl(response.upload.url);
        },
        onError: error => {
          if (active) setLoadError(errorMessage(error));
        },
      }
    );

    return () => {
      active = false;
    };
  }, [available, debateId, rendition.kind]);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <Text as="h3" variant="bodySemibold">
        {rendition.label}
      </Text>
      {!available && <StateMessage compact>{rendition.label} rendition is missing.</StateMessage>}
      {available && !url && !loadError && <StateMessage compact>Loading {rendition.label} URL…</StateMessage>}
      {loadError && (
        <StateMessage compact tone="error">
          Could not load the {rendition.label} URL: {loadError}
        </StateMessage>
      )}
      {url && (
        <>
          <video
            src={url}
            aria-label={`${rendition.label} processed video`}
            controls
            playsInline
            preload="metadata"
            onError={() => setPlaybackError(true)}
            className={`${rendition.videoClassName} rounded bg-white object-contain`}
          />
          {playbackError && <StateMessage compact tone="error">{rendition.label} playback failed.</StateMessage>}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm font-medium text-ctaPrimary hover:underline"
          >
            Open {rendition.label} directly
          </a>
        </>
      )}
    </div>
  );
}

function TranscriptSection({ debateId, segmentCount }: { debateId: string; segmentCount: number | undefined }) {
  const [expanded, setExpanded] = React.useState(false);
  const transcriptQuery = useDebateTranscript(debateId, 'json', expanded);
  const label = segmentCount === undefined ? 'count unavailable' : `${segmentCount} ${segmentCount === 1 ? 'segment' : 'segments'}`;
  const segments = transcriptQuery.data?.segments ?? [];

  return (
    <section aria-label="Transcript" className="flex flex-col gap-3 border-t border-grey-02 pt-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? `Hide transcript (${label})` : `Show transcript (${label})`}
        onClick={() => setExpanded(current => !current)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
      >
        <Text as="span" variant="bodySemibold">
          Transcript · {label}
        </Text>
        <Text as="span" variant="metadata" color="grey-04">
          {expanded ? `Hide transcript (${label})` : `Show transcript (${label})`}
        </Text>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3">
          {transcriptQuery.isLoading && <StateMessage compact>Loading transcript…</StateMessage>}
          {transcriptQuery.error && (
            <StateMessage compact tone="error">
              Could not load transcript: {errorMessage(transcriptQuery.error)}
            </StateMessage>
          )}
          {!transcriptQuery.isLoading && !transcriptQuery.error && segments.length === 0 && (
            <StateMessage compact>No transcript segments found.</StateMessage>
          )}
          {segments.map(segment => (
            <TranscriptSegment key={segment.id} segment={segment} />
          ))}
        </div>
      )}
    </section>
  );
}

function TranscriptSegment({ segment }: { segment: DebateTranscriptSegment }) {
  return (
    <div className="grid gap-2 rounded-lg bg-bg p-3 sm:grid-cols-[150px_1fr]">
      <div className="flex flex-col">
        <Text as="span" variant="metadataMedium">
          {formatTimestamp(segment.start_ms)}–{formatTimestamp(segment.end_ms)}
        </Text>
        <Text as="span" variant="metadata" color="grey-04">
          Slot {segment.participant_slot} · {segment.position_label}
        </Text>
      </div>
      <Text as="p">{segment.text}</Text>
    </div>
  );
}

function DiagnosticField({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-grey-04">{label}</dt>
      <dd className={code ? 'truncate font-mono text-xs' : ''}>{value}</dd>
    </div>
  );
}

function StateMessage({
  children,
  tone = 'muted',
  compact = false,
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
  compact?: boolean;
}) {
  return (
    <p className={`${compact ? 'text-sm' : 'rounded-lg border border-grey-02 p-4'} ${tone === 'error' ? 'text-red-02' : 'text-grey-04'}`}>
      {children}
    </p>
  );
}

function processingStatus(media: DebateMediaResponse | undefined): ProcessingStatus {
  const status = media?.job?.status;
  if (!status) return 'not started' as const;
  if (status === 'queued' || status === 'running') return 'processing' as const;
  if (status === 'succeeded') return 'processed' as const;
  return 'failed' as const;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatTimestamp(milliseconds: number) {
  const safeMilliseconds = Math.max(0, milliseconds);
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000);
  const remainder = Math.floor(safeMilliseconds % 1_000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}
