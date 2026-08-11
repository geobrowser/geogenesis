import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebatesBrowseFeed } from './debate-feed';

const mocks = vi.hoisted(() => ({
  debates: [] as Debate[],
  mediaMutate: vi.fn(),
  fetch: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:https://geo.test/social-video'),
  revokeObjectURL: vi.fn(),
  downloadClick: vi.fn(),
}));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

vi.mock('~/core/debates/hooks', () => ({
  useSpaceDebates: () => ({ data: { debates: mocks.debates }, isLoading: false, error: null }),
  useProcessedVideoDebateIds: () => ({
    processedIds: mocks.debates.map(debate => debate.id),
    isLoading: false,
    hasError: false,
  }),
  useDebateMediaArtifactUrl: () => ({ mutate: mocks.mediaMutate }),
}));

vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    sharePercentFor: () => null,
    isMyPick: () => false,
    hasVoted: false,
    isVoting: false,
    castVote: vi.fn(),
  }),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: { entity: { name: 'Fashion', image: null } }, isLoading: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [], isLoading: false }),
}));

vi.mock('./debate-feed-player', () => ({
  DebateFeedPlayer: ({ debate, active }: { debate: Debate; active: boolean }) => (
    <div data-testid={`player-${debate.id}`} data-active={active} />
  ),
}));

vi.mock('./debate-claims-panel', () => ({ DebateClaimsPanel: () => <div>Claims panel</div> }));
vi.mock('./join-debate-panel', () => ({ JoinDebatePanel: () => <div>Join panel</div> }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  observers = [];
  mocks.debates = [completedDebate('debate-1', 'Debates are useful', '2026-07-02T00:01:10.000Z')];
  mocks.createObjectURL.mockReturnValue('blob:https://geo.test/social-video');
  mocks.fetch.mockResolvedValue(videoResponse());
  mocks.canShare.mockReturnValue(false);
  mocks.mediaMutate.mockImplementation((variables, options) => {
    if (variables.request.kind === 'social_video') {
      options.onSuccess({ upload: { url: `https://video.test/${variables.debateId}.mp4` } });
    }
  });

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0.6];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback) {
      this.record = { callback, elements: new Set(), instance: this };
      observers.push(this.record);
    }

    observe = (element: Element) => this.record.elements.add(element);
    unobserve = (element: Element) => this.record.elements.delete(element);
    disconnect = () => this.record.elements.clear();
    takeRecords = () => [];
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.stubGlobal(
    'ResizeObserver',
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('fetch', mocks.fetch);
  Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mocks.createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mocks.revokeObjectURL });
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    value: mocks.downloadClick,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DebatesBrowseFeed video sharing', () => {
  it('waits for five seconds of active dwell and never prepares an adjacent debate', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(4_999);
    expect(mocks.mediaMutate).not.toHaveBeenCalled();

    await advance(1);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-1', request: { kind: 'social_video' } },
      expect.any(Object)
    );
    expect(mocks.mediaMutate.mock.calls.every(([variables]) => variables.request.kind !== 'social_preview_image')).toBe(
      true
    );
    expect(mocks.mediaMutate).not.toHaveBeenCalledWith(
      { debateId: 'debate-2', request: expect.anything() },
      expect.anything()
    );
  });

  it('cancels a fast-scroll dwell and starts a fresh five-second dwell for the new active debate', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(3_000);
    activateDebate('Adjacent debate');
    await advance(4_999);
    expect(mocks.mediaMutate).not.toHaveBeenCalled();

    await advance(1);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-2', request: { kind: 'social_video' } },
      expect.any(Object)
    );
  });

  it('aborts an in-flight preparation and revokes a ready blob when scrolling away', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    let downloadSignal: AbortSignal | undefined;
    mocks.fetch.mockImplementationOnce((_url, init) => {
      downloadSignal = init.signal;
      return new Promise(() => undefined);
    });
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    expect(downloadSignal).toBeDefined();
    activateDebate('Adjacent debate');
    expect(downloadSignal?.aborted).toBe(true);

    cleanup();
    mocks.fetch.mockResolvedValue(videoResponse());
    render(<DebatesBrowseFeed spaceId="space-1" />);
    await advance(5_000);
    await flushPromises();
    expect(mocks.createObjectURL).toHaveBeenCalled();

    activateDebate('Adjacent debate');
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:https://geo.test/social-video');
  });

  it('does not start an MP4 download when the artifact URL arrives after deactivation', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    let videoRequestOptions: { onSuccess: (response: { upload: { url: string } }) => void } | undefined;
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind === 'social_video') videoRequestOptions = options;
    });
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    expect(videoRequestOptions).toBeDefined();
    activateDebate('Adjacent debate');
    videoRequestOptions?.onSuccess({ upload: { url: 'https://video.test/debate-1.mp4' } });
    await flushPromises();

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps both preparing controls focusable, unavailable, and explained by a tooltip', async () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const shareButtons = screen.getAllByRole('button', { name: 'Share debate video (preparing)' });
    expect(shareButtons).toHaveLength(2);
    for (const button of shareButtons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
    }

    fireEvent.focus(shareButtons[0]);
    await advance(300);
    expect(screen.getAllByText('Preparing video for sharing… You can share soon.').length).toBeGreaterThan(0);
  });

  it('turns preparation failure into an enabled retry that starts immediately while active', async () => {
    let requestCount = 0;
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind !== 'social_video') return;
      requestCount += 1;
      if (requestCount === 1) options.onError(new Error('Video unavailable'));
    });
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    const retryButtons = screen.getAllByRole('button', { name: 'Retry debate video preparation' });
    expect(retryButtons).toHaveLength(2);
    expect(retryButtons[0]).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(retryButtons[0]);
    expect(requestCount).toBe(2);
  });

  it('shares only the claim title and prepared MP4 from either ready control', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockResolvedValue(undefined);
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    const shareButtons = screen.getAllByRole('button', { name: 'Share debate video' });
    expect(shareButtons).toHaveLength(2);
    expect(shareButtons.every(button => button.getAttribute('aria-disabled') === 'false')).toBe(true);
    fireEvent.focus(shareButtons[0]);
    await advance(300);
    expect(screen.queryByText('Share the debate video.')).not.toBeInTheDocument();

    fireEvent.click(shareButtons[1]);
    const file = mocks.share.mock.calls[0]?.[0].files[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('debate-debate-1-social.mp4');
    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [file] });
    expect(mocks.share.mock.calls[0]?.[0]).not.toHaveProperty('url');
    expect(mocks.share.mock.calls[0]?.[0]).not.toHaveProperty('text');
  });

  it('downloads the prepared MP4 when native file sharing is unsupported', async () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download debate video' })[0]);

    expect(mocks.downloadClick).toHaveBeenCalledTimes(1);
    const downloadLink = mocks.downloadClick.mock.instances[0] as HTMLAnchorElement;
    expect(downloadLink.href).toBe('blob:https://geo.test/social-video');
    expect(downloadLink.download).toBe('debate-debate-1-social.mp4');
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('keeps cancellation silent and a real handoff failure retryable without redownloading', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share
      .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
      .mockRejectedValueOnce(new Error('Share service unavailable'))
      .mockResolvedValueOnce(undefined);
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    fireEvent.click(screen.getAllByRole('button', { name: 'Share debate video' })[0]);
    await flushPromises();
    expect(screen.queryByRole('button', { name: /try sharing/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Share debate video' })[0]);
    await flushPromises();
    const retryButtons = screen.getAllByRole('button', { name: 'Try sharing debate video again' });
    expect(retryButtons).toHaveLength(2);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(retryButtons[1]);
    await flushPromises();
    expect(mocks.share).toHaveBeenCalledTimes(3);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate handoffs across the horizontal and vertical controls', async () => {
    mocks.canShare.mockReturnValue(true);
    let resolveShare: (() => void) | undefined;
    mocks.share.mockReturnValue(new Promise<void>(resolve => (resolveShare = resolve)));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    const shareButtons = screen.getAllByRole('button', { name: 'Share debate video' });
    fireEvent.click(shareButtons[0]);
    fireEvent.click(shareButtons[1]);

    expect(mocks.share).toHaveBeenCalledTimes(1);
    const sharingButtons = screen.getAllByRole('button', { name: 'Sharing debate video' });
    expect(sharingButtons).toHaveLength(2);
    expect(sharingButtons.every(button => button.getAttribute('aria-disabled') === 'true')).toBe(true);
    fireEvent.focus(sharingButtons[0]);
    await advance(300);
    expect(screen.queryByText('Opening sharing options…')).not.toBeInTheDocument();

    resolveShare?.();
    await flushPromises();
  });
});

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function activateDebate(claim: string) {
  const section = screen.getByRole('heading', { name: claim }).closest('section');
  if (!section) throw new Error(`Could not find debate section for ${claim}`);
  const observer = observers.find(record => record.elements.has(section));
  if (!observer) throw new Error(`Could not find observer for ${claim}`);
  act(() => {
    observer.callback(
      [
        {
          target: section,
          isIntersecting: true,
          intersectionRatio: 0.6,
        } as unknown as IntersectionObserverEntry,
      ],
      observer.instance
    );
  });
}

function videoResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-length': '3', 'content-type': 'video/mp4' },
  });
}

function completedDebate(id: string, claim: string, completedAt: string): Debate {
  return {
    id,
    claim: {
      id: `claim-${id}`,
      space_id: 'space-1',
      claim_entity_id: `claim-entity-${id}`,
      claim,
      description: null,
    },
    status: 'complete',
    response_kind: null,
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
    turn_durations_ms: [30_000, 30_000],
    created_at: completedAt,
    started_at: completedAt,
    completed_at: completedAt,
    participants: [],
    recordings: [1, 2].map(slot => ({
      id: `${id}-recording-${slot}`,
      participant_slot: slot as 1 | 2,
      position: slot === 1,
      position_label: slot === 1 ? 'Yes' : 'No',
      user_id: `${id}-user-${slot}`,
      object_key: `${id}-recording-${slot}.webm`,
      filename: `${id}-recording-${slot}.webm`,
      source: 'local' as const,
      content_type: 'video/webm',
      started_at_ms: 0,
      ended_at_ms: 60_000,
      duration_seconds: 60,
      byte_size: 1,
      width: 640,
      height: 480,
      framerate: 30,
      video_bits_per_second: 500_000,
    })),
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}
