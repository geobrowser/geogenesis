import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import type { MomentBackfillEntry, MomentBackfillStatus } from './api';
import { MomentsEditor, claimsBySpeaker, editingBlockedReason } from './moments-editor';

const DEBATE_ID = '01a0448a-61d3-7101-8434-a20fdadf6f97';

let wordsOverride: unknown[] | null = null;

const mocks = vi.hoisted(() => ({
  backfill: {} as { isPending: boolean; error: unknown; data: { request: unknown; entry: unknown } | undefined },
  plan: {} as { isSuccess: boolean; data: unknown; error: unknown },
  mutate: vi.fn(),
  toast: vi.fn(),
  /** The claims payload's `moment_reel_manual`: the reel's lock, whoever published it. */
  manualReel: false,
}));

vi.mock('../hooks', () => ({
  useDebateTranscript: () => ({
    isPending: false,
    data: {
      word_timing: true,
      words: wordsOverride ?? [
        { participant_slot: 1, start_ms: 1_000, end_ms: 1_400, text: 'Coffee' },
        { participant_slot: 1, start_ms: 1_500, end_ms: 2_900, text: 'dates' },
        { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
      ],
    },
  }),
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
  useDebateMedia: () => ({ isSuccess: true, data: { turn_segments: [] } }),
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
        ],
        moments: [{ claim_index: 0, clip_start_ms: 1_000, clip_end_ms: 3_000 }],
        ...(mocks.manualReel && { moment_reel_manual: true }),
      },
    },
  }),
}));

vi.mock('./hooks', () => ({
  isMediaAdminRefusal: (error: unknown) => error instanceof GeoChatRequestError && error.status === 403,
  useMomentBackfill: () => mocks.backfill,
  useMomentReelPlan: () => mocks.plan,
  useQueueMomentReel: () => ({ mutate: mocks.mutate, isPending: false }),
  useRefreshAfterReel: () => () => {},
}));

vi.mock('../browse/debate-feed-player', () => ({ DebateFeedPlayer: () => <div data-testid="player" /> }));
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
  mocks.manualReel = false;
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
    expect(screen.queryByRole('button', { name: /^Publish reel/ })).not.toBeInTheDocument();
  });

  it('opens on the live cuts when geo-chat serves them, on the player’s clock', () => {
    mocks.plan.data = entry({
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 1, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:00.9');
    expect(screen.getByText('Coffee dates')).toBeInTheDocument();
    expect(screen.getByText('Susan Winter')).toBeInTheDocument();
    expect(screen.queryByText(/times are approximate/)).not.toBeInTheDocument();
  });

  it('falls back to the served moments with a note that their times are approximate', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText(/start and end times are\s+approximate/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:01.0');
  });

  it('is read-only, and says why, when the dry run refuses the debate', () => {
    mocks.plan.data = entry({ refusal: 'media_job_active' });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText(/still being processed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Start time' })).toBeDisabled();
  });

  it('never says the reel is live while it is only queued', () => {
    mocks.backfill.data = { request: status({ status: 'queued' }), entry: null };
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Queued · live reel unchanged')).toBeInTheDocument();
    expect(screen.queryByText(/is live/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
  });

  it('publishes on the player’s clock, from the version it opened on, keeping the claim the clip plays for', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    // 1.45 s is in silence after "Coffee", so it stays.
    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:01.5');
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
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
    fireEvent.change(screen.getAllByRole('textbox', { name: 'End time' })[0], { target: { value: '1.45' } });
    fireEvent.blur(screen.getAllByRole('textbox', { name: 'End time' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));

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
    expect(within(clipRow('Dinner')).getByText('no words are said in it')).toBeInTheDocument();
    expect(screen.getByText(/See clip 2\./)).toBeInTheDocument();

    fireEvent.click(within(clipRow('Coffee')).getByRole('button', { name: 'Remove' }));
    expect(within(clipRow('Dinner')).getByText('no words are said in it')).toBeInTheDocument();
    // The notice numbers it as the reel does now.
    expect(screen.getByText(/See clip 1\./)).toBeInTheDocument();
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
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
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
    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:01.8');
    expect(screen.getByRole('button', { name: /^Publish reel/ })).toBeDisabled();
  });

  // A poll that fails after the first answer keeps its data; the editor, and what was typed, stay.
  it('keeps the editor and its unsaved edits when a later read fails', () => {
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));

    mocks.backfill = { ...mocks.backfill, error: new GeoChatRequestError('down', 'unavailable', 503) };
    mocks.plan = { ...mocks.plan, isSuccess: false, error: new Error('down') };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);

    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:01.5');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  // The selection follows the clip, not its place: removing an earlier clip must not hand the
  // transcript's "Start clip N here" to the clip that moved into its place.
  it('keeps the selected clip selected when an earlier clip is removed', () => {
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
    fireEvent.click(screen.getByText('dates', { selector: 'p' }));
    expect(clipRow('dates')).toHaveAttribute('aria-current', 'true');

    fireEvent.click(within(clipRow('Coffee')).getByRole('button', { name: 'Remove' }));
    expect(clipRow('dates')).toHaveAttribute('aria-current', 'true');
    expect(clipRow('Dinner')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Clip 1 selected')).toBeInTheDocument();
  });

  it('snaps a typed edge that falls mid-word out to the whole word', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '2.0' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:02.9');
  });

  it('offers Return to automatic only for a hand-picked reel, and sends the version with it', () => {
    mocks.plan.data = entry({ hand_picked: { requested_by: 'space', requested_at: '2026-11-11T19:00:00Z' } });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Hand-picked · locked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and re-pick' }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { unlock: true, reason: 'Moments editor: return to automatic', base: 'v1' },
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

/** The reel's row for the clip whose quote starts with `word`. */
function clipRow(word: string) {
  return screen.getByText(new RegExp(`^${word}`), { selector: 'p' }).closest('li') as HTMLElement;
}

describe('claimsBySpeaker', () => {
  // geo-chat's moment_claims skips a retained claim, and refuses a clip that names one.
  it('leaves out a retained claim', () => {
    const { bySlot, slot } = claimsBySpeaker({
      turns: [{ turn_index: 0, participant_slot: 1 }],
      claims: [
        { text: 'From an earlier extraction', turn_index: 0, retained: true },
        { text: 'Coffee is low stakes', turn_index: 0 },
      ],
    });
    expect(bySlot.get(1)).toEqual([{ index: 1, text: 'Coffee is low stakes' }]);
    expect(slot.has(0)).toBe(false);
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
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:01.3');
    expect(screen.queryByText('Clip 1 opens on “So”')).not.toBeInTheDocument();
    // A warning never disables publishing.
    expect(screen.getByRole('button', { name: /^Publish reel/ })).toBeEnabled();
  });
});
