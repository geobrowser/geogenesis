import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';
import { GeoChatRequestError } from '~/core/debates/api';
import type { DebateMoment } from '~/core/debates/moments-player/debate-moments';
import type { MomentsPlayerPosition } from '~/core/debates/moments-player/debate-moments-player';

import { BestDebateDisplaysContext, BestDebateWatchContext } from './best-debate-row';
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
  isMediaAdmin: true,
  isPhone: false,
  toast: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.toast] }));
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
      {headerActions !== undefined ? <div data-testid="header-actions">{headerActions}</div> : null}
      {children}
    </div>
  ),
}));
// GEO-3742's "…": a media admin on desktop by default, so the menu is there; its watcher stays idle.
vi.mock('~/core/debates/moments-editor/hooks', () => ({ useIsMediaAdmin: () => mocks.isMediaAdmin }));
vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.isPhone }));
vi.mock('./edit-moments', () => ({
  debateUuid: (id: string) => id,
  DebateWatchMenu: ({
    entityId,
    canEditMoments,
    onCopyLink,
    onEditMoments,
  }: {
    entityId: string;
    canEditMoments: boolean;
    onCopyLink: () => void;
    onEditMoments: (id: string) => void;
  }) => (
    <>
      <button type="button" onClick={onCopyLink}>
        Copy link
      </button>
      {canEditMoments ? (
        <button type="button" onClick={() => onEditMoments(entityId)}>
          Edit moments
        </button>
      ) : null}
    </>
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
  mocks.isMediaAdmin = true;
  mocks.isPhone = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Opener({ entry, entityId }: { entry: 'row' | 'poster'; entityId: string }) {
  const watch = React.useContext(BestDebateWatchContext);
  return (
    <button type="button" onClick={() => watch?.(entityId, entry)}>
      open
    </button>
  );
}

function openWatch(
  entry: 'row' | 'poster' = 'row',
  displays?: ReadonlyMap<string, BestDebateRowData>,
  entityId = 'd1'
) {
  const provider = (
    <BestDebateWatchProvider source="best_debates_ranking" blockId="block" spaceId="debates">
      <Opener entry={entry} entityId={entityId} />
    </BestDebateWatchProvider>
  );
  render(
    <JotaiProvider store={store}>
      {displays ? (
        <BestDebateDisplaysContext.Provider value={displays}>{provider}</BestDebateDisplaysContext.Provider>
      ) : (
        provider
      )}
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

  it('gives everyone the "…" with Copy link, and Edit moments only to a media admin on desktop (GEO-3809)', () => {
    for (const [isMediaAdmin, isPhone, editMoments] of [
      [true, false, true],
      [false, false, false],
      [true, true, false],
      [false, true, false],
    ]) {
      mocks.isMediaAdmin = isMediaAdmin;
      mocks.isPhone = isPhone;
      openWatch();
      const header = within(screen.getByTestId('header-actions'));
      expect(header.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
      expect(header.queryByRole('button', { name: 'Edit moments' }) !== null).toBe(editMoments);
      cleanup();
    }
    mocks.isMediaAdmin = true;
    mocks.isPhone = false;
  });
});

// GEO-3809: the popup copies the same link the Share sheet does, counted as the popup's.
describe('the watch popup’s Copy link', () => {
  let write: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  });
  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  const shareAction = () => mocks.capture.mock.calls.filter(([name]) => name === 'debate_share_action');
  // The share operation (`action_completed`) carries the surface; the link handoff needs a real id.
  const completed = () => mocks.capture.mock.calls.find(([name]) => name === 'action_completed')?.[1];
  const copy = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await act(async () => {});
  };

  it('copies the debates-app link, says so, and counts the share as the popup’s', async () => {
    openWatch();
    await copy();
    expect(write).toHaveBeenCalledTimes(1);
    const url = new URL(write.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe('https://debates.geobrowser.io/debate/d1');
    expect(mocks.toast.mock.calls[0][0].props.children).toBe('Link copied!');
    // Before the debate's entity loads, the block's space stands in for the required space_id.
    expect(shareAction()).toEqual([
      [
        'debate_share_action',
        {
          surface: 'best_debates_ranking',
          block_id: 'block',
          debate_id: 'd1',
          space_id: 'debates',
          method: 'copy_link',
        },
      ],
    ]);
    expect(completed()).toMatchObject({
      action_kind: 'share',
      component: 'best_debates_watch',
      target_id: 'd1',
      outcome: 'succeeded',
    });
  });

  it.each([
    ['its space, once named', { id: 'named-space', name: 'Politics', image: null }, 'named-space'],
    ['its own space id while the space’s name loads', null, 'own-space'],
  ] as const)('counts the share for the debate’s space: %s', async (_, space, expected) => {
    const display = { space, ownSpaceId: 'own-space', debaterSpaceIds: ['p1', 'p2'] } as unknown as BestDebateRowData;
    openWatch('row', new Map([['d1', display]]));
    await copy();
    expect(shareAction()[0][1]).toMatchObject({ space_id: expected });
  });

  it('hands the debaters over, so a debater copying their own debate is counted as one', async () => {
    const debate = '11111111111141118111111111111111';
    const debater = '22222222222242228222222222222222';
    window.lytics = {
      getContext: () => ({ is_identified: true }),
      getIdentity: () => ({ personal_space_id: debater }),
    };
    try {
      const display = {
        space: null,
        ownSpaceId: 'own-space',
        debaterSpaceIds: [debater],
      } as unknown as BestDebateRowData;
      openWatch('row', new Map([[debate, display]]), debate);
      await copy();
      expect(
        mocks.capture.mock.calls.filter(([name]) => name === 'share_link_handoff').map(([, props]) => props)
      ).toEqual([
        expect.objectContaining({ component: 'best_debates_watch', handoff_kind: 'copied', sharer_role: 'debater' }),
      ]);
    } finally {
      delete window.lytics;
    }
  });

  it('says it could not copy when the clipboard refuses, and counts no share', async () => {
    write.mockRejectedValue(new Error('denied'));
    openWatch();
    await copy();
    expect(mocks.toast.mock.calls[0][0].props.children).toBe('Could not copy link.');
    expect(shareAction()).toEqual([]);
  });
});
