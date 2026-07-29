import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateMediaArtifactKind, DebateMediaJobStatus, DebateMediaResponse } from '~/core/debates/api';

import { DebugDebatesPageClient } from './debug-debates-page-client';

const mocks = vi.hoisted(() => ({
  debugEnabled: true,
  currentUserId: 'user-1' as string | null,
  replace: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  reprocess: vi.fn<(debateId: string, request: { force?: boolean }) => Promise<void>>().mockResolvedValue(undefined),
  reprocessPending: new Set<string>(),
  listResult: {
    data: { debates: [] as Debate[], matches: [] },
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
  },
  mediaByDebate: new Map<string, { data?: DebateMediaResponse; isLoading: boolean; error: Error | null }>(),
  transcriptByDebate: new Map<string, { data?: unknown; isLoading: boolean; error: Error | null }>(),
  transcriptCalls: [] as Array<{ debateId: string; enabled: boolean }>,
  artifactUrls: new Map<string, string>(),
  artifactErrors: new Set<string>(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();
  return { ...actual, getCurrentGeoChatUserId: () => mocks.currentUserId };
});

vi.mock('~/core/state/feature-flags', () => ({
  useDebugDebatesPageEnabled: () => mocks.debugEnabled,
}));

vi.mock('~/core/debates/hooks', () => ({
  debateQueryKeys: {
    spaceDebates: (spaceId: string) => ['debates', 'space', spaceId],
  },
  useSpaceDebates: () => mocks.listResult,
  useDebateMedia: (debateId: string) =>
    mocks.mediaByDebate.get(debateId) ?? { data: undefined, isLoading: false, error: null },
  useRequestDebateMediaProcessing: (debateId: string) => ({
    mutateAsync: (request: { force?: boolean }) => mocks.reprocess(debateId, request),
    isPending: mocks.reprocessPending.has(debateId),
  }),
  useDebateMediaArtifactUrl: () => ({
    mutate: (
      { debateId, request }: { debateId: string; request: { kind: DebateMediaArtifactKind } },
      callbacks: { onSuccess: (value: { upload: { url: string } }) => void; onError: (error: Error) => void }
    ) => {
      const key = `${debateId}:${request.kind}`;
      if (mocks.artifactErrors.has(key)) callbacks.onError(new Error('URL unavailable'));
      else callbacks.onSuccess({ upload: { url: mocks.artifactUrls.get(key) ?? `https://media.test/${key}` } });
    },
  }),
  useDebateTranscript: (debateId: string, _format: string, enabled: boolean) => {
    mocks.transcriptCalls.push({ debateId, enabled });
    return enabled
      ? (mocks.transcriptByDebate.get(debateId) ?? { data: { segments: [] }, isLoading: false, error: null })
      : { data: undefined, isLoading: false, error: null };
  },
}));

beforeEach(() => {
  mocks.debugEnabled = true;
  mocks.currentUserId = 'user-1';
  mocks.replace.mockReset();
  mocks.invalidateQueries.mockReset();
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.reprocess.mockReset();
  mocks.reprocess.mockResolvedValue(undefined);
  mocks.reprocessPending.clear();
  mocks.listResult = { data: { debates: [], matches: [] }, isLoading: false, isFetching: false, error: null };
  mocks.mediaByDebate.clear();
  mocks.transcriptByDebate.clear();
  mocks.transcriptCalls.length = 0;
  mocks.artifactUrls.clear();
  mocks.artifactErrors.clear();
});

afterEach(cleanup);

describe('DebugDebatesPageClient', () => {
  it('redirects to the space when its independent flag is disabled', () => {
    mocks.debugEnabled = false;

    const { container } = render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1');
  });

  it.each([
    [{ data: undefined, isLoading: true, isFetching: true, error: null }, 'Loading debate diagnostics…'],
    [{ data: undefined, isLoading: false, isFetching: false, error: new Error('List failed') }, 'Could not load debates: List failed'],
    [{ data: { debates: [], matches: [] }, isLoading: false, isFetching: false, error: null }, 'No debates found for this space.'],
  ])('renders the list state %#', (result, message) => {
    mocks.listResult = result as typeof mocks.listResult;

    render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('sorts debates newest first and refreshes the list and media queries', async () => {
    mocks.listResult.data.debates = [debate('older', '2026-07-01T00:00:00.000Z'), debate('newer', '2026-07-03T00:00:00.000Z')];

    render(<DebugDebatesPageClient spaceId="space-1" />);

    const cards = document.querySelectorAll('[data-debug-debate-card]');
    expect(cards[0]).toHaveTextContent('Claim newer');
    expect(cards[1]).toHaveTextContent('Claim older');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));
    await waitFor(() => expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2));
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['debates', 'space', 'space-1'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['debates', 'media'] });
  });

  it('shows a disabled refresh state while queries are refreshing', () => {
    mocks.listResult.isFetching = true;

    render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
  });

  it('keeps the refresh state until both list and media invalidations finish', async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshFinished = new Promise<void>(resolve => {
      resolveRefresh = resolve;
    });
    mocks.invalidateQueries.mockReturnValue(refreshFinished);

    render(<DebugDebatesPageClient spaceId="space-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh diagnostics' }));

    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();

    resolveRefresh?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh diagnostics' })).toBeEnabled());
  });

  it('shows all simplified processing states alongside raw debate lifecycles', () => {
    const statuses: Array<[string, DebateMediaJobStatus | null, string]> = [
      ['not-started', null, 'not started'],
      ['queued', 'queued', 'processing'],
      ['running', 'running', 'processing'],
      ['processed', 'succeeded', 'processed'],
      ['failed', 'failed', 'failed'],
    ];
    mocks.listResult.data.debates = statuses.map(([id]) => debate(id));
    for (const [id, status] of statuses) mocks.mediaByDebate.set(id, mediaResult(status));

    render(<DebugDebatesPageClient spaceId="space-1" />);

    for (const [id, , label] of statuses) {
      const card = screen.getByTestId(`debate-card-${id}`);
      expect(card).toHaveTextContent(`Processing: ${label}`);
      expect(card).toHaveTextContent('Lifecyclecomplete');

      const lifecycleField = within(card).getByText('Lifecycle').parentElement;
      const processingDetails = within(card).getByRole('region', { name: 'Processing details' });
      expect(lifecycleField?.querySelector('dd')?.nextElementSibling).toContainElement(processingDetails);
    }
  });

  it('shows media loading/errors and failed-job attempt details', () => {
    mocks.listResult.data.debates = [debate('loading'), debate('media-error'), debate('failed')];
    mocks.mediaByDebate.set('loading', { data: undefined, isLoading: true, error: null });
    mocks.mediaByDebate.set('media-error', { data: undefined, isLoading: false, error: new Error('Media failed') });
    mocks.mediaByDebate.set('failed', mediaResult('failed', { attempt_count: 3, last_error: 'ffmpeg exited 1' }));

    render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(screen.getByTestId('debate-card-loading')).toHaveTextContent('Loading processing status…');
    expect(screen.getByTestId('debate-card-loading')).toHaveTextContent('Media jobloading');
    expect(screen.getByTestId('debate-card-loading')).toHaveTextContent('Transcript · count unavailable');
    expect(screen.getByTestId('debate-card-media-error')).toHaveTextContent('Could not load media: Media failed');
    expect(screen.getByTestId('debate-card-media-error')).toHaveTextContent('Media jobunavailable');
    expect(screen.getByTestId('debate-card-failed')).toHaveTextContent('Attempts: 3');
    expect(screen.getByTestId('debate-card-failed')).toHaveTextContent('Latest error: ffmpeg exited 1');
  });

  it('lets a participant force reprocess a completed debate', async () => {
    mocks.listResult.data.debates = [debate('reprocess')];
    mocks.mediaByDebate.set('reprocess', mediaResult('succeeded'));

    render(<DebugDebatesPageClient spaceId="space-1" />);

    fireEvent.click(
      within(screen.getByTestId('debate-card-reprocess')).getByRole('button', { name: 'Reprocess video' })
    );

    await waitFor(() => expect(mocks.reprocess).toHaveBeenCalledWith('reprocess', { force: true }));
  });

  it('hides reprocessing from non-participants and incomplete debates', () => {
    const notParticipant = debate('not-participant');
    notParticipant.participants = notParticipant.participants.map((participant, index) => ({
      ...participant,
      user_id: `other-user-${index}`,
    }));
    const ready = debate('ready');
    ready.status = 'ready';
    const cancelled = debate('cancelled');
    cancelled.status = 'cancelled';
    mocks.listResult.data.debates = [notParticipant, ready, cancelled];

    render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(
      within(screen.getByTestId('debate-card-not-participant')).queryByRole('button', { name: 'Reprocess video' })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('debate-card-ready')).queryByRole('button', { name: 'Reprocess video' })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('debate-card-cancelled')).queryByRole('button', { name: 'Reprocess video' })
    ).not.toBeInTheDocument();
  });

  it('hides reprocessing when there is no signed-in user', () => {
    mocks.currentUserId = null;
    mocks.listResult.data.debates = [debate('signed-out')];

    render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(
      within(screen.getByTestId('debate-card-signed-out')).queryByRole('button', { name: 'Reprocess video' })
    ).not.toBeInTheDocument();
  });

  it('disables reprocessing while the media job or request is in progress', () => {
    mocks.listResult.data.debates = [debate('queued'), debate('running'), debate('pending')];
    mocks.mediaByDebate.set('queued', mediaResult('queued'));
    mocks.mediaByDebate.set('running', mediaResult('running'));
    mocks.mediaByDebate.set('pending', mediaResult('succeeded'));
    mocks.reprocessPending.add('pending');

    render(<DebugDebatesPageClient spaceId="space-1" />);

    for (const debateId of ['queued', 'running', 'pending']) {
      expect(
        within(screen.getByTestId(`debate-card-${debateId}`)).getByRole('button', { name: 'Processing…' })
      ).toBeDisabled();
    }
  });

  it('shows a reprocessing error on the affected card and clears it when retrying', async () => {
    mocks.listResult.data.debates = [debate('retry'), debate('unaffected')];
    mocks.reprocess.mockRejectedValueOnce(new Error('Reprocessing unavailable')).mockResolvedValueOnce(undefined);

    render(<DebugDebatesPageClient spaceId="space-1" />);

    const card = screen.getByTestId('debate-card-retry');
    const unaffectedCard = screen.getByTestId('debate-card-unaffected');
    fireEvent.click(within(card).getByRole('button', { name: 'Reprocess video' }));
    expect(await within(card).findByText('Could not reprocess video: Reprocessing unavailable')).toBeInTheDocument();
    expect(within(unaffectedCard).queryByText('Could not reprocess video: Reprocessing unavailable')).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Reprocess video' }));
    await waitFor(() => expect(mocks.reprocess).toHaveBeenCalledTimes(2));
    expect(within(card).queryByText('Could not reprocess video: Reprocessing unavailable')).not.toBeInTheDocument();
  });

  it('loads WebM, MOV, and share-video renditions independently in a responsive three-column layout', async () => {
    mocks.listResult.data.debates = [debate('both'), debate('webm-only')];
    mocks.mediaByDebate.set('both', mediaResult('succeeded', {}, ['final_video', 'final_video_hevc', 'social_video']));
    mocks.mediaByDebate.set('webm-only', mediaResult('succeeded', {}, ['final_video']));
    mocks.artifactUrls.set('both:final_video', 'https://media.test/both.webm');
    mocks.artifactUrls.set('both:final_video_hevc', 'https://media.test/both.mov');
    mocks.artifactUrls.set('both:social_video', 'https://media.test/both-social.mp4');

    render(<DebugDebatesPageClient spaceId="space-1" />);

    const both = screen.getByTestId('debate-card-both');
    const webm = await within(both).findByLabelText('WebM processed video');
    expect(webm).toHaveAttribute('src', 'https://media.test/both.webm');

    const mov = within(both).getByLabelText('MOV processed video');
    expect(mov).toHaveAttribute('src', 'https://media.test/both.mov');

    const shareVideo = within(both).getByLabelText('Share video processed video');
    expect(shareVideo).toHaveAttribute('src', 'https://media.test/both-social.mp4');

    expect(within(both).getByRole('region', { name: 'Processed videos' })).toHaveClass('lg:grid-cols-3');

    for (const video of [webm, mov]) {
      expect(video).toHaveClass('aspect-[8/9]', 'w-1/4', 'bg-white', 'sm:aspect-video', 'sm:w-full');
      expect(video).not.toHaveClass('bg-black');
    }
    expect(shareVideo).toHaveClass('aspect-[9/16]', 'w-full', 'bg-white', 'object-contain');
    expect(within(both).getByRole('link', { name: 'Open WebM directly' })).toHaveAttribute(
      'href',
      'https://media.test/both.webm'
    );
    expect(within(both).getByRole('link', { name: 'Open MOV directly' })).toHaveAttribute(
      'href',
      'https://media.test/both.mov'
    );
    expect(within(both).getByRole('link', { name: 'Open Share video directly' })).toHaveAttribute(
      'href',
      'https://media.test/both-social.mp4'
    );

    const webmOnly = screen.getByTestId('debate-card-webm-only');
    expect(webmOnly).toHaveTextContent('MOV rendition is missing.');
    expect(webmOnly).toHaveTextContent('Share video rendition is missing.');
  });

  it('shows independent URL and playback errors for a rendition', async () => {
    mocks.listResult.data.debates = [debate('errors')];
    mocks.mediaByDebate.set('errors', mediaResult('succeeded', {}, ['final_video', 'final_video_hevc']));
    mocks.artifactErrors.add('errors:final_video_hevc');

    render(<DebugDebatesPageClient spaceId="space-1" />);

    const card = screen.getByTestId('debate-card-errors');
    expect(await within(card).findByText('Could not load the MOV URL: URL unavailable')).toBeInTheDocument();
    const webm = await within(card).findByLabelText('WebM processed video');
    fireEvent.error(webm);
    expect(within(card).getByText('WebM playback failed.')).toBeInTheDocument();
  });

  it('does not enable transcripts until expanded, then renders segments', () => {
    mocks.listResult.data.debates = [debate('transcript')];
    mocks.mediaByDebate.set('transcript', mediaResult('succeeded', {}, [], 1));
    mocks.transcriptByDebate.set('transcript', {
      data: {
        segments: [
          {
            id: 'segment-1',
            participant_slot: 2,
            position: false,
            position_label: 'Against',
            sequence_index: 0,
            start_ms: 1_250,
            end_ms: 3_500,
            text: 'This is the transcript.',
            metadata: {},
            created_at: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<DebugDebatesPageClient spaceId="space-1" />);

    expect(mocks.transcriptCalls.every(call => call.enabled === false)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show transcript (1 segment)' }));
    expect(mocks.transcriptCalls.some(call => call.enabled)).toBe(true);
    expect(screen.getByText('00:01.250–00:03.500')).toBeInTheDocument();
    expect(screen.getByText('Slot 2 · Against')).toBeInTheDocument();
    expect(screen.getByText('This is the transcript.')).toBeInTheDocument();
  });

  it.each([
    [{ data: undefined, isLoading: true, error: null }, 'Loading transcript…'],
    [{ data: { segments: [] }, isLoading: false, error: null }, 'No transcript segments found.'],
    [{ data: undefined, isLoading: false, error: new Error('Transcript failed') }, 'Could not load transcript: Transcript failed'],
  ])('renders the expanded transcript state %#', (result, message) => {
    mocks.listResult.data.debates = [debate('transcript-state')];
    mocks.mediaByDebate.set('transcript-state', mediaResult('succeeded', {}, [], 2));
    mocks.transcriptByDebate.set('transcript-state', result);

    render(<DebugDebatesPageClient spaceId="space-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show transcript (2 segments)' }));

    expect(screen.getByText(message)).toBeInTheDocument();
  });
});

function debate(id: string, createdAt = '2026-07-02T00:00:00.000Z'): Debate {
  return {
    id,
    claim: { id: `claim-${id}`, space_id: 'space-1', claim_entity_id: `entity-${id}`, claim: `Claim ${id}`, description: null },
    status: 'complete',
    room_name: id,
    first_participant_slot: 1,
    current_turn_index: 1,
    current_speaker_slot: null,
    connecting_started_at: null,
    connecting_deadline_at: null,
    turn_started_at: null,
    turn_ends_at: null,
    preflight_ends_at: null,
    turn_format_id: 'standard',
    turn_durations_ms: [30_000],
    created_at: createdAt,
    started_at: null,
    completed_at: null,
    participants: [
      {
        user_id: 'user-1', profile_space_id: 'profile-1', display_name: 'Alex', avatar_cid: null,
        participant_slot: 1, position: true, position_label: 'For', joined_at: null, ready_at: null,
      },
      {
        user_id: 'user-2', profile_space_id: 'profile-2', display_name: null, avatar_cid: null,
        participant_slot: 2, position: false, position_label: 'Against', joined_at: null, ready_at: null,
      },
    ],
    recordings: [],
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}

function mediaResult(
  status: DebateMediaJobStatus | null,
  jobOverrides: Record<string, unknown> = {},
  artifactKinds: DebateMediaArtifactKind[] = [],
  transcriptSegmentCount = 0
) {
  const data: DebateMediaResponse = {
    job: status
      ? {
          id: `job-${status}`,
          status,
          attempt_count: 1,
          locked_at: null,
          locked_by: null,
          available_at: '2026-07-01T00:00:00.000Z',
          last_error: null,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
          completed_at: status === 'succeeded' ? '2026-07-01T00:01:00.000Z' : null,
          ...jobOverrides,
        }
      : null,
    artifacts: artifactKinds.map(kind => ({
      id: `${kind}-id`, kind, filename: `${kind}.video`, content_type: 'video/test', byte_size: 1, metadata: {},
      created_at: '2026-07-01T00:00:00.000Z',
    })),
    transcript_segment_count: transcriptSegmentCount,
    layout: {
      output_width: 1920,
      output_height: 1080,
      slot_1: { x: 0, y: 0, width: 900, height: 1080 },
      subtitles: { x: 900, y: 0, width: 120, height: 1080 },
      slot_2: { x: 1020, y: 0, width: 900, height: 1080 },
    },
    whisper_model_id: 'whisper-1',
  };
  return { data, isLoading: false, error: null };
}
