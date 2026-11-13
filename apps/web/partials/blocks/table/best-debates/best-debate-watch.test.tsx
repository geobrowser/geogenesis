import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';
import type { DebateMoment } from '~/core/debates/moments-player/debate-moments';
import type { MomentsPlayerPosition } from '~/core/debates/moments-player/debate-moments-player';

import { BestDebateWatchContext } from './best-debate-row';
import { BestDebateWatchProvider } from './best-debate-watch';

type PlayerProps = {
  debateId: string;
  playbackRate?: number;
  onPosition?: (position: MomentsPlayerPosition) => void;
  onModeChange?: (mode: 'moments' | 'full') => void;
  controllerRef?: React.Ref<unknown>;
};

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  playMomentAt: vi.fn(),
  playFullAt: vi.fn(),
  refetch: vi.fn(),
  player: null as PlayerProps | null,
  reel: { status: 'ready', moments: [] as unknown[], slotNames: {} } as {
    status: 'loading' | 'ready' | 'error';
    moments: unknown[];
    slotNames: Record<number, string>;
  },
  transcript: {} as Record<string, unknown>,
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/debates/moments-player/debate-moments-player', async () => {
  const ReactModule = await import('react');
  return {
    DebateMomentsPlayer: (props: PlayerProps) => {
      mocks.player = props;
      ReactModule.useImperativeHandle(props.controllerRef, () => ({
        playMomentAt: mocks.playMomentAt,
        playFullAt: mocks.playFullAt,
      }));
      return <p>playing {props.debateId}</p>;
    },
  };
});
vi.mock('~/core/debates/moments-player/use-moments-speakers', () => ({ useMomentsSpeakers: () => null }));
vi.mock('~/core/debates/moments-player/use-debate-moments', () => ({ useDebateMoments: () => mocks.reel }));
vi.mock('~/core/debates/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/hooks')>()),
  useDebateTranscript: () => mocks.transcript,
}));
vi.mock('./ranking-flow-dialog', () => ({
  RankingFlowDialog: ({ children, headerActions }: { children: React.ReactNode; headerActions?: React.ReactNode }) => (
    <div>
      {headerActions}
      {children}
    </div>
  ),
}));
// GEO-3742's "…": a media admin by default, so the menu is there; its watcher stays idle.
vi.mock('./edit-moments', () => ({
  EditMomentsMenu: ({ entityId, onOpen }: { entityId: string; onOpen: (id: string) => void }) => (
    <button type="button" onClick={() => onOpen(entityId)}>
      Edit moments
    </button>
  ),
  ReelRenderWatcher: ({ entityId }: { entityId: string }) => <span data-testid={`reel-watcher-${entityId}`} />,
  captureEditMoments: (event: Record<string, unknown>) =>
    mocks.capture('element_clicked', { ...event, element_action: 'edit_moments' }),
}));

function moment(i: number, slot: 1 | 2, cues: [number, string][]): DebateMoment {
  return {
    id: `clip-${i}`,
    momentIndex: i,
    claimIndex: 0,
    claimText: null,
    participantSlot: slot,
    clipUrl: `https://chat.test/clip-${i}`,
    durationMs: 10_000,
    debateStartMs: 100_000 * (i + 1),
    debateEndMs: 100_000 * (i + 1) + 9_000,
    cutStartMs: 100_000 * (i + 1),
    cutEndMs: 100_000 * (i + 1) + 10_000,
    captions: cues.map(([startMs, text]) => ({ startMs, endMs: startMs + 1_000, text })),
  };
}

const REEL = [
  moment(0, 1, [
    [0, 'Every city that closed its centre'],
    [2_000, 'saw footfall go up.'],
  ]),
  moment(1, 2, [
    [0, 'Footfall isn’t the problem.'],
    [1_500, 'It’s the vans.'],
  ]),
];

const segment = (start: number, slot: 1 | 2, text: string) => ({
  id: `s${start}`,
  participant_slot: slot,
  position: slot === 1,
  position_label: '',
  sequence_index: 0,
  start_ms: start,
  end_ms: start + 1_000,
  text,
  metadata: {},
  created_at: '',
});

const TRANSCRIPT = {
  format: 'json',
  model_id: 'm',
  segments: [segment(5_000, 1, 'I want to start with the evidence.'), segment(9_000, 2, 'Thanks, Maya.')],
  sentences: [],
};

const EVENT = { source: 'best_debates_ranking', entity_id: 'd1', block_id: 'block', space_id: 'debates' };

let store = createStore();

beforeEach(() => {
  window.localStorage.removeItem('bestDebatesWatchSpeed');
  store = createStore();
  mocks.player = null;
  mocks.reel = { status: 'ready', moments: REEL, slotNames: { 1: 'Maya Chen', 2: 'Tom Okafor' } };
  mocks.transcript = { data: TRANSCRIPT, isPending: false, isError: false, error: null, refetch: mocks.refetch };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Opener({ entry }: { entry: 'row' | 'poster' }) {
  const watch = React.useContext(BestDebateWatchContext);
  return (
    <button type="button" onClick={() => watch?.('d1', entry)}>
      open
    </button>
  );
}

function openWatch(entry: 'row' | 'poster' = 'row') {
  render(
    <JotaiProvider store={store}>
      <BestDebateWatchProvider source="best_debates_ranking" blockId="block" spaceId="debates">
        <Opener entry={entry} />
      </BestDebateWatchProvider>
    </JotaiProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
}

const lines = () => within(screen.getByTestId('watch-transcript-lines'));
const report = (position: Partial<MomentsPlayerPosition>) =>
  act(() => mocks.player?.onPosition?.({ mode: 'moments', index: 0, clipMs: 0, fullMs: 0, ...position }));

// A watch is the row's main action on the ranking screen (13 Nov), so each one is counted, with
// where it was opened from.
describe('BestDebateWatchProvider', () => {
  it.each([
    ['row', 'row'],
    ['poster', 'poster'],
  ] as const)('records a watch opened from %s and opens the debate', (entry, recorded) => {
    openWatch(entry);
    expect(mocks.capture).toHaveBeenCalledWith('element_clicked', {
      source: 'best_debates_ranking',
      element_action: 'watch_debate',
      entity_id: 'd1',
      entry: recorded,
      block_id: 'block',
      space_id: 'debates',
    });
    expect(screen.getByText('playing d1')).toBeTruthy();
  });
});

// GEO-3728: the transcript beside the player, and its speed.
describe('the watch popup’s transcript', () => {
  it('shows only the moment playing, with who said it, and moves with the reel', () => {
    openWatch();
    report({ index: 0, clipMs: 2_100 });
    expect(lines().getByText('Maya Chen')).toBeInTheDocument();
    expect(lines().getByText('Moment 1 of 2')).toBeInTheDocument();
    expect(lines().queryByText('Footfall isn’t the problem.')).not.toBeInTheDocument();
    expect(lines().getByRole('button', { name: 'saw footfall go up.' })).toHaveAttribute('aria-current', 'true');

    report({ index: 1, clipMs: 200 });
    expect(lines().getByText('Tom Okafor')).toBeInTheDocument();
    expect(lines().getByText('Moment 2 of 2')).toBeInTheDocument();
    expect(lines().queryByText('saw footfall go up.')).not.toBeInTheDocument();
    expect(lines().getByRole('button', { name: 'Footfall isn’t the problem.' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    // Not yet spoken: grey.
    expect(lines().getByRole('button', { name: 'It’s the vans.' }).className).toContain('text-grey-04');
  });

  it('plays a moment line from its point in the clip, and steps to the other moments', () => {
    openWatch();
    report({ index: 1 });
    fireEvent.click(lines().getByRole('button', { name: 'It’s the vans.' }));
    expect(mocks.playMomentAt).toHaveBeenCalledWith(1, 1_500);
    expect(mocks.capture).toHaveBeenCalledWith('element_clicked', {
      ...EVENT,
      element_action: 'watch_transcript_jump',
      view: 'moments',
      moment_index: 1,
    });

    expect(lines().getByRole('button', { name: 'Next moment' })).toBeDisabled();
    fireEvent.click(lines().getByRole('button', { name: 'Previous moment' }));
    expect(mocks.playMomentAt).toHaveBeenLastCalledWith(0, 0);
    expect(mocks.capture).toHaveBeenCalledWith('element_clicked', {
      ...EVENT,
      element_action: 'watch_transcript_moment',
      moment_index: 0,
    });
  });

  it('switches to the full debate’s transcript and back, and plays the full debate from a line', () => {
    openWatch();
    fireEvent.click(screen.getByRole('radio', { name: 'Full debate' }));
    expect(mocks.capture).toHaveBeenCalledWith('element_changed', {
      ...EVENT,
      element: 'watch_transcript_view',
      value: 'full',
      previous_value: 'moments',
    });
    expect(lines().getByText('0:05')).toBeInTheDocument();
    fireEvent.click(lines().getByRole('button', { name: 'Thanks, Maya.' }));
    expect(mocks.playFullAt).toHaveBeenCalledWith(9_000);
    expect(mocks.capture).toHaveBeenCalledWith('element_clicked', {
      ...EVENT,
      element_action: 'watch_transcript_jump',
      view: 'full',
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Moments' }));
    expect(lines().getByText('Moment 1 of 2')).toBeInTheDocument();
  });

  it('moves the player with the transcript’s switch, the one switch in the popup (GEO-3729)', () => {
    openWatch();
    mocks.playFullAt.mockClear();
    mocks.playMomentAt.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: 'Full debate' }));
    expect(mocks.playFullAt).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Moments' }));
    expect(mocks.playMomentAt).toHaveBeenCalledWith(0, 0);
  });

  it('follows the player into the full debate, highlighting where it plays', () => {
    openWatch();
    act(() => mocks.player?.onModeChange?.('full'));
    expect(screen.getByRole('radio', { name: 'Full debate' })).toHaveAttribute('aria-checked', 'true');
    report({ mode: 'full', fullMs: 9_500 });
    expect(lines().getByRole('button', { name: 'Thanks, Maya.' })).toHaveAttribute('aria-current', 'true');
    // Following the player isn't the ranker's choice: not counted.
    expect(mocks.capture).not.toHaveBeenCalledWith('element_changed', expect.anything());
  });

  it('offers only the full debate when there is no reel', () => {
    mocks.reel = { status: 'ready', moments: [], slotNames: {} };
    openWatch();
    expect(screen.queryByRole('radio', { name: 'Moments' })).not.toBeInTheDocument();
    expect(lines().getByRole('button', { name: 'Thanks, Maya.' })).toBeInTheDocument();
  });

  it('says the transcript isn’t available when there is none, and the video still plays', () => {
    mocks.transcript = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new GeoChatRequestError('not found', 'debate_not_found', 404),
      refetch: mocks.refetch,
    };
    openWatch();
    fireEvent.click(screen.getByRole('radio', { name: 'Full debate' }));
    expect(lines().getByText('Transcript isn’t available for this debate.')).toBeInTheDocument();
    expect(lines().queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByText('playing d1')).toBeInTheDocument();
  });

  it('offers a retry when the transcript failed to load', () => {
    mocks.transcript = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new GeoChatRequestError('busy', null, 503),
      refetch: mocks.refetch,
    };
    openWatch();
    fireEvent.click(screen.getByRole('radio', { name: 'Full debate' }));
    fireEvent.click(lines().getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('says so for a reel whose clips have no captions', () => {
    mocks.reel = { status: 'ready', moments: [moment(0, 1, [])], slotNames: {} };
    openWatch();
    expect(lines().getByText('Transcript isn’t available for this debate.')).toBeInTheDocument();
  });

  it('shows the loading line while the transcript is read', () => {
    mocks.transcript = { data: undefined, isPending: true, isError: false, error: null, refetch: mocks.refetch };
    openWatch();
    fireEvent.click(screen.getByRole('radio', { name: 'Full debate' }));
    expect(lines().getByText('Loading transcript…')).toBeInTheDocument();
  });
});

describe('the watch popup’s speed', () => {
  it('plays at 1x until the ranker picks another, then remembers it for the next popup', () => {
    openWatch();
    expect(mocks.player?.playbackRate).toBe(1);
    fireEvent.click(screen.getByRole('radio', { name: '2x' }));
    expect(mocks.player?.playbackRate).toBe(2);
    expect(mocks.capture).toHaveBeenCalledWith('element_changed', {
      ...EVENT,
      element: 'watch_playback_speed',
      value: '2',
      previous_value: '1',
    });
    expect(window.localStorage.getItem('bestDebatesWatchSpeed')).toBe('"2"');

    cleanup();
    store = createStore();
    openWatch();
    expect(mocks.player?.playbackRate).toBe(2);
    expect(screen.getByRole('radio', { name: '2x' })).toHaveAttribute('aria-checked', 'true');
  });

  it('plays at 1x when what is stored isn’t a speed it offers', () => {
    window.localStorage.setItem('bestDebatesWatchSpeed', '"3"');
    openWatch();
    expect(mocks.player?.playbackRate).toBe(1);
    expect(screen.getByRole('radio', { name: '1x' })).toHaveAttribute('aria-checked', 'true');
  });

  it('offers Edit moments in its header, counts the open, and follows the debate’s new reel (GEO-3742)', () => {
    openWatch();
    fireEvent.click(screen.getByRole('button', { name: 'Edit moments' }));
    expect(mocks.capture).toHaveBeenCalledWith('element_clicked', { ...EVENT, element_action: 'edit_moments' });
    expect(screen.getByTestId('reel-watcher-d1')).toBeInTheDocument();
  });
});
