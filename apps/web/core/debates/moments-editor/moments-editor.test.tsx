import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { getDefaultStore } from 'jotai';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import type { DebateFeedPlayerHandle } from '../browse/debate-feed-player';
import { inlinePlaybackUnavailableAtom } from '../browse/inline-playback';
import { RENDERED_TURN_SEGMENTS } from '../open-rounds-media-fixtures';
import type { MomentBackfillEntry, MomentBackfillStatus } from './api';
import {
  EXTRA_CLIP_TOOLTIP,
  MomentsEditor,
  RESTORE_FAILED_EDIT_LABEL,
  claimsBySpeaker,
  editingBlockedReason,
  keepClaimWithSpeaker,
} from './moments-editor';
import { playerWords } from './reel';
import { SELECTION_SETTLE_MS, transcriptRenderCount } from './reel-transcript';

const DEBATE_ID = '01a0448a-61d3-7101-8434-a20fdadf6f97';

let wordsOverride: unknown[] | null = null;
/** The transcript's `sentences`, served only when a test sets them. */
let sentencesOverride: unknown[] | null = null;

/** The player's props as last rendered, and the controls it hands the editor (GEO-3773). */
const playerMocks = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  handle: {
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    jumpTo: vi.fn((_ms: number): 'held' | 'seeked' => 'seeked'),
    livePositionMs: vi.fn((): number | null => null),
    endMs: vi.fn((): number | null => null),
    unmute: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  backfill: {} as { isPending: boolean; error: unknown; data: { request: unknown; entry: unknown } | undefined },
  plan: {} as { isSuccess: boolean; data: unknown; error: unknown },
  mutate: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  /** The claims payload's `moment_reel_manual`: the reel's lock, whoever published it. */
  manualReel: false,
  /** The transcript read failed before it ever answered. */
  transcriptFailed: false,
  /** Where the player says its playhead is, or `null` before it reports one. */
  playheadSeconds: null as number | null,
  /** The claims hold a retained claim of Susan's (index 2), as a re-extraction keeps a published one. */
  retainedClaim: false,
  /** The media's turn segments: the map from the video's clock onto the player's. */
  turns: [] as unknown[],
  /** The transcript's `word_timing`. */
  wordTiming: true,
  /** What the waveform's peaks read says (GEO-3673). */
  peaks: { kind: 'loading' } as unknown,
}));

const DEFAULT_WORDS = [
  { participant_slot: 1, start_ms: 1_000, end_ms: 1_400, text: 'Coffee' },
  { participant_slot: 1, start_ms: 1_500, end_ms: 2_900, text: 'dates' },
  { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
];
/** The transcript as a query serves it: the same object until what it holds changes. */
let servedTranscript: { key: unknown[]; data: unknown } | null = null;
function transcriptData() {
  const key = [mocks.wordTiming, wordsOverride, sentencesOverride];
  if (!servedTranscript || key.some((part, at) => part !== servedTranscript!.key[at])) {
    servedTranscript = {
      key,
      data: {
        word_timing: mocks.wordTiming,
        words: wordsOverride ?? DEFAULT_WORDS,
        ...(sentencesOverride && { sentences: sentencesOverride }),
      },
    };
  }
  return servedTranscript.data;
}

vi.mock('../hooks', () => ({
  useDebateTranscript: () =>
    mocks.transcriptFailed
      ? { isPending: false, data: undefined, error: new Error('down') }
      : { isPending: false, data: transcriptData() },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'a', getPrivyIdentityToken: async () => 't' }),
  useDebate: () => ({
    data: {
      id: DEBATE_ID,
      claim: { claim: 'A coffee date is an acceptable first date', space_id: 's' },
      participants: [
        { participant_slot: 1, display_name: 'Susan Winter' },
        { participant_slot: 2, display_name: 'Urban' },
      ],
    },
  }),
  useDebateMedia: () => ({ isSuccess: true, data: { turn_segments: mocks.turns } }),
  useDebateExtractedClaims: () => ({
    isSuccess: true,
    data: {
      payload: {
        turns: [
          { turn_index: 0, participant_slot: 1 },
          { turn_index: 1, participant_slot: 2 },
        ],
        claims: [
          { text: 'Coffee is low stakes', turn_index: 0 },
          { text: 'Dinner shows effort', turn_index: 1 },
          ...(mocks.retainedClaim ? [{ text: 'Coffee was the plan', turn_index: 0, retained: true }] : []),
        ],
        moments: [{ claim_index: 0, clip_start_ms: 1_000, clip_end_ms: 3_000 }],
        ...(mocks.manualReel && { moment_reel_manual: true }),
      },
    },
  }),
}));

vi.mock('./hooks', () => ({
  isMediaAdminRefusal: (error: unknown) => error instanceof GeoChatRequestError && error.status === 403,
  useAudioPeaks: () => mocks.peaks,
  useMomentBackfill: () => mocks.backfill,
  useMomentReelPlan: () => mocks.plan,
  useQueueMomentReel: () => ({ mutate: mocks.mutate, isPending: false }),
  useRefreshAfterReel: () => mocks.refresh,
}));

vi.mock('../browse/debate-feed-player', () => ({
  DebateFeedPlayer: (props: {
    onPlayheadChange?: (seconds: number) => void;
    ref?: React.Ref<DebateFeedPlayerHandle>;
  }) => {
    const { onPlayheadChange, ref } = props;
    playerMocks.props = props as unknown as Record<string, unknown>;
    React.useImperativeHandle(ref, () => playerMocks.handle, []);
    React.useEffect(() => {
      if (mocks.playheadSeconds !== null) onPlayheadChange?.(mocks.playheadSeconds);
    }, [onPlayheadChange]);
    return <div data-testid="player" />;
  },
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.toast] }));

const entry = (overrides: Partial<MomentBackfillEntry> = {}): MomentBackfillEntry => ({
  debate_id: DEBATE_ID,
  refusal: null,
  path: 'stored',
  claims: 2,
  timed_claims: 2,
  reel_version: 'v1',
  hand_picked: null,
  queued: false,
  request: null,
  ...overrides,
});

const status = (overrides: Partial<MomentBackfillStatus>): MomentBackfillStatus => ({
  debate_id: DEBATE_ID,
  status: 'queued',
  requested_by: 'space',
  reason: 'r',
  requested_at: '2026-11-11T20:00:00Z',
  recut: true,
  preview: false,
  outcome: null,
  report: null,
  last_error: null,
  completed_at: null,
  ...overrides,
});

// The editor's controls (GEO-3773): the reel strip's cards, the selected clip's panel under the
// player, its Advanced popover, the header's Publish and ⋯ menu.

/** Clip `n`'s card in the reel strip: a button, or a group with its claim once it is selected. */
function card(n: number) {
  const reel = within(screen.getByRole('region', { name: 'Reel' }));
  const name = new RegExp(`^Clip ${n}, `);
  return reel.queryByRole('group', { name }) ?? reel.getByRole('button', { name });
}
/** Selects clip `n` from its card (nothing to do when it is selected already). */
function selectClip(n: number) {
  const button = within(screen.getByRole('region', { name: 'Reel' })).queryByRole('button', {
    name: new RegExp(`^Clip ${n}, `),
  });
  if (button) fireEvent.click(button);
}
/** Whether clip `n` is the selected clip (its card holds its claim). */
const isSelected = (n: number) => card(n).getAttribute('role') === 'group';
/** Whether clip `n`'s card says it can't be published. */
const cantPublish = (n: number) => within(card(n)).queryByRole('img', { name: 'Can’t publish' }) !== null;
/** Back to the full debate from the selected clip's panel. */
const deselect = () => fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Full debate' }));
/** The selected clip's panel under the player. */
const clipPanel = () => screen.getByRole('region', { name: /^Clip \d+, / });
/** The selected clip's Start or End time, in its Advanced popover (opened if it isn't). */
function edgeField(edge: 'Start' | 'End') {
  if (!screen.queryByRole('dialog', { name: 'Advanced' })) {
    fireEvent.click(within(clipPanel()).getByRole('button', { name: /^Advanced/ }));
  }
  return screen.getByRole('textbox', { name: `${edge} time` });
}
/** Types a time into the selected clip's edge (selecting clip `clip` first, when given). */
function typeEdge(edge: 'Start' | 'End', value: string, clip?: number) {
  if (clip !== undefined) selectClip(clip);
  const field = edgeField(edge);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
/** Selects transcript words `from` to `to` (indexes) with the pointer, and lets go. */
function selectWords(from: number, to: number) {
  const root = screen.getByTestId('reel-transcript');
  const word = (index: number) => root.querySelector<HTMLElement>(`[data-word="${index}"]`)!.firstChild!;
  fireEvent.pointerDown(root);
  const range = document.createRange();
  range.setStart(word(from), 0);
  range.setEnd(word(to), word(to).textContent!.length);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent.pointerUp(document);
}
/** The header's Publish, which opens its confirm. */
const publishButton = () =>
  screen.getAllByRole('button', { name: 'Publish' }).find(button => !button.closest('[role="alertdialog"]'))!;
/** Publishes through the confirm: "Publish", or "Publish anyway" while a warning is open. */
function publish() {
  fireEvent.click(publishButton());
  const confirm = screen.getByRole('alertdialog', { name: 'Publish this reel?' });
  fireEvent.click(within(confirm).getByRole('button', { name: /^Publish( anyway)?$/ }));
}
/** The ⋯ menu's item (opening the menu). */
function menuItem(name: string | RegExp) {
  if (!screen.queryByRole('menu', { name: 'Reel options' })) {
    fireEvent.click(screen.getByRole('button', { name: 'Reel options' }));
  }
  return within(screen.getByRole('menu', { name: 'Reel options' })).getByRole('menuitem', { name });
}
/** The ⋯ menu's warning count. */
function warningCount() {
  const count = menuItem(/^All warnings/).textContent?.replace('All warnings', '');
  fireEvent.click(screen.getByRole('button', { name: 'Reel options' }));
  return Number(count);
}
/** Whether the selected clip can't be changed: Remove is off and Advanced opens no edges. */
function clipLocked() {
  const removeOff = within(clipPanel()).getByRole('button', { name: 'Remove' }).hasAttribute('disabled');
  fireEvent.click(within(clipPanel()).getByRole('button', { name: /^Advanced/ }));
  return removeOff && screen.queryByRole('textbox', { name: 'End time' }) === null;
}
/** Picks clip `n`'s claim from its card (the menu, or the claim panel for a clip that can't publish). */
function pickClaim(n: number, label: string) {
  selectClip(n);
  fireEvent.click(within(card(n)).getByRole('button', { name: /^Claim: / }));
  fireEvent.click(claimOption(label));
}
/** A claim in the open claim menu or panel, by its text (a "Live now" tag may follow it). */
const claimOption = (label: string) =>
  screen.getByRole('option', { name: (name: string) => name.replace(/ ?Live now$/, '') === label });
/** The claim marked as clip `n`'s in its menu (the menu is closed again after). */
function markedClaim(n: number) {
  selectClip(n);
  const button = within(card(n)).getByRole('button', { name: /^Claim: / });
  fireEvent.click(button);
  const marked = screen.getAllByRole('option').find(option => option.getAttribute('aria-selected') === 'true');
  fireEvent.click(button);
  return marked?.textContent ?? null;
}

beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  mocks.backfill = { isPending: false, error: null, data: { request: null, entry: null } };
  mocks.plan = { isSuccess: true, data: entry(), error: null };
  mocks.mutate.mockReset();
  wordsOverride = null;
  sentencesOverride = null;
  mocks.refresh.mockReset();
  mocks.manualReel = false;
  mocks.transcriptFailed = false;
  mocks.playheadSeconds = null;
  mocks.retainedClaim = false;
  mocks.turns = [];
  mocks.wordTiming = true;
  mocks.peaks = { kind: 'loading' };
  playerMocks.props = {};
  for (const control of Object.values(playerMocks.handle)) control.mockClear();
});
afterEach(cleanup);

describe('MomentsEditor (GEO-3671)', () => {
  it('shows nothing of the editor to someone geo-chat refuses as a media admin', () => {
    mocks.backfill = {
      isPending: false,
      error: new GeoChatRequestError('no', 'media_admin_required', 403),
      data: undefined,
    };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText("Only media admins can edit a debate's moments.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('opens on the live cuts when geo-chat serves them, on the player’s clock', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(edgeField('Start')).toHaveValue('0:00.9');
    deselect();
    expect(within(card(1)).getByText('Coffee dates')).toBeInTheDocument();
    expect(card(1)).toHaveAccessibleName(/^Clip 1, Susan Winter/);
    expect(screen.queryByText('Times approximate')).not.toBeInTheDocument();
  });

  it('falls back to the served moments with a note that their times are approximate', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Times approximate')).toBeInTheDocument();
    expect(edgeField('Start')).toHaveValue('0:01.0');
  });

  it('is read-only, and says why, when the dry run refuses the debate', () => {
    mocks.plan.data = entry({ refusal: 'media_job_active' });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/still being processed/);
    expect(menuItem('Check before publishing')).toBeDisabled();
    // Nothing about the clip can be changed: its edges, steppers, Replace and Remove.
    for (const name of ['Replace', 'Remove', 'Start one word earlier', 'End one word later']) {
      expect(within(clipPanel()).getByRole('button', { name })).toBeDisabled();
    }
    fireEvent.click(within(clipPanel()).getByRole('button', { name: /^Advanced/ }));
    expect(screen.queryByRole('textbox', { name: 'Start time' })).not.toBeInTheDocument();
  });

  it('never says the reel is live while it is only queued', () => {
    mocks.backfill.data = { request: status({ status: 'queued' }), entry: null };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Queued · live reel unchanged')).toBeInTheDocument();
    expect(screen.queryByText(/is live/)).not.toBeInTheDocument();
    expect(menuItem('Check before publishing')).toBeDisabled();
  });

  it('publishes on the player’s clock, from the version it opened on, keeping the claim the clip plays for', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    // 1.45 s is in silence after "Coffee", so it stays.
    expect(edgeField('End')).toHaveValue('0:01.5');
    fireEvent.click(publishButton());
    // One clip, so a warning is still open: it never blocks the publish.
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        preview: false,
        reason: 'Moments editor: hand-picked reel',
        reel: { clock: 'player', clips: [{ start: 1, end: 1.45, claim_index: 0 }], base: 'v1' },
      },
      expect.any(Object)
    );
  });

  // The worker's `clip N` counts in the reel as sent. A clip removed after the publish failed must
  // not hand its neighbour's problem to the clip that took its place.
  it('keeps a failed publish’s clip problem on that clip after an earlier clip is removed', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45', 1);
    publish();

    mocks.backfill.data = {
      request: status({
        requested_at: requestedAt,
        status: 'skipped',
        outcome: 'manual_reel_invalid',
        report: { story_failed: 'clip 2: no words are said in it' },
      }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect([cantPublish(1), cantPublish(2)]).toEqual([false, true]);
    // The banner's link opens the clip's claim panel, which says what is wrong.
    fireEvent.click(screen.getByRole('button', { name: 'See clip 2.' }));
    expect(
      within(screen.getByRole('complementary', { name: 'Clip claim' })).getByText('No words are said in it.')
    ).toBeInTheDocument();

    selectClip(1);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
    expect(card(1)).toHaveAccessibleName(/^Clip 1, Urban/);
    expect(cantPublish(1)).toBe(true);
    // The notice numbers it as the reel does now.
    expect(screen.getByRole('button', { name: 'See clip 1.' })).toBeInTheDocument();
  });

  // GEO-3705: a problem the worker reported holds only for the clip as it was sent. Fixing the clip
  // (its claim, an edge) clears it, so the reel can be published again without a reload.
  describe('after a failed publish', () => {
    const failPublish = () => {
      mocks.plan.data = entry({
        live_reel: {
          clock: 'video',
          clips: [
            { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
            { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
          ],
        },
      });
      const requestedAt = '2026-11-11T21:00:00Z';
      mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
        options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt }) })
      );
      const view = render(<MomentsEditor debateId={DEBATE_ID} />);
      typeEdge('End', '1.45', 1);
      publish();

      mocks.backfill.data = {
        request: status({
          requested_at: requestedAt,
          status: 'skipped',
          outcome: 'manual_reel_invalid',
          report: {
            story_failed:
              'clip 1: its speaker has no claim to link it to; clip 2: its speaker has no claim to link it to',
          },
        }),
        entry: null,
      };
      view.rerender(<MomentsEditor debateId={DEBATE_ID} />);
      expect([cantPublish(1), cantPublish(2)]).toEqual([true, true]);
      expect(screen.getByRole('button', { name: 'See clips 1, 2.' })).toBeInTheDocument();
      expect(publishButton()).toBeDisabled();
    };
    const claimPanel = () => screen.getByRole('complementary', { name: 'Clip claim' });

    it('clears a clip’s reported problem once its claim is changed, and keeps the untouched clip’s', () => {
      failPublish();
      // A clip that can't publish opens its claim panel, which says why, rather than the menu.
      selectClip(1);
      fireEvent.click(within(card(1)).getByRole('button', { name: /^Claim: / }));
      expect(within(claimPanel()).getByText('Its speaker has no claim to link it to.')).toBeInTheDocument();
      fireEvent.click(within(claimPanel()).getByRole('option', { name: 'Closest claim (automatic)' }));

      expect(cantPublish(1)).toBe(false);
      // The clip left alone still blocks, and is the only one the notice points at.
      expect(cantPublish(2)).toBe(true);
      expect(screen.getByRole('button', { name: 'See clip 2.' })).toBeInTheDocument();
      expect(screen.queryByText(/See clips/)).not.toBeInTheDocument();
      expect(publishButton()).toBeDisabled();
    });

    it('lets the reel be published again once every flagged clip is changed', () => {
      failPublish();
      pickClaim(1, 'Closest claim (automatic)');
      typeEdge('End', '5.5', 2);

      expect([cantPublish(1), cantPublish(2)]).toEqual([false, false]);
      expect(screen.queryByText(/See clip/)).not.toBeInTheDocument();
      expect(publishButton()).toBeEnabled();
    });

    it('flags a changed clip again once it is changed back to what was sent', () => {
      failPublish();
      pickClaim(1, 'Closest claim (automatic)');
      pickClaim(1, 'Coffee is low stakes');

      expect(cantPublish(1)).toBe(true);
      expect(screen.getByRole('button', { name: 'See clips 1, 2.' })).toBeInTheDocument();
    });
  });

  // Once the reel this visit published is live, the edit is no longer unsaved, and the editor opens
  // on the reel geo-chat now serves.
  it('moves on to the live reel once its own publish goes live', () => {
    const live = (start: number, end: number) => ({
      clock: 'video' as const,
      clips: [{ start_ms: start, end_ms: end, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
    });
    mocks.plan.data = entry({ live_reel: live(900, 3_000) });
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    fireEvent.click(publishButton());
    // One clip draws the clip-count warning.
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    mocks.backfill.data = { request: status({ requested_at: requestedAt, status: 'done' }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.plan = {
      ...mocks.plan,
      data: entry({
        reel_version: 'v2',
        hand_picked: { requested_by: 'space', requested_at: requestedAt },
        live_reel: live(900, 1_800),
      }),
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByText('Hand-picked · locked')).toBeInTheDocument();
    expect(edgeField('End')).toHaveValue('0:01.8');
    expect(publishButton()).toBeDisabled();
  });

  // A drag commits every move; one that passes over the other debater's words must not lose the
  // clip's claim once it is back on its own speaker.
  it('gives a dragged clip its claim back when the drag returns to its speaker', () => {
    mocks.peaks = { kind: 'ready', peaks: { bucketMs: 10, samples: new Uint8Array(600).fill(60), version: 'v1' } };
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectClip(2);
    expect(markedClaim(2)).toMatch(/^Dinner shows effort/);
    // Zoomed out to ±8 s, the waveform shows the whole debate (5.6 s: the last clip's end), a ms per px.
    fireEvent.click(within(clipPanel()).getByRole('button', { name: '±8 s' }));
    vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
      width: 5_600,
      left: 0,
    } as DOMRect);
    const handle = screen.getByTestId('fine-start-handle');
    fireEvent.pointerDown(handle, { clientX: 4_800, pointerId: 1 });
    // Over Susan's words: clip 2 is hers for now, so Urban's claim can't ride along.
    fireEvent.pointerMove(handle, { clientX: 1_300, pointerId: 1 });
    expect(card(2)).toHaveAccessibleName(/^Clip 2, Susan Winter/);
    expect(markedClaim(2)).toBe('Closest claim (automatic)');
    // Still hers on the next move: the claim the drag started with is judged again, not given back.
    fireEvent.pointerMove(handle, { clientX: 1_350, pointerId: 1 });
    expect(markedClaim(2)).toBe('Closest claim (automatic)');
    fireEvent.pointerMove(handle, { clientX: 4_800, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(card(2)).toHaveAccessibleName(/^Clip 2, Urban/);
    expect(markedClaim(2)).toMatch(/^Dinner shows effort/);
  });

  // GEO-3672 / GEO-3683: an edge placed with Alt is a time picked by ear. Without `exact`, geo-chat
  // would widen this one, 200 ms after "dates", out to 3.15 s. The live cuts it leaves alone are
  // already where geo-chat cut them, and go as they are.
  it('publishes an edge placed with Alt as exact, with the live cuts left where they are', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: '±8 s' }));
    // Clip 1 (0.9-3 s) at ±8 s: 0 to 5.6 s, a ms per px.
    vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
      width: 5_600,
      left: 0,
    } as DOMRect);
    const handle = screen.getByTestId('fine-end-handle');
    fireEvent.pointerDown(handle, { clientX: 3_000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 3_100, pointerId: 1, altKey: true });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(edgeField('End')).toHaveValue('0:03.1');

    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reel: {
          clock: 'player',
          clips: [
            { start: 0.9, end: 3.1, claim_index: 0 },
            { start: 4.8, end: 5.6, claim_index: 1 },
          ],
          exact: true,
          base: 'v1',
        },
      }),
      expect.any(Object)
    );
  });

  // GEO-3673: the fine-tune panel under the timeline places an edge to 10 ms with "Snap to words" off.
  it('publishes an edge placed in the waveform panel with snapping off as exact, to the hundredth', () => {
    mocks.peaks = {
      kind: 'ready',
      peaks: { bucketMs: 10, samples: new Uint8Array(600).fill(60), version: 'v1' },
    };
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const snap = screen.getByRole('switch', { name: 'Snap to words' });
    expect(snap).toBeChecked();
    expect(screen.getByTestId('waveform-readout')).toHaveTextContent('Start 0:00.90 · End 0:03.00');
    fireEvent.click(snap);
    // Clip 1 with 2 s either side: 0 to 5 s, a ms per px.
    vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
      width: 5_000,
      left: 0,
    } as DOMRect);
    const handle = screen.getByTestId('fine-end-handle');
    fireEvent.pointerDown(handle, { clientX: 3_000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 3_107, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.getByTestId('waveform-readout')).toHaveTextContent('Start 0:00.90 · End 0:03.11');

    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reel: {
          clock: 'player',
          clips: [
            { start: 0.9, end: 3.11, claim_index: 0 },
            { start: 4.8, end: 5.6, claim_index: 1 },
          ],
          exact: true,
          base: 'v1',
        },
      }),
      expect.any(Object)
    );
  });

  it.each([
    ['being built', { kind: 'waiting', message: 'Preparing the waveform… (waiting 0:41)' }],
    ['still waiting after ten minutes', { kind: 'gave-up', message: 'Still waiting for the media worker.' }],
    ['missing or failed', { kind: 'none', message: 'No waveform for this debate.' }],
  ])('opens and edits the same with the peaks %s', (_, view) => {
    mocks.peaks = view;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText(view.message)).toBeInTheDocument();
    vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
      width: 5_000,
      left: 0,
    } as DOMRect);
    // Served moment 1-3 s; Alt flips "Snap to words" off for the drag.
    const handle = screen.getByTestId('fine-end-handle');
    fireEvent.pointerDown(handle, { clientX: 3_000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 3_204, pointerId: 1, altKey: true });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.getByTestId('waveform-readout')).toHaveTextContent('End 0:03.20');
    expect(publishButton()).toBeEnabled();
  });

  // An earlier publish cut clip 1's end exactly, 100 ms after "dates" (2.9 s), where geo-chat's
  // widening would put it at 3.15 s. Changing another clip's claim must not widen it.
  it('keeps a live edge cut exactly where it is when another clip is changed', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 750, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_750, end_ms: 5_650, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('Start', '5.0', 2);

    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reel: {
          clock: 'player',
          clips: [
            { start: 0.75, end: 3, claim_index: 0 },
            // The moved start, on "Dinner", gets geo-chat's room as before.
            { start: 4.75, end: 5.65, claim_index: 1 },
          ],
          exact: true,
          base: 'v1',
        },
      }),
      expect.any(Object)
    );
  });

  // The reel moved on under the edit (another admin's publish, a worker re-apply). Publishing the
  // edit must still name the version it was made on, so geo-chat refuses it as `reel_changed`.
  // Nothing is edited while a request runs, so the edit is made before another admin's request starts.
  it('publishes an edit made before another request ran on the version it was made on', () => {
    const requestedAt = '2026-11-11T19:00:00Z';
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    mocks.backfill.data = { request: status({ status: 'running', requested_at: requestedAt }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    // The edit's tools are closed while it runs.
    expect(screen.queryByRole('textbox', { name: 'End time' })).not.toBeInTheDocument();
    expect(within(clipPanel()).getByRole('button', { name: 'Remove' })).toBeDisabled();

    mocks.backfill.data = { request: status({ status: 'done', requested_at: requestedAt }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.plan = { ...mocks.plan, data: entry({ reel_version: 'v2' }) };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ reel: expect.objectContaining({ base: 'v1' }) }),
      expect.any(Object)
    );
  });

  // An edit made after this visit's publish was sent sits on the reel that then goes live.
  it('makes an edit made after its own publish on the version that publish made', () => {
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    publish();
    typeEdge('Start', '0.5');

    mocks.backfill.data = { request: status({ requested_at: requestedAt, status: 'done' }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.plan = { ...mocks.plan, data: entry({ reel_version: 'v2' }) };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.mutate.mockReset();
    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ reel: expect.objectContaining({ base: 'v2' }) }),
      expect.any(Object)
    );
  });

  // geo-chat#352: the worker re-applies a hand-picked reel after a re-render, so the request is
  // never this visit's; that it no longer fits is said all the same.
  it('says when a re-render could not keep the hand-picked reel', () => {
    mocks.manualReel = true;
    mocks.backfill.data = {
      request: status({
        status: 'skipped',
        outcome: 'reel_no_longer_fits',
        manual_reel: { clock: 'video', clips: [], reapplied: { job_id: 'job', quotes: ['Coffee dates'] } },
        report: { story_failed: 'clip 1: its words are no longer said there' },
      }),
      entry: null,
    };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const notice = screen.getByText(/A re-render couldn.t keep this hand-picked reel/).closest('[role="alert"]');
    expect(notice).toHaveTextContent(/Pick its clips again/);
    expect(screen.getByText('Clip 1: its words are no longer said there')).toBeInTheDocument();
  });

  // A reel carried onto a re-render's claims plays from cuts on the old video's clock, and keeps the
  // mark after the worker's re-cut fails (geo-chat#352), so it is shown but not edited. Returning it
  // to automatic, which geo-chat takes on it, is how its clips get picked again.
  it('keeps a carried reel read-only, and offers Return to automatic as the way to re-pick it', () => {
    mocks.manualReel = true;
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        carried: true,
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    mocks.backfill.data = {
      request: status({
        status: 'skipped',
        outcome: 'reel_no_longer_fits',
        manual_reel: { clock: 'video', clips: [], reapplied: { job_id: 'job', quotes: ['Coffee dates'] } },
        report: { story_failed: 'clip 1: its speaker has no claim to link it to' },
      }),
      entry: null,
    };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(
      'This reel can’t be edited. A re-render carried it over and its clips are still cut on the old video. Return it to automatic to pick again.'
    );
    // Said once: the worker's lines list what it found, and leave the way out to the carried reel's.
    expect(screen.getAllByText(/return it to automatic/i)).toHaveLength(1);
    expect(screen.queryByText(/Pick its clips again/)).not.toBeInTheDocument();
    expect(within(banner).getByText('Clip 1: its speaker has no claim to link it to')).toBeInTheDocument();
    expect(within(clipPanel()).getByRole('button', { name: 'Remove' })).toBeDisabled();
    fireEvent.click(within(clipPanel()).getByRole('button', { name: /^Advanced/ }));
    expect(screen.queryByRole('textbox', { name: 'End time' })).not.toBeInTheDocument();
    expect(menuItem('Check before publishing')).toBeDisabled();

    fireEvent.click(within(banner).getByRole('button', { name: 'Return to automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and re-pick' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { unlock: true, story: true, reason: 'Moments editor: return to automatic', base: 'v1' },
      expect.any(Object)
    );
  });

  // geo-chat#352: right after a re-render the worker's own re-cut of a carried reel is queued. It may
  // well fit, so the editor waits on it rather than pointing at a Return to automatic it hides.
  it('waits on a carried reel’s queued re-cut, without pointing to Return to automatic', () => {
    mocks.manualReel = true;
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        carried: true,
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    mocks.backfill.data = {
      request: status({
        status: 'queued',
        manual_reel: { clock: 'video', clips: [], reapplied: { job_id: 'job', quotes: ['Coffee dates'] } },
      }),
      entry: null,
    };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This reel can’t be edited. A re-render carried it over and a request to cut it again is in the queue. This page updates when it’s done.'
    );
    expect(screen.queryByText(/return it to automatic/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();
  });

  // geo-chat#352 1fb7f11: a re-render that couldn't carry the reel leaves the debate locked with no
  // reel. The dry run returns the worker's refused re-submit too; the editor reads it from the GET.
  it('opens a debate locked without a reel on no clips, and offers both ways out', () => {
    const resubmit = status({
      status: 'skipped',
      outcome: 'reel_no_longer_fits',
      manual_reel: { clock: 'video', clips: [], reapplied: { job_id: 'job', quotes: ['Coffee dates'] } },
      report: { story_failed: 'clip 1: its speaker has no claim to link it to' },
    });
    mocks.manualReel = true;
    mocks.plan.data = entry({
      reel_unlinkable: true,
      live_reel: null,
      hand_picked: { requested_by: 'yaniv', requested_at: '2026-11-10T12:00:00Z' },
      request: resubmit,
    });
    mocks.backfill.data = { request: resubmit, entry: null };
    render(<MomentsEditor debateId={DEBATE_ID} />);

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(
      'This debate has no reel. A re-render couldn’t carry the hand-picked reel over. Pick new clips, or return to automatic.'
    );
    expect(notice).toHaveTextContent('Lost reel, clip 1: its speaker has no claim to link it to');
    expect(screen.queryByText(/moved the video/)).not.toBeInTheDocument();
    // The served moments still name a clip; it is not opened as if it played.
    expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Clip 1, / })).not.toBeInTheDocument();
    expect(screen.queryByText('Times approximate')).not.toBeInTheDocument();
    expect(screen.getByText('Locked · no reel')).toBeInTheDocument();
    expect(screen.queryByText('Hand-picked · locked')).not.toBeInTheDocument();

    fireEvent.click(within(notice).getByRole('button', { name: 'Return to automatic' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'The debate has no reel until the new clips are rendered.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and re-pick' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { unlock: true, story: true, reason: 'Moments editor: return to automatic', base: 'v1' },
      expect.any(Object)
    );
  });

  // The GET is polled and is the request's one source; the dry run's copy is from when it was read.
  it('reads the request from the GET, not from the dry run’s copy of it', () => {
    mocks.plan.data = entry({ request: status({ status: 'queued' }) });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByText('Queued · live reel unchanged')).not.toBeInTheDocument();
    expect(menuItem('Check before publishing')).toBeEnabled();
  });

  // The reel changed under the edit; Discard goes back to the reel that is live now, on its version.
  it('discards an edit to the reel that is live now, not the one the page opened on', () => {
    const live = (start: number, end: number) => ({
      clock: 'video' as const,
      clips: [{ start_ms: start, end_ms: end, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
    });
    mocks.plan.data = entry({ live_reel: live(900, 3_000) });
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    mocks.plan = { ...mocks.plan, data: entry({ reel_version: 'v2', live_reel: live(1_000, 2_900) }) };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(edgeField('End')).toHaveValue('0:01.5');

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(edgeField('Start')).toHaveValue('0:01.0');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    typeEdge('End', '1.45');
    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ reel: expect.objectContaining({ base: 'v2' }) }),
      expect.any(Object)
    );
  });

  // A refusal that says the reel moved on means the plan is stale: it is read again, so the editor
  // shows where the reel stands without a reload.
  it('reads the plan again when a publish is refused because the reel moved on', () => {
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: false, refusal: 'reel_being_reapplied', request: null })
    );
    render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    publish();
    expect(screen.getByText(/carried this hand-picked reel over since you opened it/)).toBeInTheDocument();
    expect(screen.queryByText(/Reload/)).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  // The refused edit is kept, and Return to automatic waits until it is discarded: the reason says so.
  it('says to discard a refused edit before returning a carried reel to automatic', () => {
    mocks.manualReel = true;
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: false, refusal: 'reel_being_reapplied', request: null })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    fireEvent.click(publishButton());
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));

    // The plan read again: the reel is carried now, and nothing is queued to cut it again.
    mocks.plan = {
      ...mocks.plan,
      data: entry({
        reel_version: 'v2',
        live_reel: {
          clock: 'video',
          carried: true,
          clips: [
            { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          ],
        },
      }),
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    // The refusal says why, with the carried reel's way out: discard first.
    expect(screen.getByRole('alert')).toHaveTextContent(/carried this hand-picked reel over since you opened it/);
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(/return to automatic/i);
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Return it to automatic to pick again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/discard your changes/i);
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Return to automatic' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Return to automatic' })).toBeInTheDocument();
  });

  // geo-chat#352 queues the worker's re-submit of the lost reel with the re-render that loses it.
  // Until it is done, neither way out can be taken, so the notice offers neither.
  it('offers no way out of a debate locked without a reel while a request for it is in the queue', () => {
    const resubmit = status({
      status: 'queued',
      manual_reel: { clock: 'video', clips: [], reapplied: { job_id: 'job', quotes: ['Coffee dates'] } },
    });
    mocks.manualReel = true;
    mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null, refusal: 'already_queued' });
    mocks.backfill.data = { request: resubmit, entry: null };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(
      'This debate has no reel. A request for it is in the queue. You can pick clips or return to automatic once it’s done.'
    );
    expect(notice).not.toHaveTextContent('Pick new clips, or return to automatic.');
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();
  });

  it('leaves the way out of a debate locked without a reel to the read-only reason', () => {
    mocks.manualReel = true;
    mocks.transcriptFailed = true;
    mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(
      "This debate has no reel. Couldn't load this debate's transcript. Reload to try again."
    );
    expect(notice).not.toHaveTextContent(/Pick new clips|return to automatic/);
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();
  });

  // A re-render moves the video, and the turns map the live cuts onto the player's clock: when they
  // are read again, the reel is mapped again, even if the plan's answer landed first.
  it('maps the live reel again when the turns move', () => {
    const turn = (source: number) => ({
      turn_index: 0,
      participant_slot: 1,
      output_start_ms: 0,
      output_end_ms: 10_000,
      duration_ms: 10_000,
      source_start_ms: source,
      source_end_ms: source + 10_000,
    });
    mocks.turns = [turn(500)];
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(edgeField('Start')).toHaveValue('0:01.4');

    mocks.turns = [turn(0)];
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(edgeField('Start')).toHaveValue('0:00.9');
  });

  // An edit is the admin's: turns that move under it (a media read landing after a re-render, with
  // the plan's new version) never remap it away, and it is still sent on the version it was made on.
  it('keeps an unsaved edit, and its base, when the turns and the version move under it', () => {
    const turn = (source: number) => ({
      turn_index: 0,
      participant_slot: 1,
      output_start_ms: 0,
      output_end_ms: 10_000,
      duration_ms: 10_000,
      source_start_ms: source,
      source_end_ms: source + 10_000,
    });
    mocks.turns = [turn(500)];
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    const end = edgeField('End');
    fireEvent.change(end, { target: { value: '3.3' } });
    fireEvent.blur(end);
    expect(edgeField('End')).toHaveValue('0:03.3');

    mocks.turns = [turn(0)];
    mocks.plan.data = entry({
      reel_version: 'v2',
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(edgeField('Start')).toHaveValue('0:01.4');
    expect(edgeField('End')).toHaveValue('0:03.3');
    fireEvent.click(publishButton());
    fireEvent.click(screen.getByRole('button', { name: /Publish and lock|Publish anyway/ }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ reel: expect.objectContaining({ base: 'v1' }) }),
      expect.any(Object)
    );
  });

  // A carried reel's cuts are on the old video's clock, and the editor maps them through the new
  // one's turns: its own checks would flag spans the clips don't play, so it runs none on them.
  it('runs none of its own clip checks on a carried reel, and says its times are approximate', () => {
    mocks.manualReel = true;
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        carried: true,
        clips: [
          { start_ms: 3_100, end_ms: 4_900, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/its clips are still cut on the old video/);
    expect(screen.getByText('Times approximate')).toBeInTheDocument();
    // Its span has no words here, which on any other reel can't be published.
    expect(cantPublish(1)).toBe(false);
  });

  // A carried reel's warnings would be about its old-video cuts at the new video's places, on a reel
  // that can't be edited: the panel isn't shown for it.
  it('shows no warnings for a carried reel', () => {
    mocks.manualReel = true;
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        carried: true,
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(clipPanel()).toBeInTheDocument();
    expect(warningCount()).toBe(0);
    expect(within(card(1)).queryByRole('img', { name: '1 warning' })).not.toBeInTheDocument();
    fireEvent.click(menuItem(/^All warnings/));
    expect(screen.queryByText(/Only 1 clip/)).not.toBeInTheDocument();
  });

  // The carry ends when the worker's re-cut lands, with no reload: the plan read again says so, and
  // the editor judges the reel's clips, and warns about it, again from then on.
  it('runs its clip checks and warnings again once a carried reel is cut again', () => {
    mocks.manualReel = true;
    const clips = [
      { start_ms: 3_100, end_ms: 4_900, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
    ];
    mocks.plan.data = entry({ live_reel: { clock: 'video', carried: true, clips } });
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(cantPublish(1)).toBe(false);
    expect(warningCount()).toBe(0);

    mocks.plan.data = entry({ reel_version: 'v2', live_reel: { clock: 'video', clips } });
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByText(/still cut on the old video/)).not.toBeInTheDocument();
    expect(cantPublish(1)).toBe(true);
    fireEvent.click(within(card(1)).getByRole('button', { name: /^Claim: / }));
    expect(screen.getByText('Nobody says a whole word in it.')).toBeInTheDocument();
    fireEvent.click(menuItem(/^All warnings/));
    expect(screen.getByText(/Only 1 clip/)).toBeInTheDocument();
  });

  // Return to automatic waits until an edit is gone, so a debate locked without a reel and with an
  // edit on it points to publishing the edit or discarding it, not to a button it hides.
  it('points a debate locked without a reel, with an edit on it, to publishing or discarding it', () => {
    mocks.manualReel = true;
    mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null });
    mocks.playheadSeconds = 1;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Pick new clips, or return to automatic/);

    fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Clip picker' })).getByRole('button', { name: /Use playhead/ })
    );
    expect(card(1)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This debate has no reel. Publish the clips you’ve picked, or discard them to return to automatic.'
    );
  });

  // geo-chat#352 links a carried clip to its own published claim, which a re-extraction may keep as
  // `retained`, and takes it by name. An edit that keeps the clip's speaker keeps that link.
  it('keeps a clip linked to a retained claim on that claim through an edit, and publishes it so', () => {
    mocks.retainedClaim = true;
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 2, claim_text: 'Coffee was the plan' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(markedClaim(1)).toMatch(/^Coffee was the plan \(earlier extraction\)/);
    typeEdge('End', '1.45');
    expect(markedClaim(1)).toMatch(/^Coffee was the plan \(earlier extraction\)/);
    fireEvent.click(publishButton());
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        // The live start, 0.9 s, is kept where it was cut, so the reel goes `exact`.
        reel: { clock: 'player', clips: [{ start: 0.9, end: 1.45, claim_index: 2 }], exact: true, base: 'v1' },
      }),
      expect.any(Object)
    );
  });

  // Without its words nothing snaps and no clip has a speaker, so a touched clip loses its claim.
  it('is read-only when the transcript never loaded', () => {
    mocks.transcriptFailed = true;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this debate's transcript. Reload to try again.");
    expect(clipLocked()).toBe(true);
  });

  it('closes the publish confirm when an edit under it breaks a clip', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    fireEvent.click(publishButton());
    expect(screen.getByRole('alertdialog', { name: 'Publish this reel?' })).toBeInTheDocument();

    typeEdge('End', '0.5');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('keeps a confirm the reel closed closed once the edit that closed it is mended', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const setEnd = (value: string) => {
      fireEvent.change(edgeField('End'), { target: { value } });
      fireEvent.blur(edgeField('End'));
    };
    setEnd('1.45');
    fireEvent.click(publishButton());
    setEnd('0.5');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    setEnd('1.45');
    expect(publishButton()).toBeEnabled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('closes the return-to-automatic confirm once the reel is edited', () => {
    mocks.manualReel = true;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Return to automatic' }));
    typeEdge('End', '1.45');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the edge as it stands when a typed time snaps back to it', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const end = () => edgeField('End');
    fireEvent.change(end(), { target: { value: '2.0' } });
    fireEvent.blur(end());
    expect(end()).toHaveValue('0:02.9');
    // Mid-"dates" again: it snaps to the same end, so nothing changes, and the box says so.
    fireEvent.change(end(), { target: { value: '2.5' } });
    fireEvent.blur(end());
    expect(end()).toHaveValue('0:02.9');
  });

  // The "Only 1 clip" fix adds at the playhead, so before the player reports one it can't run.
  it('offers the add-a-clip fix only once there is a playhead to add at', () => {
    const fix = () =>
      within(screen.getByRole('complementary', { name: 'All warnings' })).getByRole('button', {
        name: 'Add clip at playhead',
      });
    const { unmount } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem(/^All warnings/));
    expect(fix()).toBeDisabled();
    unmount();

    mocks.playheadSeconds = 4;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem(/^All warnings/));
    fireEvent.click(fix());
    expect(card(2)).toBeInTheDocument();
  });

  // A poll that fails after the first answer keeps its data; the editor, and what was typed, stay.
  it('keeps the editor and its unsaved edits when a later read fails', () => {
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');

    mocks.backfill = { ...mocks.backfill, error: new GeoChatRequestError('down', 'unavailable', 503) };
    mocks.plan = { ...mocks.plan, isSuccess: false, error: new Error('down') };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);

    // Read-only until the plan reads again, with the edit kept.
    expect(screen.getByTestId('waveform-readout')).toHaveTextContent('End 0:01.45');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  // With no clip to select and no playhead (the combined-video fallback reports none), as on a debate
  // locked without a reel, the transcript is the way to start one.
  it('starts a new clip from a transcript sentence when there is no clip and no playhead', () => {
    sentencesOverride = [
      { participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' },
      { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner.' },
    ];
    mocks.manualReel = true;
    mocks.plan.data = entry({
      reel_unlinkable: true,
      live_reel: null,
      hand_picked: { requested_by: 'yaniv', requested_at: '2026-11-10T12:00:00Z' },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
    // The Add picker can't add at a playhead there isn't.
    fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
    expect(screen.getByRole('button', { name: /Use playhead/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the transcript' }));

    // Words selected in the transcript make the first clip.
    selectWords(2, 2);
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(edgeField('Start')).toHaveValue('0:05.0');
    expect(card(1)).toHaveAttribute('role', 'group');
    expect(clipPanel()).toHaveAccessibleName('Clip 1, Urban');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('offers no new clip from the transcript while the reel is read-only', () => {
    sentencesOverride = [{ participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' }];
    mocks.plan.data = entry({ refusal: 'media_job_active' });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectWords(0, 1);
    expect(screen.getByRole('group', { name: 'Clip from the selected words' })).toHaveTextContent('0:01.0 to 0:02.9');
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
  });

  // Nothing is edited while a request runs (GEO-3773): the transcript's edits included, not only the clip panel's.
  it('offers no new clip from the transcript while a request is in flight', () => {
    sentencesOverride = [
      { participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' },
      { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner.' },
    ];
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    selectWords(2, 2);
    expect(screen.getByRole('button', { name: 'New clip from these words' })).toBeInTheDocument();
    expect(within(screen.getByTestId('reel-transcript')).getAllByRole('slider')).toHaveLength(2);

    mocks.backfill.data = {
      request: status({ status: 'queued', requested_at: '2026-11-11T21:05:00Z' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    selectWords(2, 2);
    expect(screen.getByRole('group', { name: 'Clip from the selected words' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('reel-transcript')).queryByRole('slider')).not.toBeInTheDocument();
  });

  it('marks the selected card on a read-only reel, and offers no Advanced options it could not open', () => {
    mocks.plan.data = entry({
      refusal: 'media_job_active',
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectClip(2);
    expect(clipPanel()).toHaveAccessibleName(/^Clip 2, /);
    expect(isSelected(2)).toBe(true);
    expect(within(card(2)).getByRole('button', { name: /^Claim: / })).toBeDisabled();
    expect(within(clipPanel()).getByRole('button', { name: /^Advanced/ })).toBeDisabled();
  });

  it('opens the Add picker around the playhead', () => {
    sentencesOverride = [
      { participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' },
      { participant_slot: 2, start_ms: 60_000, end_ms: 62_000, text: 'Dinner shows effort.' },
    ];
    mocks.playheadSeconds = 80;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
    const focused = screen.getByRole('complementary').querySelector('[data-focusrow]');
    expect(focused).toHaveTextContent('Dinner shows effort.');
  });

  // The selection follows the clip, not its place: moving it must not hand the panel, and the
  // transcript's "Start clip N here", to the clip that moved into its place.
  it('keeps the selected clip selected when it moves to another place', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 1_450, speaker_slot: 0, claim_index: 0, claim_text: null },
          { start_ms: 1_450, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: null },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: null },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectClip(2);
    expect(edgeField('Start')).toHaveValue('0:01.5');

    fireEvent.click(screen.getByRole('button', { name: 'Move earlier' }));
    expect(card(1)).toHaveAttribute('role', 'group');
    expect(clipPanel()).toHaveAccessibleName(/^Clip 1, /);
    expect(edgeField('Start')).toHaveValue('0:01.5');
    expect(screen.getByRole('button', { name: 'Move earlier' })).toBeDisabled();
    expect(within(card(2)).getByText('Coffee')).toBeInTheDocument();
  });

  it('snaps a typed edge that falls mid-word out to the whole word', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '2.0');
    expect(edgeField('End')).toHaveValue('0:02.9');
  });

  it('offers Return to automatic only for a hand-picked reel, and sends the version with it', () => {
    mocks.plan.data = entry({ hand_picked: { requested_by: 'space', requested_at: '2026-11-11T19:00:00Z' } });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Hand-picked · locked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and re-pick' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { unlock: true, story: true, reason: 'Moments editor: return to automatic', base: 'v1' },
      expect.any(Object)
    );
  });

  // geo-chat#351 names the publisher only when it recorded one; an older hand-picked reel is
  // `hand_picked: null`, and is still locked.
  it('treats a reel locked before its publisher was recorded as hand-picked', () => {
    mocks.manualReel = true;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Hand-picked · locked')).toBeInTheDocument();
    expect(screen.queryByText(/^Hand-picked on/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to automatic' })).toBeInTheDocument();
  });
});

describe('claimsBySpeaker', () => {
  // geo-chat#352's manual_moments takes a named retained claim (claims_with_speakers(payload, true)).
  it('places a retained claim on its speaker, after the fresh ones', () => {
    const { bySlot, slot } = claimsBySpeaker({
      turns: [{ turn_index: 0, participant_slot: 1 }],
      claims: [
        { text: 'From an earlier extraction', turn_index: 0, retained: true },
        { text: 'Coffee is low stakes', turn_index: 0 },
      ],
    });
    expect(bySlot.get(1)).toEqual([
      { index: 1, text: 'Coffee is low stakes' },
      { index: 0, text: 'From an earlier extraction', retained: true },
    ]);
    expect(slot.get(0)).toBe(1);
  });
});

describe('keepClaimWithSpeaker', () => {
  const words = [
    { slot: 1 as const, start_ms: 1_000, end_ms: 1_400, text: 'Coffee' },
    { slot: 2 as const, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
  ];
  const clip = { key: 'k', start_ms: 900, end_ms: 1_500, claim_index: 7, live_claim_text: null };
  // Claim 7 is one the editor can't place on a speaker.
  const unplaced = () => null;

  it('keeps the claim when the edit keeps the speaker, whatever the editor knows of the claim', () => {
    expect(keepClaimWithSpeaker(clip, { ...clip, end_ms: 1_450 }, words, unplaced).claim_index).toBe(7);
  });

  it('drops it when the edit hands the clip to the other debater, unless it is theirs', () => {
    const moved = { ...clip, start_ms: 4_900, end_ms: 5_500 };
    expect(keepClaimWithSpeaker(clip, moved, words, unplaced).claim_index).toBeNull();
    expect(keepClaimWithSpeaker(clip, moved, words, () => 2).claim_index).toBe(7);
  });

  it('judges a claim the edit sets on whose it is, even on the same speaker', () => {
    const unset = { ...clip, claim_index: null };
    expect(keepClaimWithSpeaker(unset, clip, words, unplaced).claim_index).toBeNull();
    expect(keepClaimWithSpeaker(unset, clip, words, () => 1).claim_index).toBe(7);
  });

  // The speaker the claim is judged on is geo-chat's: blank tokens are nobody's words (GEO-3767).
  it('keeps the claim when the edit only takes in the other debater’s blank tokens', () => {
    // Through `playerWords`, the one place blank tokens are dropped.
    const blanks = playerWords([
      ...words.map(w => ({ participant_slot: w.slot, start_ms: w.start_ms, end_ms: w.end_ms, text: w.text })),
      { participant_slot: 2, start_ms: 1_420, end_ms: 1_460, text: ' ' },
      { participant_slot: 2, start_ms: 1_470, end_ms: 1_490, text: '' },
    ]);
    // The edit widens the end over two slot-2 blanks: one heard word of slot 1's against two blanks.
    const tight = { ...clip, end_ms: 1_410 };
    const wider = { ...clip, end_ms: 1_500 };
    expect(keepClaimWithSpeaker(tight, wider, blanks, () => 1).claim_index).toBe(7);
    expect(keepClaimWithSpeaker(tight, wider, blanks, unplaced).claim_index).toBe(7);
  });
});

describe('editingBlockedReason', () => {
  it('leaves an editable debate, or one with a request in the queue, editable', () => {
    expect(editingBlockedReason({ refusal: null }, true, null)).toBeNull();
    expect(editingBlockedReason({ refusal: 'already_queued' }, true, null)).toBeNull();
  });

  it('blocks a transcript without word timings, and a failed check', () => {
    expect(editingBlockedReason({ refusal: null }, false, null)).toMatch(/no word timings/);
    expect(editingBlockedReason(null, true, new Error('x'))).toMatch(/Couldn't check/);
    // geo-chat#352's mark is `live_reel.carried`.
    expect(
      editingBlockedReason({ refusal: null, live_reel: { clock: 'video', clips: [], carried: true } }, true, null)
    ).toMatch(/Nothing is queued to cut it again/);
    expect(
      editingBlockedReason(
        { refusal: null, live_reel: { clock: 'video', clips: [], carried: true } },
        true,
        null,
        false,
        true
      )
    ).toMatch(/in the queue; this page updates/);
    expect(
      editingBlockedReason({ refusal: null, live_reel: { clock: 'video', clips: [], carried: false } }, true, null)
    ).toBeNull();
    expect(editingBlockedReason({ refusal: null }, undefined, null, true)).toMatch(
      /Couldn't load this debate's transcript/
    );
  });
});

describe('MomentsEditor warnings (GEO-3672)', () => {
  it('warns, with a one-click fix, when a clip opens on "So", and the fix moves its start to the next word', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: null, claim_text: null }],
      },
    });
    wordsOverride = [
      { participant_slot: 1, start_ms: 1_000, end_ms: 1_200, text: 'So,' },
      { participant_slot: 1, start_ms: 1_300, end_ms: 2_900, text: 'coffee.' },
    ];
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Clip 1 opens on “So”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start on “coffee.”' }));
    expect(edgeField('Start')).toHaveValue('0:01.3');
    expect(screen.queryByText('Clip 1 opens on “So”')).not.toBeInTheDocument();
    // A warning never disables publishing.
    expect(publishButton()).toBeEnabled();
  });

  // A fix hands back the whole reel; the clips it left alone keep their claims, even one the editor
  // can't place on a speaker.
  it('leaves the claims of clips a fix did not touch', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: null, claim_text: null },
          { start_ms: 4_900, end_ms: 5_500, speaker_slot: 1, claim_index: 9, claim_text: 'Dinner then a walk' },
        ],
      },
    });
    wordsOverride = [
      { participant_slot: 1, start_ms: 1_000, end_ms: 1_200, text: 'So,' },
      { participant_slot: 1, start_ms: 1_300, end_ms: 2_900, text: 'coffee.' },
      { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
    ];
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start on “coffee.”' }));
    fireEvent.click(publishButton());
    fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reel: {
          clock: 'player',
          // The fixed start gets geo-chat's room after "So,"; the live cuts stay where they were cut.
          clips: [
            { start: 1.26, end: 3 },
            { start: 4.9, end: 5.5, claim_index: 9 },
          ],
          exact: true,
          base: 'v1',
        },
      }),
      expect.any(Object)
    );
  });
});

describe('MomentsEditor in a tab opened from the Best debates popup (GEO-3742)', () => {
  it('has no Done on its own page', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('closes its tab with Done, which waits for changes to be published or discarded', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    typeEdge('End', '1.45', 1);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });

  it('lets Done close once the edit is sent to publish, without waiting for the render, until it fails', () => {
    const requestedAt = '2026-11-14T10:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    typeEdge('End', '1.45', 1);
    publish();
    mocks.backfill.data = { request: status({ status: 'running', requested_at: requestedAt }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} closeable />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
    // The render failed: the edit is unpublished again, so Done waits.
    mocks.backfill.data = {
      request: status({ status: 'skipped', requested_at: requestedAt, outcome: 'manual_reel_invalid' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} closeable />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('keeps Done waiting while only a preview of the edit is rendering', () => {
    const requestedAt = '2026-11-14T10:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt, preview: true }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    typeEdge('End', '1.45', 1);
    fireEvent.click(menuItem('Check before publishing'));
    mocks.backfill.data = {
      request: status({ status: 'running', requested_at: requestedAt, preview: true }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} closeable />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('stays open, without Done, where the browser won’t let Done close the tab', () => {
    vi.useFakeTimers();
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const replace = vi.fn();
    const location = window.location;
    vi.stubGlobal('location', { href: 'https://geo.test/space/s/debates/d/moments?close=1', replace });
    render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(close).toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(replace).toHaveBeenCalledWith('https://geo.test/space/s/debates/d/moments');
    vi.stubGlobal('location', location);
    close.mockRestore();
    vi.useRealTimers();
  });

  it('shows a publish that failed after its tab closed, and brings its clips back with the problems', () => {
    const failed = (clock: string) =>
      status({
        status: 'skipped',
        requested_at: '2026-11-14T10:00:00Z',
        outcome: 'manual_reel_invalid',
        report: { story_failed: 'clip 1: no words are said in it' },
        manual_reel: { clock, clips: [{ start_ms: 1_000, end_ms: 1_450 }] },
      });
    mocks.backfill.data = { request: failed('video'), entry: null };
    const { unmount } = render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    expect(screen.getByText('Nothing changed.')).toBeInTheDocument();
    // Cut on another clock: told, but nothing to bring back.
    expect(screen.queryByRole('button', { name: RESTORE_FAILED_EDIT_LABEL })).not.toBeInTheDocument();
    unmount();

    mocks.backfill.data = { request: failed('player'), entry: null };
    render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    fireEvent.click(screen.getByRole('button', { name: RESTORE_FAILED_EDIT_LABEL }));
    // The worker's problems are on the clips brought back: the banner's link opens the claim panel.
    expect(screen.getAllByText('Nothing changed.')).toHaveLength(1);
    expect(cantPublish(1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'See clip 1.' }));
    expect(
      within(screen.getByRole('complementary', { name: 'Clip claim' })).getByText('No words are said in it.')
    ).toBeInTheDocument();
    selectClip(1);
    expect(edgeField('End')).toHaveValue('0:01.5');
    // An unsaved edit again: Done waits.
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('says why a failed publish can’t be brought back when the editor is read-only', () => {
    mocks.transcriptFailed = true;
    mocks.backfill.data = {
      request: status({
        status: 'skipped',
        requested_at: '2026-11-14T10:00:00Z',
        outcome: 'manual_reel_invalid',
        report: { story_failed: 'clip 1: no words are said in it' },
        manual_reel: { clock: 'player', clips: [{ start_ms: 1_000, end_ms: 1_450 }] },
      }),
      entry: null,
    };
    render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Nothing changed.');
    expect(banner).toHaveTextContent("Couldn't load this debate's transcript. Reload to try again.");
    expect(screen.queryByRole('button', { name: RESTORE_FAILED_EDIT_LABEL })).not.toBeInTheDocument();
  });

  it('brings back a failed reel’s free edges only when it was sent exact', () => {
    for (const exact of [true, false]) {
      mocks.mutate.mockReset();
      mocks.backfill.data = {
        request: status({
          status: 'skipped',
          requested_at: '2026-11-14T10:00:00Z',
          outcome: 'manual_reel_invalid',
          report: { story_failed: 'clip 1: no words are said in it' },
          manual_reel: { clock: 'player', clips: [{ start_ms: 900, end_ms: 1_450 }], ...(exact && { exact }) },
        }),
        entry: null,
      };
      const { unmount } = render(<MomentsEditor debateId={DEBATE_ID} closeable />);
      fireEvent.click(screen.getByRole('button', { name: RESTORE_FAILED_EDIT_LABEL }));
      // Fix the clip the worker refused (its end), then publish again.
      typeEdge('End', '1.4', 1);
      publish();
      const body = mocks.mutate.mock.calls[0][0] as { reel: { exact?: boolean } };
      expect(body.reel.exact === true).toBe(exact);
      unmount();
    }
  });

  it('says nothing of an automatic re-cut that failed: it was no publish from here', () => {
    mocks.backfill.data = {
      request: status({ status: 'skipped', requested_at: '2026-11-14T10:00:00Z', outcome: 'story_pick_failed' }),
      entry: null,
    };
    render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    expect(screen.queryByText('Nothing changed.')).not.toBeInTheDocument();
  });

  it('offers Done even when it can’t show the editor', () => {
    mocks.backfill = {
      isPending: false,
      error: new GeoChatRequestError('no', 'media_admin_required', 403),
      data: undefined,
    };
    render(<MomentsEditor debateId={DEBATE_ID} closeable />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });
});

describe('MomentsEditor transcript selection (GEO-3766)', () => {
  const WORDS = [
    { participant_slot: 1, start_ms: 1_000, end_ms: 1_400, text: 'Coffee' },
    { participant_slot: 1, start_ms: 1_500, end_ms: 2_900, text: ' dates.' },
    { participant_slot: 1, start_ms: 3_000, end_ms: 3_400, text: ' Cheap.' },
    { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
    { participant_slot: 2, start_ms: 5_500, end_ms: 5_900, text: ' wins.' },
  ];
  const SENTENCES = [
    { participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' },
    { participant_slot: 1, start_ms: 3_000, end_ms: 3_400, text: 'Cheap.' },
    { participant_slot: 2, start_ms: 5_000, end_ms: 5_900, text: 'Dinner wins.' },
  ];

  // jsdom lays nothing out, so a range has no boxes of its own.
  const rangeBoxes = {
    getClientRects: Range.prototype.getClientRects,
    getBoundingClientRect: Range.prototype.getBoundingClientRect,
  };
  beforeAll(() => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  });
  afterAll(() => Object.assign(Range.prototype, rangeBoxes));

  beforeEach(() => {
    wordsOverride = WORDS;
    sentencesOverride = SENTENCES;
  });
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  const transcript = () => screen.getByTestId('reel-transcript');
  const wordSpan = (index: number) => transcript().querySelector<HTMLElement>(`[data-word="${index}"]`)!;
  /** Each turn's timecode, in the gutter. */
  const timecodes = () => [...transcript().querySelectorAll<HTMLElement>('span.text-right')];
  /** Drags a selection from one point to another, as the pointer does, and lets go. */
  const select = (start: [Node, number], end: [Node, number], downOn: Element = transcript()) => {
    fireEvent.pointerDown(downOn);
    const range = document.createRange();
    range.setStart(...start);
    range.setEnd(...end);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.pointerUp(document);
  };
  const textOf = (index: number) => wordSpan(index).firstChild!;
  /** Sets a selection with no pointer, as Shift+Arrow or Cmd+A does, and lets it rest. */
  const selectByKeyboard = (setUp: (range: Range) => void) => {
    const range = document.createRange();
    setUp(range);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));
    act(() => vi.advanceTimersByTime(SELECTION_SETTLE_MS));
  };

  it('sets the selected clip to exactly the highlighted words, partial words counting whole', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // From inside "dates." to inside "Cheap.", across two sentences.
    select([textOf(1), 2], [textOf(2), 3]);
    fireEvent.click(screen.getByRole('button', { name: 'Set clip 1 to these words' }));
    expect(edgeField('Start')).toHaveValue('0:01.5');
    expect(edgeField('End')).toHaveValue('0:03.4');
    expect(screen.queryByRole('button', { name: 'Set clip 1 to these words' })).not.toBeInTheDocument();
  });

  it('adds a new clip of the highlighted words and selects it', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(3), 0], [textOf(4), 5]);
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(clipPanel()).toHaveAccessibleName(/^Clip 2, /);
    expect(edgeField('Start')).toHaveValue('0:05.0');
    expect(edgeField('End')).toHaveValue('0:05.9');
  });

  it('publishes a clip set from a selection as word edges, without exact', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(0), 0], [textOf(1), 6]);
    fireEvent.click(screen.getByRole('button', { name: 'Set clip 1 to these words' }));
    publish();
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reel: { clock: 'player', clips: [{ start: 1, end: 2.9, claim_index: 0 }], base: 'v1' },
      }),
      expect.any(Object)
    );
  });

  it('reads an end resting on a timecode, a clip’s badge or a space from the nearest selected word', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // Susan's turn's timecode to Urban's: only Susan's words are between them.
    select([timecodes()[0].firstChild!, 0], [timecodes()[1].firstChild!, 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Set clip 1 to these words' }));
    expect(edgeField('Start')).toHaveValue('0:01.0');
    expect(edgeField('End')).toHaveValue('0:03.4');
    typeEdge('Start', '0:03.0');

    // Clip 1's badge sits before its first word, "Cheap." now.
    const badge = wordSpan(2).previousSibling as HTMLElement;
    expect(badge).toHaveTextContent('1');
    select([badge.firstChild!, 0], [textOf(2), 3]);
    fireEvent.click(screen.getByRole('button', { name: 'Set clip 1 to these words' }));
    expect(edgeField('Start')).toHaveValue('0:03.0');

    // From the space before "Dinner" to the very start of "wins.", which covers none of it.
    typeEdge('Start', '0:01.0');
    const space = wordSpan(4).previousSibling!;
    expect(space.textContent).toBe(' ');
    select([wordSpan(3).firstChild!, 6], [textOf(4), 0]);
    expect(screen.queryByRole('group', { name: 'Clip from the selected words' })).not.toBeInTheDocument();
    select([space, 0], [textOf(4), 2]);
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(edgeField('Start')).toHaveValue('0:05.5');
    expect(edgeField('End')).toHaveValue('0:05.9');
  });

  it('allows both debaters’ words, warning that it is an exchange of whoever says the most', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(2), 0], [textOf(4), 3]);
    expect(
      screen.getByText(
        "An exchange clip: it's Urban's, who says the most words, and also plays 1 word of Susan Winter's."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(clipPanel()).toHaveAccessibleName(/^Clip 2, /);
    expect(edgeField('Start')).toHaveValue('0:03.0');
    expect(edgeField('End')).toHaveValue('0:05.9');
  });

  it('refuses words that cross a cut in the video, with no way to make the clip', () => {
    const onBoth = (slot: 1 | 2, start: number, end: number, text: string) => ({
      participant_slot: slot,
      start_ms: start,
      end_ms: end,
      source_start_ms: start,
      source_end_ms: end,
      text,
    });
    mocks.turns = RENDERED_TURN_SEGMENTS;
    wordsOverride = [onBoth(1, 119_000, 119_400, 'Before'), onBoth(1, 130_000, 130_400, ' after.')];
    sentencesOverride = [onBoth(1, 119_000, 119_400, 'Before'), onBoth(1, 130_000, 130_400, 'after.')];
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(0), 0], [textOf(1), 3]);
    expect(screen.getByText('These words cross a cut in the video. Pick words from one stretch.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
  });

  it('marks each clip’s words, the selected clip’s stronger, with its number at its first word', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // The served moment, 1.0 to 3.0 s, plays "Coffee dates.".
    expect(wordSpan(0)).toHaveClass('bg-purple/10', 'bg-purple/25');
    expect(wordSpan(1)).toHaveClass('bg-purple/25');
    expect(wordSpan(2)).not.toHaveClass('bg-purple/10');
    expect(wordSpan(0).previousSibling).toHaveAccessibleName('Select clip 1');
    // Every turn: its timecode and its speaker.
    expect(timecodes().map(timecode => timecode.textContent)).toEqual(['0:01', '0:05']);
    deselect();
    expect(wordSpan(0)).toHaveClass('bg-purple/10');
    expect(wordSpan(0)).not.toHaveClass('bg-purple/25');
  });

  it('keeps the timecodes, clip numbers and speaker names out of a selection', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    for (const timecode of timecodes()) expect(timecode).toHaveClass('select-none');
    expect(wordSpan(0).previousSibling).toHaveClass('select-none');
    expect(screen.getAllByText('Susan Winter').find(el => transcript().contains(el))!).toHaveClass('select-none');
  });

  it('shows no toolbar for a plain click; a click goes to the word, or picks the clip it is in', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(1), 2], [textOf(1), 2], wordSpan(1));
    expect(screen.queryByRole('group', { name: 'Clip from the selected words' })).not.toBeInTheDocument();
    playerMocks.handle.seek.mockClear();
    fireEvent.click(wordSpan(2));
    expect(playerMocks.handle.seek).toHaveBeenLastCalledWith(3_000);
    // A word of the selected clip goes there too.
    fireEvent.click(wordSpan(1));
    expect(playerMocks.handle.seek).toHaveBeenLastCalledWith(1_500);
    expect(isSelected(1)).toBe(true);
  });

  it('picks a clip from its number or one of its words in the transcript', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(3), 0], [textOf(4), 5]);
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(isSelected(2)).toBe(true);
    fireEvent.click(within(transcript()).getByRole('button', { name: 'Select clip 1' }));
    expect(isSelected(1)).toBe(true);
    fireEvent.click(wordSpan(4));
    expect(isSelected(2)).toBe(true);
  });

  it('ignores the click that ends a drag across words', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(3), 0], [textOf(4), 5]);
    playerMocks.handle.seek.mockClear();
    fireEvent.click(wordSpan(4));
    expect(playerMocks.handle.seek).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'New clip from these words' })).toBeInTheDocument();
  });

  it('shows a word on the line between two sentences once, in its turn', () => {
    wordsOverride = [...WORDS, { participant_slot: 1, start_ms: 2_950, end_ms: 2_990, text: ' Yes,' }];
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // Sorted by start, "Yes," is word 2, said after "Coffee dates." ends and before "Cheap." starts.
    expect(transcript().querySelectorAll('[data-word="2"]')).toHaveLength(1);
    expect(wordSpan(2).closest('.grid')).toHaveTextContent(/^0:01Susan Winter1Coffee dates\. Yes, Cheap\.$/);
    expect(transcript().querySelectorAll('[data-word]')).toHaveLength(6);
  });

  it('says so, and offers no toolbar, for a transcript without word timings', () => {
    mocks.wordTiming = false;
    wordsOverride = [];
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(
      screen.getByText("This transcript has no word timings, so clips can't be made from a selection.")
    ).toBeInTheDocument();
    const text = screen.getByText('Coffee dates.').firstChild!;
    select([text, 0], [text, 6]);
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
  });

  it('opens the toolbar for a keyboard selection once it rests', () => {
    vi.useFakeTimers();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectByKeyboard(range => {
      range.setStart(textOf(3), 0);
      range.setEnd(textOf(4), 5);
    });
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(clipPanel()).toHaveAccessibleName(/^Clip 2, /);
    expect(edgeField('Start')).toHaveValue('0:05.0');
  });

  it('keeps the selection when a toolbar button is pressed', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(3), 0], [textOf(4), 5]);
    // A press that went through would clear the selection before the click lands.
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'New clip from these words' }))).toBe(false);
  });

  it('offers nothing for a selection of the whole page (Cmd+A)', () => {
    vi.useFakeTimers();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectByKeyboard(range => range.selectNodeContents(document.body));
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/cross a cut/)).not.toBeInTheDocument();
  });

  it('offers nothing for a drag that starts outside the transcript, even when it rests', () => {
    vi.useFakeTimers();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const heading = screen.getByRole('heading', { level: 1 });
    fireEvent.pointerDown(heading);
    selectByKeyboard(range => {
      range.setStart(heading.firstChild!, 0);
      range.setEnd(textOf(1), 3);
    });
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
  });

  it.each([
    ['pointercancel', () => fireEvent.pointerCancel(document)],
    ['dragend', () => fireEvent.dragEnd(document)],
  ])('ends a press that the browser takes over with %s', (_, end) => {
    vi.useFakeTimers();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.pointerDown(wordSpan(1));
    end();
    // Shift+Arrow afterwards still opens the toolbar: the press is not left held down.
    selectByKeyboard(range => {
      range.setStart(textOf(3), 0);
      range.setEnd(textOf(4), 5);
    });
    expect(screen.getByRole('button', { name: 'New clip from these words' })).toBeInTheDocument();
  });

  it('closes the toolbar when the transcript scrolls', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(3), 0], [textOf(4), 5]);
    expect(screen.getByRole('button', { name: 'New clip from these words' })).toBeInTheDocument();
    fireEvent.scroll(transcript());
    expect(screen.queryByRole('group', { name: 'Clip from the selected words' })).not.toBeInTheDocument();
  });

  it('opens the toolbar for a drag pressed on a word that ends past the transcript box', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // Dragging past the box's bottom edge autoscrolls it and ends the selection on the page below it.
    const below = document.createElement('div');
    below.textContent = 'Below the transcript';
    document.body.append(below);
    select([textOf(3), 0], [below.firstChild!, 3], wordSpan(3));
    fireEvent.click(screen.getByRole('button', { name: 'New clip from these words' }));
    expect(clipPanel()).toHaveAccessibleName(/^Clip 2, /);
    expect(edgeField('Start')).toHaveValue('0:05.0');
    expect(edgeField('End')).toHaveValue('0:05.9');
    below.remove();
  });

  it('opens the toolbar for a drag pressed on a word that runs back up past the transcript box', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // Dragging up past the box's top edge ends the selection on the page above it: the range starts
    // there, though it was pressed (anchored) on a transcript word.
    const above = document.createElement('h2');
    above.textContent = 'Above the transcript';
    document.body.prepend(above);
    fireEvent.pointerDown(wordSpan(1));
    window.getSelection()!.setBaseAndExtent(textOf(1), 3, above.firstChild!, 2);
    fireEvent.pointerUp(document);
    // "Coffee dates." is clip 1's: a new clip of them would overlap it.
    expect(screen.getByRole('button', { name: 'New clip from these words' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New clip from these words' })).toHaveAttribute(
      'title',
      'Overlaps clip 1'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set clip 1 to these words' }));
    expect(edgeField('Start')).toHaveValue('0:01.0');
    expect(edgeField('End')).toHaveValue('0:02.9');
    above.remove();
  });

  it('shows the text of a sentence whose only words are blank', () => {
    // "Cheap."'s only word token is blank, its real word timed into the sentence before.
    wordsOverride = [
      ...WORDS.slice(0, 2),
      { participant_slot: 1, start_ms: 2_950, end_ms: 2_990, text: ' Cheap.' },
      { participant_slot: 1, start_ms: 3_000, end_ms: 3_400, text: ' ' },
      ...WORDS.slice(3),
    ];
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // The word " Cheap." is said in "Coffee dates.", the sentence "Cheap." shows as its text.
    expect(within(transcript()).getAllByText('Cheap.')).toHaveLength(2);
  });

  it('offers nothing from a selection while the reel is read-only', () => {
    mocks.plan.data = entry({ refusal: 'media_job_active' });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(0), 0], [textOf(1), 3]);
    expect(screen.queryByRole('button', { name: /these words$/ })).not.toBeInTheDocument();
  });

  it('offers nothing from a selection while a request is in flight', () => {
    mocks.backfill.data = {
      request: status({ status: 'queued', requested_at: '2026-11-11T21:05:00Z' }),
      entry: null,
    };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    select([textOf(0), 0], [textOf(1), 3]);
    expect(screen.queryByRole('button', { name: 'Set clip 1 to these words' })).not.toBeInTheDocument();
  });
});

describe('MomentsEditor view state (GEO-3773)', () => {
  /** A reel of `count` clips, one word each, the speakers taking turns. */
  const reelOf = (count: number) => {
    wordsOverride = Array.from({ length: 7 }, (_, at) => ({
      participant_slot: (at % 2) + 1,
      start_ms: (at + 1) * 10_000,
      end_ms: (at + 1) * 10_000 + 400,
      text: `Word${at + 1}`,
    }));
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: Array.from({ length: count }, (_, at) => ({
          start_ms: (at + 1) * 10_000 - 100,
          end_ms: (at + 1) * 10_000 + 500,
          speaker_slot: at % 2,
          claim_index: null,
          claim_text: null,
        })),
      },
    });
  };
  const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' });

  it('deselects to the full debate, from the button or with Esc', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(isSelected(1)).toBe(true);
    deselect();
    expect(isSelected(1)).toBe(false);
    // The full debate's lane takes the clip panel's place, and the monitor says what it shows.
    expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
    expect(screen.getByTestId('debate-lane')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Debate player' })).getByText('Full debate')).toBeInTheDocument();

    selectClip(1);
    expect(isSelected(1)).toBe(true);
    expect(
      within(screen.getByRole('region', { name: 'Debate player' })).getByText('Clip 1 · Susan Winter')
    ).toBeInTheDocument();
    escape();
    expect(isSelected(1)).toBe(false);
  });

  it('closes the publish confirm with the first Esc and deselects only with the second', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    typeEdge('End', '1.45');
    fireEvent.click(publishButton());
    expect(screen.getByRole('alertdialog', { name: 'Publish this reel?' })).toBeInTheDocument();

    escape();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(isSelected(1)).toBe(true);
    escape();
    expect(isSelected(1)).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('selects the clip that took a removed selected clip’s place', () => {
    reelOf(3);
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectClip(2);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
    // Word3's clip is clip 2 now, and selected.
    expect(isSelected(2)).toBe(true);
    expect(edgeField('Start')).toHaveValue('0:29.9');
    expect(isSelected(1)).toBe(false);
  });

  it('opens a check’s report once when it lands, and goes back to the transcript from it', () => {
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt, preview: true }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem('Check before publishing'));
    mocks.backfill.data = { request: status({ requested_at: requestedAt, preview: true }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('complementary', { name: 'Check before publishing' })).not.toBeInTheDocument();

    mocks.backfill.data = {
      request: status({ requested_at: requestedAt, preview: true, status: 'done' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('complementary', { name: 'Check before publishing' })).toBeInTheDocument();

    // Esc closes the report first: the clip stays selected, under the transcript.
    escape();
    expect(screen.queryByRole('complementary', { name: 'Check before publishing' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Transcript' })).toBeInTheDocument();
    expect(isSelected(1)).toBe(true);
    // The same report doesn't open again on the next read.
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('complementary', { name: 'Check before publishing' })).not.toBeInTheDocument();
  });

  it('reads the reel again when a check leaves the queue, as any request does', () => {
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt, preview: true }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem('Check before publishing'));
    mocks.backfill.data = { request: status({ requested_at: requestedAt, preview: true }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(mocks.refresh).not.toHaveBeenCalled();

    mocks.backfill.data = {
      request: status({ requested_at: requestedAt, preview: true, status: 'done' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('complementary', { name: 'Check before publishing' })).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('goes back to the transcript when the admin publishes from a check’s report', () => {
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt, preview: true }) })
    );
    reelOf(5);
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem('Check before publishing'));
    mocks.backfill.data = {
      request: status({ requested_at: requestedAt, preview: true, status: 'done' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('complementary', { name: 'Check before publishing' })).toBeInTheDocument();

    selectClip(5);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('complementary', { name: 'Check before publishing' })).toBeInTheDocument();
    publish();
    expect(screen.queryByRole('complementary', { name: 'Check before publishing' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Transcript' })).toBeInTheDocument();
    expect(isSelected(4)).toBe(true);
  });

  it('goes back to the transcript when another request replaces the check', () => {
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt, preview: true }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem('Check before publishing'));
    mocks.backfill.data = {
      request: status({ requested_at: requestedAt, preview: true, status: 'done' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('complementary', { name: 'Check before publishing' })).toBeInTheDocument();

    // Another admin publishes: the debate's request is theirs now.
    mocks.backfill.data = { request: status({ requested_at: '2026-11-11T21:05:00Z' }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('complementary', { name: 'Check before publishing' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Transcript' })).toBeInTheDocument();
    expect(isSelected(1)).toBe(true);
  });

  it('leaves the transcript from a check’s report with Back to the transcript', () => {
    const requestedAt = '2026-11-11T21:00:00Z';
    mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
      options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt, preview: true }) })
    );
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(menuItem('Check before publishing'));
    mocks.backfill.data = {
      request: status({ requested_at: requestedAt, preview: true, status: 'done' }),
      entry: null,
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the transcript' }));
    expect(screen.queryByRole('complementary', { name: 'Check before publishing' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Transcript' })).toBeInTheDocument();
    expect(isSelected(1)).toBe(true);
  });

  describe('panels follow the clip they were opened for (the derived rule)', () => {
    const twoClips = () => {
      mocks.plan.data = entry({
        live_reel: {
          clock: 'video',
          clips: [
            { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
            { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
          ],
        },
      });
    };
    const side = () => screen.getByRole('complementary');
    const openReplace = () => fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Replace' }));

    it('ends Replace when another clip is picked, and it stays closed coming back', () => {
      twoClips();
      render(<MomentsEditor debateId={DEBATE_ID} />);
      openReplace();
      expect(side()).toHaveAccessibleName('Clip picker');
      expect(within(side()).getByText('Replace clip 1')).toBeInTheDocument();
      expect(within(clipPanel()).getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Next clip' }));
      expect(isSelected(2)).toBe(true);
      expect(side()).toHaveAccessibleName('Transcript');
      fireEvent.click(screen.getByRole('button', { name: 'Previous clip' }));
      expect(isSelected(1)).toBe(true);
      expect(side()).toHaveAccessibleName('Transcript');
    });

    it('keeps Replace open on the clip it moves', () => {
      twoClips();
      render(<MomentsEditor debateId={DEBATE_ID} />);
      selectClip(2);
      openReplace();
      fireEvent.click(within(clipPanel()).getByRole('button', { name: /^Advanced/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Move earlier' }));
      expect(clipPanel()).toHaveAccessibleName('Clip 1, Urban');
      expect(within(side()).getByText('Replace clip 1')).toBeInTheDocument();
    });

    it('hands a flagged clip’s claim panel to the flagged clip taking its place, and ends a healthy one’s', () => {
      reelOf(3);
      const requestedAt = '2026-11-11T21:00:00Z';
      mocks.mutate.mockImplementation((_body, options: { onSuccess: (entry: unknown) => void }) =>
        options.onSuccess({ queued: true, refusal: null, request: status({ requested_at: requestedAt }) })
      );
      const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
      typeEdge('End', '10.45', 1);
      publish();
      mocks.backfill.data = {
        request: status({
          requested_at: requestedAt,
          status: 'skipped',
          outcome: 'manual_reel_invalid',
          report: { story_failed: 'clip 1: no words are said in it; clip 2: no words are said in it' },
        }),
        entry: null,
      };
      rerender(<MomentsEditor debateId={DEBATE_ID} />);
      fireEvent.click(screen.getByRole('button', { name: 'See clips 1, 2.' }));
      expect(side()).toHaveAccessibleName('Clip claim');

      // Clip 2, flagged too, takes clip 1's place: its claim is what needs fixing next.
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
      expect(isSelected(1)).toBe(true);
      expect(cantPublish(1)).toBe(true);
      expect(side()).toHaveAccessibleName('Clip claim');
      expect(within(side()).getByText('Clip 1’s claim')).toBeInTheDocument();

      // The healthy clip after it doesn't keep it.
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
      expect(isSelected(1)).toBe(true);
      expect(side()).toHaveAccessibleName('Transcript');
    });

    it('ends Replace, and plays nothing, on Discard changes', () => {
      twoClips();
      render(<MomentsEditor debateId={DEBATE_ID} />);
      typeEdge('End', '1.45', 1);
      openReplace();
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Play clip' }));
      playerMocks.handle.pause.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
      expect(side()).toHaveAccessibleName('Transcript');
      expect(isSelected(1)).toBe(true);
      expect(edgeField('End')).toHaveValue('0:03.0');
    });

    it('selects the first clip when a discard leaves the selected clip’s place past the end', () => {
      reelOf(2);
      mocks.playheadSeconds = 65;
      render(<MomentsEditor debateId={DEBATE_ID} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
      fireEvent.click(screen.getByRole('button', { name: /Use playhead/ }));
      expect(isSelected(3)).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
      expect(screen.queryByRole('button', { name: /^Clip 3, / })).not.toBeInTheDocument();
      expect(isSelected(1)).toBe(true);
      expect(isSelected(2)).toBe(false);
    });

    it('opens the Add picker when a discard leaves a debate locked without a reel on no clips', () => {
      mocks.manualReel = true;
      mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null });
      mocks.playheadSeconds = 1;
      render(<MomentsEditor debateId={DEBATE_ID} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
      fireEvent.click(screen.getByRole('button', { name: /Use playhead/ }));
      expect(isSelected(1)).toBe(true);

      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Discard changes' }));
      expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
      expect(side()).toHaveAccessibleName('Clip picker');
      expect(within(side()).getByText('Add clip 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add clip' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('ends Replace and the claim menu once the reel turns read-only, and they stay closed after', () => {
      twoClips();
      const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
      openReplace();
      fireEvent.click(within(card(1)).getByRole('button', { name: /^Claim: / }));
      expect(screen.getByRole('listbox', { name: 'Claim' })).toBeInTheDocument();

      // Another admin's request is in the queue: nothing can be edited until it is done.
      mocks.backfill.data = {
        request: status({ status: 'queued', requested_at: '2026-11-11T21:05:00Z' }),
        entry: null,
      };
      rerender(<MomentsEditor debateId={DEBATE_ID} />);
      expect(side()).toHaveAccessibleName('Transcript');
      expect(screen.queryByRole('listbox', { name: 'Claim' })).not.toBeInTheDocument();

      mocks.backfill.data = {
        request: status({ status: 'done', requested_at: '2026-11-11T21:05:00Z' }),
        entry: null,
      };
      rerender(<MomentsEditor debateId={DEBATE_ID} />);
      expect(side()).toHaveAccessibleName('Transcript');
      expect(screen.queryByRole('listbox', { name: 'Claim' })).not.toBeInTheDocument();
      expect(within(clipPanel()).getByRole('button', { name: 'Replace' })).toBeEnabled();
    });
  });

  describe('regions', () => {
    it('says where the reel stands in the header, and marks an edited clip on its card', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(screen.getByText('Auto-picked')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument();
      expect(within(card(1)).queryByText('Edited')).not.toBeInTheDocument();

      typeEdge('End', '1.45');
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      expect(within(card(1)).getByText('Edited')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    });

    it('says why Publish is off: a clip to fix, or no clip at all', () => {
      mocks.plan.data = entry({
        live_reel: {
          clock: 'video',
          clips: [
            { start_ms: 3_100, end_ms: 4_900, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          ],
        },
      });
      const { unmount } = render(<MomentsEditor debateId={DEBATE_ID} />);
      typeEdge('End', '4.8');
      expect(cantPublish(1)).toBe(true);
      expect(publishButton()).toBeDisabled();
      act(() => (publishButton().parentElement as HTMLElement).focus());
      expect(screen.getByRole('tooltip')).toHaveTextContent('Fix clip 1 to publish');
      unmount();

      mocks.manualReel = true;
      mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null });
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(within(screen.getByRole('region', { name: 'Reel' })).getByText('0 of 4')).toBeInTheDocument();
      act(() => (publishButton().parentElement as HTMLElement).focus());
      expect(screen.getByRole('tooltip')).toHaveTextContent('Add a clip to publish');
    });

    it('says in the monitor when a clip plays its raw span, until playback stops', () => {
      mocks.plan.data = entry({
        live_reel: {
          clock: 'video',
          clips: [
            { start_ms: 3_100, end_ms: 4_900, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          ],
        },
      });
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const monitor = () => within(screen.getByRole('region', { name: 'Debate player' }));
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Play clip' }));
      expect(playerMocks.handle.jumpTo).toHaveBeenCalledWith(3_100);
      expect(monitor().getByText('Not in the published video — playing the raw span')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      expect(monitor().queryByText(/raw span/)).not.toBeInTheDocument();
    });

    it('fills the window under the navbar, no wider than 1440 px, with no page scroll', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      // jsdom has no layout: the shell's contract is in its classes (checked in a browser on the preview).
      expect(screen.getByTestId('moments-editor')).toHaveClass(
        'h-[calc(100dvh-2.75rem)]',
        'max-w-[1440px]',
        'overflow-hidden'
      );
    });
  });

  describe('clip cap (D4)', () => {
    it('offers the plain add under 4 clips', () => {
      reelOf(3);
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(screen.getByRole('button', { name: 'Add clip' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: /^Add a \dth clip/ })).not.toBeInTheDocument();
    });

    it.each([
      [4, 'Add a 5th clip'],
      [5, 'Add a 6th clip'],
    ])('offers a compact add at %i clips that says reels aim for 4', (count, label) => {
      reelOf(count);
      mocks.playheadSeconds = 65;
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const add = screen.getByRole('button', { name: label });
      act(() => add.focus());
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Reels work best with 4 clips. Add more only when the debate needs it.'
      );
      expect(screen.queryByRole('button', { name: 'Add clip' })).not.toBeInTheDocument();
      // It opens the picker, nothing selected while picking.
      fireEvent.click(add);
      expect(add).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Use playhead/ }));
      // The new clip is added at the playhead, and selected.
      expect(isSelected(count + 1)).toBe(true);
      expect(edgeField('Start')).toHaveValue('1:10.0');
    });

    it('offers no add at 6 clips', () => {
      reelOf(6);
      mocks.playheadSeconds = 65;
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(screen.queryByRole('button', { name: /Add/ })).not.toBeInTheDocument();
    });

    it.each([5, 6])('warns that a reel of %i clips is over the 4 we aim for', count => {
      reelOf(count);
      render(<MomentsEditor debateId={DEBATE_ID} />);
      // The Play reel card says so, and the warnings list it.
      expect(within(screen.getByRole('region', { name: 'Reel' })).getByText(`${count} clips`)).toBeInTheDocument();
      fireEvent.click(menuItem(/^All warnings/));
      expect(
        screen.getByText(
          `This reel has ${count} clips. We aim for 4. Four clips, two per speaker, keep the reel near a minute. Remove the clip that adds least.`
        )
      ).toBeInTheDocument();
    });

    it('says so in the publish confirm, as one sentence', () => {
      reelOf(6);
      render(<MomentsEditor debateId={DEBATE_ID} />);
      selectClip(6);
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
      fireEvent.click(publishButton());
      const confirm = screen.getByRole('alertdialog', { name: 'Publish this reel?' });
      expect(confirm).toHaveTextContent('1 warning still open: This reel has 5 clips. We aim for 4.');
      expect(confirm).not.toHaveTextContent('4..');
    });

    it('lists it with other warnings as sentences, not run together with a semicolon', () => {
      reelOf(6);
      render(<MomentsEditor debateId={DEBATE_ID} />);
      selectClip(6);
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Remove' }));
      // Clip 3 before clip 2: clips 1 and 2 are now both the first speaker.
      selectClip(3);
      fireEvent.click(within(clipPanel()).getByRole('button', { name: /^Advanced/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Move earlier' }));
      fireEvent.click(publishButton());
      const confirm = screen.getByRole('alertdialog', { name: 'Publish this reel?' });
      expect(confirm).toHaveTextContent(/still open: This reel has 5 clips\. We aim for 4\. Clips 1 and 2 are both /);
      expect(confirm).not.toHaveTextContent('.;');
    });
  });
});

describe('playing clips in the editor (GEO-3773)', () => {
  const player = playerMocks.handle;
  const props = () =>
    playerMocks.props as Record<string, unknown> & {
      playbackRate: number;
      onPlayheadChange: (seconds: number) => void;
      onSoundBlockedChange: (blocked: boolean) => void;
    };

  /** The reel strip's Play reel card, which reads Stop while the reel plays. */
  const reelCard = () =>
    within(screen.getByRole('region', { name: 'Reel' })).getByRole('button', { name: /Play reel|Stop/ });

  afterEach(() => {
    getDefaultStore().set(inlinePlaybackUnavailableAtom, false);
    player.endMs.mockReturnValue(null);
    // Back to the mock's defaults, so a test's held jump or live position never reaches the next.
    player.jumpTo.mockReturnValue('seeked');
    player.livePositionMs.mockReturnValue(null);
  });

  it('plays the debate as an editor: its own controls, with sound, measuring nothing', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(props()).toMatchObject({
      editorMode: true,
      forceSound: true,
      cutTransitions: true,
      measure: false,
      playbackRate: 1,
      pauseBreakCuts: false,
    });

    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    expect(props().playbackRate).toBe(2);
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '1.5×' }));
    expect(props().playbackRate).toBe(1.5);
  });

  it('plays a clip from its start through the hold and stops at its end', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);

    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Play clip' }));
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.jumpTo).toHaveBeenCalledOnce();
    const startMs = player.jumpTo.mock.calls[0][0];
    expect(startMs).toBeGreaterThanOrEqual(900);
    expect(startMs).toBeLessThan(1_100);
    expect(props().pauseBreakCuts).toBe(true);

    // The player reports a position past the clip's end.
    act(() => props().onPlayheadChange(3.5));
    expect(player.pause).toHaveBeenCalledOnce();
    expect(props().pauseBreakCuts).toBe(false);
  });

  it('plays the reel and stops it when the clips change under it', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);

    fireEvent.click(reelCard());
    expect(player.jumpTo).toHaveBeenCalledOnce();
    expect(reelCard()).toHaveTextContent('Stop');
    // While the reel plays, nothing is selected and the monitor names the clip playing.
    expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Debate player' })).getByText('Reel · clip 1 of 2')
    ).toBeInTheDocument();

    // The clips change under it (a refetch, another admin's publish): it stops.
    mocks.plan = {
      ...mocks.plan,
      data: entry({
        reel_version: 'v2',
        live_reel: {
          clock: 'video',
          clips: [
            { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          ],
        },
      }),
    };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(player.pause).toHaveBeenCalledOnce();
    expect(reelCard()).toHaveTextContent('Play reel');
  });

  it('plays and stops the reel on Space', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);

    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(player.jumpTo).toHaveBeenCalledOnce();
    expect(reelCard()).toHaveTextContent('Stop');

    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(reelCard()).toHaveTextContent('Play reel');
    // Space in a text field is left alone: use-editor-keyboard.test.tsx covers it.
  });

  it('leaves Space alone while inline playback is unavailable', () => {
    getDefaultStore().set(inlinePlaybackUnavailableAtom, true);
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(player.jumpTo).not.toHaveBeenCalled();
  });

  it("plays a carried reel's clip spans, which have no played cut", () => {
    const clips = [
      { start_ms: 3_100, end_ms: 4_900, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
    ];
    mocks.plan.data = entry({ live_reel: { clock: 'video', carried: true, clips } });
    render(<MomentsEditor debateId={DEBATE_ID} />);

    fireEvent.click(reelCard());
    expect(player.jumpTo).toHaveBeenCalledWith(3_100);
  });

  it('says when a carried clip is past the end of the video, rather than doing nothing', () => {
    player.endMs.mockReturnValue(4_000);
    const clips = [
      { start_ms: 1_000, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
      { start_ms: 5_000, end_ms: 6_000, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
    ];
    mocks.plan.data = entry({ live_reel: { clock: 'video', carried: true, clips } });
    render(<MomentsEditor debateId={DEBATE_ID} />);

    selectClip(2);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Play clip' }));
    expect(player.jumpTo).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('region', { name: 'Debate player' })).getByText(/This clip is past the end of the video/)
    ).toBeInTheDocument();

    fireEvent.click(reelCard());
    expect(player.jumpTo).toHaveBeenCalledWith(1_000);
    expect(screen.getByText(/Skipped 1 clip past the end of the video/)).toBeInTheDocument();
  });

  it('keeps saying a whole reel is past the end of the video when a clip was selected', () => {
    // Every clip is skipped, so the reel ends at once and goes back to the selected clip: that
    // return is not the admin's seek, and the message stays.
    player.endMs.mockReturnValue(4_000);
    const clips = [
      { start_ms: 5_000, end_ms: 6_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
      { start_ms: 7_000, end_ms: 8_000, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
    ];
    mocks.plan.data = entry({ live_reel: { clock: 'video', carried: true, clips } });
    render(<MomentsEditor debateId={DEBATE_ID} />);

    selectClip(1);
    player.seek.mockClear();
    fireEvent.click(reelCard());
    expect(player.jumpTo).not.toHaveBeenCalled();
    expect(player.seek).toHaveBeenLastCalledWith(5_000);
    expect(
      within(screen.getByRole('region', { name: 'Debate player' })).getByText(
        /These clips are past the end of the video/
      )
    ).toBeInTheDocument();
  });

  it('fits the player at its stacked 480 × 578 shape inside the monitor, letterboxed, badges on the stage', () => {
    const size = { width: 1000, height: 400 };
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.width);
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.height);
    try {
      // A wide stage: the full height, the width the shape allows, black either side.
      const wide = render(<MomentsEditor debateId={DEBATE_ID} />);
      const box = () =>
        screen.getByRole('region', { name: 'Debate player' }).querySelector<HTMLElement>('[data-player-box]')!;
      expect(box().style.height).toBe('400px');
      expect(parseFloat(box().style.width)).toBeCloseTo((400 * 480) / 578, 1);
      // The label stays on the stage, beside the box, not inside the narrower video.
      const label = within(screen.getByRole('region', { name: 'Debate player' })).getByText(/^Clip 1 · /);
      expect(box().contains(label)).toBe(false);
      expect(label.closest('[data-player-box]')).toBeNull();
      expect(label.parentElement).toBe(box().parentElement);
      wide.unmount();

      // A narrow, tall stage: the full width, letterboxed above and below.
      size.width = 300;
      size.height = 800;
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(box().style.width).toBe('300px');
      expect(parseFloat(box().style.height)).toBeCloseTo((300 * 578) / 480, 1);
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it('keeps the player stacked before the stage is measured (no 16:9 box)', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const box = screen.getByRole('region', { name: 'Debate player' }).querySelector<HTMLElement>('[data-player-box]')!;
    expect(box.style.aspectRatio).toBe('480 / 578');
    expect(box.style.height).toBe('100%');
    expect(box.style.maxWidth).toBe('100%');
  });

  it('sizes the box to the one combined video on the fallback, so the stage centres it', () => {
    // The combined video is a single 480 × 289 tile: in a two-tile 480 × 578 box it would sit at
    // the top with black below.
    getDefaultStore().set(inlinePlaybackUnavailableAtom, true);
    const size = { width: 1000, height: 400 };
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.width);
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.height);
    try {
      const box = () =>
        screen.getByRole('region', { name: 'Debate player' }).querySelector<HTMLElement>('[data-player-box]')!;
      // Wide stage: full height, letterboxed left and right at the single tile's shape.
      const wide = render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(box().style.height).toBe('400px');
      expect(parseFloat(box().style.width)).toBeCloseTo((400 * 480) / 289, 1);
      wide.unmount();

      // Narrower stage: full width, the single tile's height (not the stacked pair's).
      size.width = 600;
      size.height = 800;
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(box().style.width).toBe('600px');
      expect(parseFloat(box().style.height)).toBeCloseTo((600 * 289) / 480, 1);
    } finally {
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it('gives the unmeasured fallback box the single video’s shape', () => {
    getDefaultStore().set(inlinePlaybackUnavailableAtom, true);
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const box = screen.getByRole('region', { name: 'Debate player' }).querySelector<HTMLElement>('[data-player-box]')!;
    expect(box.style.aspectRatio).toBe('480 / 289');
  });

  it('says "Loading next clip" only between a reel’s clips, not while a single clip starts', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    // Every jump is held under the outgoing frames until both recordings can play.
    player.jumpTo.mockReturnValue('held');
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const monitor = () => within(screen.getByRole('region', { name: 'Debate player' }));

    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Play clip' }));
    expect(player.jumpTo).toHaveBeenCalledOnce();
    expect(monitor().queryByText('Loading next clip')).not.toBeInTheDocument();

    fireEvent.click(reelCard());
    expect(monitor().queryByText('Loading next clip')).not.toBeInTheDocument();
    // Clip 1's hold lets go and it plays; past its end, the jump to clip 2 holds.
    const live = props() as unknown as {
      onJumpTransition: (phase: 'release') => void;
      onPlaybackState: (state: { playing: boolean; error: boolean; autoplayBlocked: boolean }) => void;
    };
    act(() => live.onJumpTransition('release'));
    act(() => live.onPlaybackState({ playing: true, error: false, autoplayBlocked: false }));
    expect(monitor().queryByText('Loading next clip')).not.toBeInTheDocument();
    act(() => props().onPlayheadChange(3.4));
    expect(player.jumpTo).toHaveBeenLastCalledWith(expect.any(Number));
    expect(player.jumpTo.mock.lastCall![0]).toBeGreaterThanOrEqual(4_700);
    expect(monitor().getByText('Loading next clip')).toBeInTheDocument();
  });

  it('moves the time readout with a seek or a reported position while paused', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const readout = () => within(screen.getByRole('group', { name: 'Playback' })).getByTestId('monitor-time');
    // The player's live position lags the seek: it still says where it was.
    player.livePositionMs.mockReturnValue(1_000);
    selectClip(2);
    expect(player.seek).toHaveBeenLastCalledWith(expect.any(Number));
    const seekedTo = player.seek.mock.lastCall![0];
    expect(seekedTo).toBeGreaterThanOrEqual(4_700);
    expect(readout()).toHaveTextContent(`0:0${(Math.round(seekedTo / 100) / 10).toFixed(1)}`);

    act(() => props().onPlayheadChange(43.4));
    expect(readout()).toHaveTextContent('0:43.4');
  });

  it('offers to unmute a refused sound, from inside the click', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('button', { name: /Sound blocked/ })).not.toBeInTheDocument();

    act(() => props().onSoundBlockedChange(true));
    fireEvent.click(screen.getByRole('button', { name: 'Sound blocked — click to unmute' }));

    expect(player.unmute).toHaveBeenCalledOnce();
  });

  it('disables the transport on the combined-video fallback, and says why', () => {
    getDefaultStore().set(inlinePlaybackUnavailableAtom, true);
    render(<MomentsEditor debateId={DEBATE_ID} />);

    const transport = screen.getByRole('group', { name: 'Playback' });
    for (const name of ['Previous clip', 'Play from the playhead', 'Next clip', '1×', '1.5×', '2×']) {
      expect(within(transport).getByRole('button', { name })).toBeDisabled();
    }
    expect(reelCard()).toBeDisabled();
    expect(screen.getByText('Playback controls need the two-camera player')).toBeInTheDocument();
  });

  it('goes back to the selected clip’s start when the reel is stopped, as when it ends', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(isSelected(1)).toBe(true);
    fireEvent.click(reelCard());
    // Clip 1 plays; past its end, the reel goes on to clip 2.
    const live = props() as unknown as {
      onJumpTransition: (phase: 'release') => void;
      onPlaybackState: (state: { playing: boolean; error: boolean; autoplayBlocked: boolean }) => void;
    };
    act(() => live.onJumpTransition('release'));
    act(() => live.onPlaybackState({ playing: true, error: false, autoplayBlocked: false }));
    act(() => props().onPlayheadChange(3.4));
    expect(player.jumpTo.mock.lastCall![0]).toBeGreaterThanOrEqual(4_700);
    player.seek.mockClear();

    fireEvent.click(reelCard());
    expect(reelCard()).toHaveTextContent('Play reel');
    expect(isSelected(1)).toBe(true);
    expect(player.seek).toHaveBeenCalledOnce();
    expect(player.seek.mock.lastCall![0]).toBeLessThan(1_000);
  });

  it('keeps a seek made while the reel plays, rather than going back to the selected clip', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(reelCard());
    act(() => props().onPlayheadChange(1.5));
    player.seek.mockClear();

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Playhead' }), { key: 'ArrowRight' });
    expect(reelCard()).toHaveTextContent('Play reel');
    expect(player.seek).toHaveBeenCalledOnce();
    expect(player.seek).toHaveBeenLastCalledWith(2_500);
  });

  it('after a seek during the reel, says Full debate in the monitor and the bottom panel, not clip 1 again', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    // Clip 1 is selected when the reel starts.
    expect(clipPanel()).toBeInTheDocument();
    fireEvent.click(reelCard());
    act(() => props().onPlayheadChange(1.5));

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Playhead' }), { key: 'ArrowRight' });
    const monitor = within(screen.getByRole('region', { name: 'Debate player' }));
    expect(monitor.getByText('Full debate')).toBeInTheDocument();
    expect(monitor.queryByText(/^Clip 1 · /)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
    expect(screen.getByTestId('debate-lane')).toBeInTheDocument();
    expect(card(1)).not.toHaveAttribute('role', 'group');
  });

  it('a card picked during the reel stays selected (its seek is not a free seek)', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(reelCard());
    fireEvent.click(card(2));
    expect(screen.getByRole('region', { name: /^Clip 2, / })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Debate player' })).getByText(/^Clip 2 · /)).toBeInTheDocument();
  });

  it('keeps the add tile in place, off, while the reel plays, so the cards do not move', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [0, 1, 2, 3].map(at => ({
          start_ms: 900 + at * 1_000,
          end_ms: 1_700 + at * 1_000,
          speaker_slot: (at % 2) + 1,
          claim_index: 0,
          claim_text: 'Coffee is low stakes',
        })),
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const reel = () => screen.getByRole('region', { name: 'Reel' });
    const columns = reel().style.gridTemplateColumns;
    expect(within(reel()).getByRole('button', { name: 'Add a 5th clip' })).toBeEnabled();

    fireEvent.click(reelCard());
    expect(reelCard()).toHaveTextContent('Stop');
    expect(within(reel()).getByRole('button', { name: 'Add a 5th clip' })).toBeDisabled();
    expect(reel().style.gridTemplateColumns).toBe(columns);
  });

  it('says the same debate length in the transport and at the lane’s end', () => {
    // The debate runs to 60.7 s (its last clip's end): one rule says 1:00 in both places.
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 58_000, end_ms: 60_700, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    deselect();
    const transport = within(screen.getByRole('group', { name: 'Playback' })).getByText(/^\/ /).textContent;
    const laneEnd = document.querySelector('[data-lane-end]')?.textContent;
    expect(transport).toBe(`/ ${laneEnd}`);
    expect(laneEnd).toBe('1:00');
  });

  it('says a clip plays its raw span only while that clip plays: not after it ends or a seek', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 3_100, end_ms: 4_900, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const monitor = () => within(screen.getByRole('region', { name: 'Debate player' }));
    const playClip = () => fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Play clip' }));

    // The clip plays to its end and the range pauses it.
    playClip();
    expect(monitor().getByText(/playing the raw span/)).toBeInTheDocument();
    act(() => props().onPlayheadChange(5.0));
    expect(player.pause).toHaveBeenCalled();
    expect(monitor().queryByText(/raw span/)).not.toBeInTheDocument();

    // A seek on the clip's waveform ends the clip's range, and the notice with it.
    playClip();
    expect(monitor().getByText(/playing the raw span/)).toBeInTheDocument();
    vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
      width: 1_000,
      left: 0,
    } as DOMRect);
    player.seek.mockClear();
    fireEvent.pointerDown(screen.getByTestId('waveform-track'), { clientX: 500, pointerId: 1 });
    expect(player.seek).toHaveBeenCalledOnce();
    expect(monitor().queryByText(/raw span/)).not.toBeInTheDocument();
  });

  it('empties the cards’ progress once the reel stops', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    deselect();
    fireEvent.click(reelCard());
    act(() => props().onPlayheadChange(2));
    const bar = () => card(1).querySelector<HTMLElement>('[data-progress]')!;
    expect(bar().style.width).not.toBe('0px');
    expect(parseFloat(bar().style.width)).toBeGreaterThan(0);

    fireEvent.click(reelCard());
    expect(parseFloat(bar().style.width)).toBe(0);
  });

  it('plays from a picker sentence while the debate is already playing, rather than pausing it', () => {
    sentencesOverride = [{ participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' }];
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const live = props() as unknown as {
      onPlaybackState: (state: { playing: boolean; error: boolean; autoplayBlocked: boolean }) => void;
    };
    act(() => live.onPlaybackState({ playing: true, error: false, autoplayBlocked: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Add clip' }));
    player.play.mockClear();
    player.pause.mockClear();

    fireEvent.click(within(screen.getByRole('complementary')).getAllByRole('button', { name: /^Play from/ })[0]);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.jumpTo).toHaveBeenLastCalledWith(expect.any(Number));
  });
});

describe('MomentsEditor side transcript (GEO-3773)', () => {
  const WORDS = [
    { participant_slot: 1, start_ms: 1_000, end_ms: 1_400, text: 'Coffee' },
    { participant_slot: 1, start_ms: 1_500, end_ms: 2_900, text: ' dates.' },
    { participant_slot: 1, start_ms: 3_000, end_ms: 3_400, text: ' Cheap.' },
    { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
    { participant_slot: 2, start_ms: 5_500, end_ms: 5_900, text: ' wins.' },
  ];
  const SENTENCES = [
    { participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' },
    { participant_slot: 1, start_ms: 3_000, end_ms: 3_400, text: 'Cheap.' },
    { participant_slot: 2, start_ms: 5_000, end_ms: 5_900, text: 'Dinner wins.' },
  ];
  const liveClip = (start: number, end: number, slot = 0) => ({
    start_ms: start,
    end_ms: end,
    speaker_slot: slot,
    claim_index: null,
    claim_text: null,
  });
  /** A live reel of these clips (on the video's clock, which is the player's here). */
  const liveReel = (...clips: ReturnType<typeof liveClip>[]) => {
    mocks.plan.data = entry({ live_reel: { clock: 'video', clips } });
  };
  beforeEach(() => {
    wordsOverride = WORDS;
    sentencesOverride = SENTENCES;
  });
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  const transcript = () => screen.getByTestId('reel-transcript');
  const wordSpan = (index: number) => transcript().querySelector<HTMLElement>(`[data-word="${index}"]`)!;
  const toolbar = () => screen.queryByRole('group', { name: 'Clip from the selected words' });
  const button = (name: string | RegExp) => screen.queryByRole('button', { name });

  it('does not render the transcript on playhead reports, and marks the playhead’s word', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const report = playerMocks.props.onPlayheadChange as (seconds: number) => void;
    const before = transcriptRenderCount();
    for (const seconds of [1.1, 1.6, 2.2, 3.1, 5.2]) act(() => report(seconds));
    expect(transcriptRenderCount()).toBe(before);
    expect(wordSpan(3)).toHaveAttribute('data-playhead');
    expect(transcript().querySelectorAll('[data-playhead]')).toHaveLength(1);
  });

  it('closes the selection’s toolbar with Esc before anything else, then deselects', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectWords(3, 4);
    expect(toolbar()).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(toolbar()).not.toBeInTheDocument();
    expect(window.getSelection()!.isCollapsed).toBe(true);
    expect(isSelected(1)).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: /^Clip \d+, / })).not.toBeInTheDocument();
  });

  it('leaves Space and Esc to the search field while it has text', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const search = screen.getByRole('searchbox', { name: 'Search the transcript' });
    fireEvent.change(search, { target: { value: 'dinner' } });
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    playerMocks.handle.jumpTo.mockClear();
    fireEvent.keyDown(search, { key: ' ', code: 'Space' });
    expect(playerMocks.handle.jumpTo).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(isSelected(1)).toBe(true);
    // Space with a selection of words, focus on the page: the reel plays, as anywhere in the editor.
    selectWords(3, 4);
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(playerMocks.handle.jumpTo).toHaveBeenCalled();
  });

  it('offers only a new clip for words picked with no clip selected', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    deselect();
    selectWords(3, 4);
    expect(button(/^Set clip/)).not.toBeInTheDocument();
    expect(button('New clip from these words')).toBeEnabled();
  });

  it('disables a button whose clip would overlap another, saying which', () => {
    liveReel(liveClip(900, 3_000), liveClip(4_900, 5_950, 1));
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectClip(1);
    selectWords(2, 3);
    expect(button('Set clip 1 to these words')).toBeDisabled();
    expect(button('Set clip 1 to these words')).toHaveAttribute('title', 'Overlaps clip 2');
    expect(button('New clip from these words')).toBeDisabled();
    expect(button('New clip from these words')).toHaveAttribute('title', 'Overlaps clip 2');
    // Its own words don't count against the clip being set.
    selectWords(1, 2);
    expect(button('Set clip 1 to these words')).toBeEnabled();
  });

  /** `count` one-word clips far from the transcript's words, which stay free to pick. */
  const reelOf = (count: number) =>
    liveReel(...Array.from({ length: count }, (_, at) => liveClip(60_000 + at * 10_000, 61_000 + at * 10_000)));

  it.each([
    [3, 'plain'],
    [4, 'tooltip'],
    [5, 'tooltip'],
    [6, 'none'],
  ] as const)('at %i clips offers a new clip from words: %s', (count, offer) => {
    reelOf(count);
    render(<MomentsEditor debateId={DEBATE_ID} />);
    deselect();
    selectWords(3, 4);
    const add = button('New clip from these words');
    if (offer === 'none') {
      expect(add).not.toBeInTheDocument();
      expect(toolbar()).toHaveTextContent('0:05.0 to 0:05.9, 0.9 s');
      return;
    }
    expect(add).toBeEnabled();
    act(() => add!.focus());
    if (offer === 'plain') expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    else expect(screen.getByRole('tooltip')).toHaveTextContent(EXTRA_CLIP_TOOLTIP);
  });

  it('outlines the words the selected clip played before it was edited', () => {
    liveReel(liveClip(900, 3_000));
    render(<MomentsEditor debateId={DEBATE_ID} />);
    selectClip(1);
    expect(transcript().querySelector('.outline-dashed')).toBeNull();
    typeEdge('End', '0:01.5');
    expect(wordSpan(1)).toHaveClass('outline-dashed');
    expect(wordSpan(0)).not.toHaveClass('outline-dashed');
    // Only the selected clip's.
    deselect();
    expect(transcript().querySelector('.outline-dashed')).toBeNull();
  });

  describe('edge handles', () => {
    const handle = (edge: 'start' | 'end') =>
      within(transcript()).getByRole('slider', { name: edge === 'start' ? 'Clip start' : 'Clip end' });
    /** Drags a handle onto word `index`, at `fraction` of its width, and lets go. */
    function dragTo(edge: 'start' | 'end', index: number, fraction = 0, altKey = false) {
      const target = wordSpan(index);
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 100, 24));
      document.elementFromPoint = vi.fn(() => target);
      fireEvent.pointerDown(handle(edge), { button: 0 });
      fireEvent.pointerMove(document, { buttons: 1, clientX: 100 + fraction * 100, clientY: 60, altKey });
      fireEvent.pointerUp(document);
    }

    it('sits on the selected clip’s first and last words', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(wordSpan(0)).toContainElement(handle('start'));
      expect(wordSpan(1)).toContainElement(handle('end'));
      expect(handle('end')).toHaveAttribute('aria-valuetext', '0:03.0');
      deselect();
      expect(within(transcript()).queryByRole('slider')).not.toBeInTheDocument();
    });

    it('drags an edge word by word, then goes to it', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      playerMocks.handle.seek.mockClear();
      dragTo('end', 2);
      expect(edgeField('End')).toHaveValue('0:03.4');
      // A second before the end, to hear it.
      expect(playerMocks.handle.seek).toHaveBeenLastCalledWith(2_400);
      expect(handle('end').closest('[data-word]')).toBe(wordSpan(2));
    });

    it('shows the edge’s time and word while dragging', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const target = wordSpan(2);
      document.elementFromPoint = vi.fn(() => target);
      fireEvent.pointerDown(handle('end'), { button: 0 });
      fireEvent.pointerMove(document, { buttons: 1, clientX: 10, clientY: 10 });
      expect(within(transcript()).getByRole('tooltip')).toHaveTextContent('0:03.4 · “Cheap.”');
      fireEvent.pointerUp(document);
      expect(within(transcript()).queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('places an edge inside a word with Alt, to the tenth', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      dragTo('end', 2, 0.5, true);
      expect(edgeField('End')).toHaveValue('0:03.2');
    });

    it('keeps a dragged edge off the next clip and a second from the other edge', () => {
      liveReel(liveClip(900, 3_000), liveClip(4_900, 5_950, 1));
      render(<MomentsEditor debateId={DEBATE_ID} />);
      selectClip(1);
      dragTo('end', 4);
      expect(edgeField('End')).toHaveValue('0:03.0');
      dragTo('start', 2);
      expect(edgeField('Start')).toHaveValue('0:00.9');
    });

    it('scrolls the transcript while dragging near its edges', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const box = transcript();
      vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 360, 400));
      document.elementFromPoint = vi.fn(() => null);
      box.scrollTop = 100;
      fireEvent.pointerDown(handle('end'), { button: 0 });
      fireEvent.pointerMove(document, { buttons: 1, clientX: 50, clientY: 495 });
      expect(box.scrollTop).toBe(114);
      fireEvent.pointerMove(document, { buttons: 1, clientX: 50, clientY: 105 });
      expect(box.scrollTop).toBe(100);
      fireEvent.pointerUp(document);
    });

    it('steps an edge a word with the arrow keys, a tenth with Shift', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      fireEvent.keyDown(handle('end'), { key: 'ArrowRight' });
      expect(edgeField('End')).toHaveValue('0:03.4');
      fireEvent.keyDown(handle('end'), { key: 'ArrowLeft', shiftKey: true });
      expect(edgeField('End')).toHaveValue('0:03.3');
      fireEvent.keyDown(handle('start'), { key: 'ArrowRight' });
      expect(edgeField('Start')).toHaveValue('0:01.5');
    });

    it('follows the Snap toggle: off, a drag places the edge freely, and Alt snaps it', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      fireEvent.click(screen.getByRole('switch', { name: 'Snap to words' }));
      dragTo('end', 2, 0.5);
      expect(edgeField('End')).toHaveValue('0:03.2');
      dragTo('end', 2, 0.5, true);
      expect(edgeField('End')).toHaveValue('0:03.4');
    });

    it('keeps focus on a handle as its arrow keys step it from word to word', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      act(() => handle('end').focus());
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(handle('end').closest('[data-word]')).toBe(wordSpan(2));
      expect(handle('end')).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(handle('end').closest('[data-word]')).toBe(wordSpan(3));
      expect(handle('end')).toHaveFocus();
    });

    it('takes the click that ends a drag as the drag’s, not a click on the word', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const word = wordSpan(1);
      vi.spyOn(word, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 100, 24));
      document.elementFromPoint = vi.fn(() => word);
      fireEvent.pointerDown(handle('end'), { button: 0 });
      fireEvent.pointerMove(document, { buttons: 1, clientX: 150, clientY: 60, altKey: true });
      fireEvent.pointerUp(document);
      expect(playerMocks.handle.seek).toHaveBeenLastCalledWith(1_200);
      // Press on the handle, release on its word: the click lands on the word.
      fireEvent.click(word);
      expect(playerMocks.handle.seek).toHaveBeenLastCalledWith(1_200);
    });

    it('ends a drag whose release never came, as a move with no button held', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const target = wordSpan(2);
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 100, 24));
      document.elementFromPoint = vi.fn(() => target);
      fireEvent.pointerDown(handle('end'), { button: 0 });
      fireEvent.pointerMove(document, { buttons: 0, clientX: 100, clientY: 60 });
      fireEvent.pointerMove(document, { buttons: 1, clientX: 100, clientY: 60 });
      expect(edgeField('End')).toHaveValue('0:03.0');
    });

    it('ends a drag when the window loses focus mid-drag', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const before = (edgeField('End') as HTMLInputElement).value;
      const target = wordSpan(2);
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 100, 24));
      document.elementFromPoint = vi.fn(() => target);
      fireEvent.pointerDown(handle('end'), { button: 0 });
      // Cmd+Tab with the button held: no pointerup ever comes, and the button still reads as held.
      fireEvent.blur(window);
      fireEvent.pointerMove(document, { buttons: 1, clientX: 100, clientY: 60 });
      expect(edgeField('End')).toHaveValue(before);
    });

    it('ends a drag when the handles go mid-drag', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const before = (edgeField('End') as HTMLInputElement).value;
      const target = wordSpan(2);
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 100, 24));
      document.elementFromPoint = vi.fn(() => target);
      fireEvent.pointerDown(handle('end'), { button: 0 });
      const playReel = () =>
        fireEvent.click(
          within(screen.getByRole('region', { name: 'Reel' })).getByRole('button', { name: /Play reel|Stop/ })
        );
      // The reel starts with the button still held: the handles go.
      playReel();
      expect(within(transcript()).queryByRole('slider')).not.toBeInTheDocument();
      fireEvent.pointerMove(document, { buttons: 1, clientX: 100, clientY: 60 });
      // Back from the reel, the drag is over: a held move doesn't take the edge.
      playReel();
      fireEvent.pointerMove(document, { buttons: 1, clientX: 100, clientY: 60 });
      expect(edgeField('End')).toHaveValue(before);
    });

    it('gives a handle the range its edge can move in', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      expect(handle('start')).toHaveAttribute('aria-valuemin', '0');
      expect(handle('start')).toHaveAttribute('aria-valuemax', '2000');
      expect(handle('end')).toHaveAttribute('aria-valuemin', '2000');
      expect(handle('end')).toHaveAttribute('aria-valuemax', '5900');
    });

    it('offers no handles while the reel is read-only', () => {
      mocks.plan.data = entry({ refusal: 'media_job_active' });
      render(<MomentsEditor debateId={DEBATE_ID} />);
      selectClip(1);
      expect(wordSpan(0)).toHaveClass('bg-purple/25');
      expect(within(transcript()).queryByRole('slider')).not.toBeInTheDocument();
    });

    it('offers no handles or Set while the reel plays', () => {
      render(<MomentsEditor debateId={DEBATE_ID} />);
      fireEvent.click(within(screen.getByRole('region', { name: 'Reel' })).getByRole('button', { name: /Play reel/ }));
      expect(within(transcript()).queryByRole('slider')).not.toBeInTheDocument();
      selectWords(3, 4);
      expect(button(/^Set clip/)).not.toBeInTheDocument();
      expect(button('New clip from these words')).toBeInTheDocument();
    });
  });

  describe('scrolling to the selected clip', () => {
    /** Lays each word 100 px below the last, in a 400 px box. */
    function layOut() {
      const box = transcript();
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this === box) return new DOMRect(0, 0, 360, 400);
        const index = this.dataset.word;
        return index === undefined ? new DOMRect() : new DOMRect(0, Number(index) * 100 - box.scrollTop, 40, 24);
      });
      box.scrollTop = 0;
      return box;
    }

    it('brings a clip picked elsewhere into view, but not one picked in the transcript', () => {
      liveReel(liveClip(900, 3_000), liveClip(4_900, 5_950, 1));
      render(<MomentsEditor debateId={DEBATE_ID} />);
      const box = layOut();
      selectClip(2);
      // Word 3 at 300 px, a little over a fifth of the way down: 300 - 400 × 0.22.
      expect(box.scrollTop).toBe(212);
      box.scrollTop = 0;
      fireEvent.click(within(box).getByRole('button', { name: 'Select clip 1' }));
      expect(isSelected(1)).toBe(true);
      expect(box.scrollTop).toBe(0);
      fireEvent.click(wordSpan(3));
      expect(isSelected(2)).toBe(true);
      expect(box.scrollTop).toBe(0);
    });

    it('brings the selected clip back into view when the transcript comes back', () => {
      liveReel(liveClip(900, 3_000), liveClip(4_900, 5_950, 1));
      render(<MomentsEditor debateId={DEBATE_ID} />);
      selectClip(2);
      fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Replace' }));
      expect(screen.queryByTestId('reel-transcript')).not.toBeInTheDocument();
      const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        return this.dataset.word === '3' ? new DOMRect(0, 500, 40, 24) : new DOMRect(0, 0, 360, 400);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Back to the transcript' }));
      expect(spy).toHaveBeenCalled();
      expect(transcript().scrollTop).toBe(412);
    });
  });
});

// The 2b preview test (16 Nov): what the layout has to hold at the editor's real widths, beside the
// app's sidebar (~650 px at a 1280 px window). jsdom has no layout, so these pin the structure and
// classes that make it hold.
describe('MomentsEditor layout at real widths (GEO-3773 2b preview)', () => {
  const soClip = () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: null, claim_text: null },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 2, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
    wordsOverride = [
      { participant_slot: 1, start_ms: 1_000, end_ms: 1_200, text: 'So,' },
      { participant_slot: 1, start_ms: 1_300, end_ms: 2_900, text: 'coffee.' },
    ];
  };

  it('keeps a card’s length on one line: the name truncates, the quote clamps to two lines', () => {
    soClip();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    for (const n of [1, 2]) {
      const length = card(n).querySelector('[data-card-length]') as HTMLElement;
      expect(length.className).toMatch(/\bwhitespace-nowrap\b/);
      expect(length.className).toMatch(/\bflex-none\b/);
      expect(length.className).toMatch(/\btabular-nums\b/);
      const name = card(n).querySelector('[data-card-name]') as HTMLElement;
      expect(name.className).toMatch(/\btruncate\b/);
      expect(name.className).toMatch(/\bmin-w-0\b/);
    }
    const quote = card(2).querySelector('[data-card-quote]') as HTMLElement;
    expect(quote.className).toMatch(/\bline-clamp-2\b/);
    // An edit adds "Edited": it doesn't shrink either, so the name gives way instead of the length.
    typeEdge('End', '2.9', 1);
    const edited = within(card(1)).getByText('Edited');
    expect(edited.className).toMatch(/\bflex-none\b/);
  });

  it('gives a card’s warning icon a tooltip with the warning', async () => {
    soClip();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const icon = card(1).querySelector('[data-card-warning]') as HTMLElement;
    expect(within(icon).getByRole('img', { name: '1 warning' })).toBeInTheDocument();
    fireEvent.pointerMove(icon, { pointerType: 'mouse' });
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Clip 1 opens on “So”'));
  });

  it('names the Snap switch', () => {
    soClip();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(within(clipPanel()).getByRole('switch', { name: 'Snap to words' })).toBeInTheDocument();
  });

  it('lets the clip bar wrap: the actions take a row of their own, and the warning truncates with a tooltip', () => {
    soClip();
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const bar = within(clipPanel()).getByTestId('clip-bar');
    expect(bar.className).toMatch(/\bflex-wrap\b/);
    expect(bar.className.split(' ')).not.toContain('h-10');
    const about = bar.querySelector('[data-clip-bar-about]') as HTMLElement;
    const actions = bar.querySelector('[data-clip-bar-actions]') as HTMLElement;
    expect([...bar.children]).toEqual([about, actions]);
    expect(about.className).toMatch(/\bmin-w-0\b/);
    // The actions wrap again rather than run past the panel's edge.
    expect(actions.className).toMatch(/\bflex-wrap\b/);
    expect(actions.className).toMatch(/\bmax-w-full\b/);
    for (const name of ['Play clip', 'Replace', 'Remove', 'Advanced', 'Full debate']) {
      expect(actions.contains(within(bar).getByRole('button', { name: new RegExp(name) }))).toBe(true);
    }
    // The warning and its fix sit with what the clip is, never under the actions.
    const fix = within(bar).getByRole('button', { name: 'Start on “coffee.”' });
    expect(about.contains(fix)).toBe(true);
    expect(fix.className).toMatch(/\bflex-none\b/);
    const text = bar.querySelector('[data-clip-bar-warning]') as HTMLElement;
    expect(text).toHaveTextContent('Clip 1 opens on “So”');
    expect(text.className).toMatch(/\btruncate\b/);
    expect(text.className).toMatch(/\bmin-w-\[4rem\]/);
    act(() => text.focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Clip 1 opens on “So”');
  });

  it('keeps the header’s actions on the title’s row, at its right, with the title truncating', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const header = screen.getByRole('banner');
    const title = header.querySelector('[data-header-title]') as HTMLElement;
    const actions = header.querySelector('[data-header-actions]') as HTMLElement;
    expect([...header.children]).toEqual([title, actions]);
    // Wraps only when the editor stacks (narrow windows).
    expect(header.className.split(' ')).not.toContain('flex-wrap');
    expect(title.className).toMatch(/\bflex-1\b/);
    expect(title.className).toMatch(/\bmin-w-0\b/);
    expect(actions.className).toMatch(/\bflex-none\b/);
    expect(actions.className.split(' ')).not.toContain('flex-wrap');
    expect(within(title).getByRole('heading', { level: 1 }).className).toMatch(/\btruncate\b/);
    expect(actions.contains(within(header).getByRole('link', { name: /View debate/ }))).toBe(true);
    for (const name of ['Reel options', 'Publish']) {
      expect(actions.contains(within(header).getByRole('button', { name }))).toBe(true);
    }
  });

  it('caps the claim menu to the window and scrolls inside it', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(within(card(1)).getByRole('button', { name: /^Claim: / }));
    const menu = document.querySelector('[data-claim-menu]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.className).toContain('max-h-[min(420px,var(--radix-popover-content-available-height))]');
    expect(menu.className).toMatch(/\boverflow-y-auto\b/);
  });
});

describe('zooming the fine-tune waveform on an edge (GEO-3773)', () => {
  beforeEach(() => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [
          { start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' },
          { start_ms: 4_800, end_ms: 5_600, speaker_slot: 1, claim_index: 1, claim_text: 'Dinner shows effort' },
        ],
      },
    });
  });
  const focusGroup = () => within(clipPanel()).getByRole('group', { name: 'Focus' });
  const focusOn = (name: 'Clip' | 'Start' | 'End') =>
    fireEvent.click(within(focusGroup()).getByRole('button', { name }));
  const focused = () =>
    within(focusGroup())
      .getAllByRole('button')
      .filter(button => button.getAttribute('aria-pressed') === 'true')
      .map(button => button.textContent);
  const shownWindow = () => screen.getByTestId('waveform-track').getAttribute('data-window');
  /** The edge's time over its steppers, which zooms on it when clicked. */
  const edgeTime = (edge: 'Start' | 'End') =>
    within(clipPanel()).getByRole('button', { name: new RegExp(`^${edge} \\d`) });

  it('starts on the whole clip, beside the zoom, and centres on either edge from the Focus control', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: '±1 s' }));
    expect(focused()).toEqual(['Clip']);
    // Clip 1 is 0.9-3 s: ±1 s around all of it, kept inside the debate.
    expect(shownWindow()).toBe('0-4000');
    focusOn('Start');
    expect(focused()).toEqual(['Start']);
    expect(shownWindow()).toBe('0-1900');
    focusOn('End');
    expect(focused()).toEqual(['End']);
    expect(shownWindow()).toBe('2000-4000');
    // The zoom applies around the edge too.
    fireEvent.click(within(clipPanel()).getByRole('button', { name: '±2 s' }));
    expect(shownWindow()).toBe('1000-5000');
    focusOn('Clip');
    expect(shownWindow()).toBe('0-5000');
  });

  it('zooms on an edge when its time is clicked', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(edgeTime('End'));
    expect(focused()).toEqual(['End']);
    expect(shownWindow()).toBe('1000-5000');
    expect(edgeTime('End')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(edgeTime('Start'));
    expect(focused()).toEqual(['Start']);
    expect(edgeTime('Start')).toHaveAttribute('aria-pressed', 'true');
    expect(edgeTime('End')).toHaveAttribute('aria-pressed', 'false');
  });

  it('zooms on an edge when it is stepped a word, and still steps it', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'End one word later' }));
    expect(focused()).toEqual(['End']);
    // The end steps from "dates" (2.9 s) on to "Dinner" (5.4 s), and the window follows it.
    expect(screen.getByTestId('waveform-readout')).toHaveTextContent('End 0:05.40');
    // ±2 s around it, kept inside the debate (it ends with clip 2, at 5.6 s).
    expect(shownWindow()).toBe('3400-5600');
    fireEvent.click(within(clipPanel()).getByRole('button', { name: 'Start one word earlier' }));
    expect(focused()).toEqual(['Start']);
  });

  it('goes back to the whole clip when another clip is selected, or the same one again', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    focusOn('End');
    selectClip(2);
    expect(isSelected(2)).toBe(true);
    expect(focused()).toEqual(['Clip']);
    // Clip 2 is 4.8-5.6 s, ±2 s.
    expect(shownWindow()).toMatch(/^2800-/);
    focusOn('Start');
    deselect();
    selectClip(2);
    expect(focused()).toEqual(['Clip']);
  });
});
