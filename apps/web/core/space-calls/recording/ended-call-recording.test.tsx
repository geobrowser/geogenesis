import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CallRecordingState } from '~/core/debates/api';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';

const mocks = vi.hoisted(() => ({
  flag: true,
  publish: vi.fn(),
  polling: [] as boolean[],
}));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/debates/lobbies/lobby-voice', () => ({ useLobbyVoiceStates: () => ({ connected: false }) }));
vi.mock('./hooks', () => ({
  useCallRecordingControl: () => ({ mutate: vi.fn() }),
  usePublishCallRecording: () => ({ mutate: mocks.publish, isPending: false, isError: false, error: null }),
  usePollWhileProcessing: (_id: string, processing: boolean) => mocks.polling.push(processing),
}));
vi.mock('./call-recording-player', () => ({
  CallRecordingPlayer: ({ callId }: { callId: string }) => <div data-testid="player">{callId}</div>,
}));

const { EndedCallRecording, ENDED_CALL_RECORDING_COPY: COPY } = await import('./ended-call-recording');

afterEach(() => {
  cleanup();
  mocks.flag = true;
  mocks.publish.mockReset();
  mocks.polling = [];
});

const READY: CallRecordingState = {
  status: 'ready',
  started_at: '2026-10-27T15:02:10Z',
  started_by: 'u1',
  stopped_at: '2026-10-27T16:02:10Z',
  end_reason: 'call_ended',
  can_start: false,
  published: false,
  duration_seconds: 3600,
};

function ended(recording: CallRecordingState | null, { editor = false, guest = false } = {}): LobbyPageView {
  return {
    lobby_id: 'call1',
    purpose: 'call',
    call: { space_id: 'space1', space_name: 'Crypto', started_by: null, recording },
    access: { status: 'closed', reason: 'ended' },
    members: [],
    viewer: guest
      ? { kind: 'guest', role: null, creator: false, hosting: false }
      : { kind: 'member', role: 'listener', hosting: false, can_manage_recording: editor },
  } as unknown as LobbyPageView;
}

describe('EndedCallRecording', () => {
  it('draws nothing with the flag off', () => {
    mocks.flag = false;
    const { container } = render(<EndedCallRecording lobby={ended({ ...READY, published: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps an unpublished recording from anyone but editors', () => {
    const { container, rerender } = render(<EndedCallRecording lobby={ended(READY)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EndedCallRecording lobby={ended(READY, { guest: true })} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EndedCallRecording lobby={ended(READY, { editor: true })} />);
    expect(screen.getByTestId('player')).toHaveTextContent('call1');
    expect(screen.getByText(COPY.unpublished)).toBeInTheDocument();
  });

  it('draws nothing for a non-editor told an unpublished recording is off', () => {
    const off = { ...READY, status: 'off' as const, end_reason: null, duration_seconds: null };
    const { container, rerender } = render(<EndedCallRecording lobby={ended(off)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EndedCallRecording lobby={ended(off, { guest: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('plays a published recording for anyone, signed out included, with no toggle', () => {
    render(<EndedCallRecording lobby={ended({ ...READY, published: true }, { guest: true })} />);
    expect(screen.getByTestId('player')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.unpublish })).toBeNull();
  });

  it('lets an editor publish and unpublish', () => {
    const { rerender } = render(<EndedCallRecording lobby={ended(READY, { editor: true })} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.publish }));
    expect(mocks.publish).toHaveBeenCalledWith(true);
    rerender(<EndedCallRecording lobby={ended({ ...READY, published: true }, { editor: true })} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.unpublish }));
    expect(mocks.publish).toHaveBeenLastCalledWith(false);
  });

  it('says it is processing, and polls only then', () => {
    render(<EndedCallRecording lobby={ended({ ...READY, status: 'processing' }, { editor: true })} />);
    expect(screen.getByText(COPY.processing)).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(mocks.polling.at(-1)).toBe(true);
  });

  it('says plainly when it failed, never started, was interrupted, or never happened', () => {
    const { rerender } = render(<EndedCallRecording lobby={ended({ ...READY, status: 'failed' }, { editor: true })} />);
    expect(screen.getByText(COPY.failed)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <EndedCallRecording lobby={ended({ ...READY, status: 'failed', end_reason: 'start_failed' }, { editor: true })} />
    );
    expect(screen.getByText(COPY.neverStarted)).toBeInTheDocument();
    rerender(<EndedCallRecording lobby={ended({ ...READY, end_reason: 'interrupted' }, { editor: true })} />);
    expect(screen.getByText(COPY.interrupted)).toBeInTheDocument();
    rerender(<EndedCallRecording lobby={ended({ ...READY, status: 'off' }, { editor: true })} />);
    expect(screen.getByText(COPY.none)).toBeInTheDocument();
  });
});
