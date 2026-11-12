import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import type { MomentBackfillEntry, MomentBackfillStatus } from './api';
import { MomentsEditor, claimsBySpeaker, editingBlockedReason, keepClaimWithSpeaker } from './moments-editor';

const DEBATE_ID = '01a0448a-61d3-7101-8434-a20fdadf6f97';

let wordsOverride: unknown[] | null = null;
/** The transcript's `sentences`, served only when a test sets them. */
let sentencesOverride: unknown[] | null = null;

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
}));

vi.mock('../hooks', () => ({
  useDebateTranscript: () =>
    mocks.transcriptFailed
      ? { isPending: false, data: undefined, error: new Error('down') }
      : {
          isPending: false,
          data: {
            word_timing: true,
            words: wordsOverride ?? [
              { participant_slot: 1, start_ms: 1_000, end_ms: 1_400, text: 'Coffee' },
              { participant_slot: 1, start_ms: 1_500, end_ms: 2_900, text: 'dates' },
              { participant_slot: 2, start_ms: 5_000, end_ms: 5_400, text: 'Dinner' },
            ],
            ...(sentencesOverride && { sentences: sentencesOverride }),
          },
        },
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
  useMomentBackfill: () => mocks.backfill,
  useMomentReelPlan: () => mocks.plan,
  useQueueMomentReel: () => ({ mutate: mocks.mutate, isPending: false }),
  useRefreshAfterReel: () => mocks.refresh,
}));

vi.mock('../browse/debate-feed-player', () => ({
  DebateFeedPlayer: ({ onPlayheadChange }: { onPlayheadChange?: (seconds: number) => void }) => {
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
      fireEvent.change(screen.getAllByRole('textbox', { name: 'End time' })[0], { target: { value: '1.45' } });
      fireEvent.blur(screen.getAllByRole('textbox', { name: 'End time' })[0]);
      fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
      fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));

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
      expect(within(clipRow('Coffee')).getByText('its speaker has no claim to link it to')).toBeInTheDocument();
      expect(within(clipRow('Dinner')).getByText('its speaker has no claim to link it to')).toBeInTheDocument();
      expect(screen.getByText(/See clips 1, 2\./)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Publish reel/ })).toBeDisabled();
    };

    it('clears a clip’s reported problem once its claim is changed, and keeps the untouched clip’s', () => {
      failPublish();
      pickClaim(clipRow('Coffee'), 'Closest claim (automatic)');

      expect(within(clipRow('Coffee')).queryByText('its speaker has no claim to link it to')).not.toBeInTheDocument();
      // The clip left alone still blocks, and is the only one the notice points at.
      expect(within(clipRow('Dinner')).getByText('its speaker has no claim to link it to')).toBeInTheDocument();
      expect(screen.getByText(/See clip 2\./)).toBeInTheDocument();
      expect(screen.queryByText(/See clips/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Publish reel/ })).toBeDisabled();
    });

    it('lets the reel be published again once every flagged clip is changed', () => {
      failPublish();
      pickClaim(clipRow('Coffee'), 'Closest claim (automatic)');
      fireEvent.change(screen.getAllByRole('textbox', { name: 'End time' })[1], { target: { value: '5.5' } });
      fireEvent.blur(screen.getAllByRole('textbox', { name: 'End time' })[1]);

      expect(screen.queryByText('its speaker has no claim to link it to')).not.toBeInTheDocument();
      expect(screen.queryByText(/See clip/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Publish reel/ })).toBeEnabled();
    });

    it('flags a changed clip again once it is changed back to what was sent', () => {
      failPublish();
      pickClaim(clipRow('Coffee'), 'Closest claim (automatic)');
      pickClaim(clipRow('Coffee'), 'Coffee is low stakes');

      expect(within(clipRow('Coffee')).getByText('its speaker has no claim to link it to')).toBeInTheDocument();
      expect(screen.getByText(/See clips 1, 2\./)).toBeInTheDocument();
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

  // A drag commits every move; one that passes over the other debater's words must not lose the
  // clip's claim once it is back on its own speaker.
  it('gives a dragged clip its claim back when the drag returns to its speaker', () => {
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
    // The track is as wide in px as the debate is long in ms (5.6 s: the last clip's end).
    vi.spyOn(screen.getByTestId('reel-track'), 'getBoundingClientRect').mockReturnValue({
      width: 5_600,
      left: 0,
    } as DOMRect);
    const block = screen.getByRole('button', { name: 'Clip 2' });
    fireEvent.pointerDown(block, { clientX: 4_800, pointerId: 1 });
    // Over Susan's words: clip 2 is hers for now, so Urban's claim can't ride along.
    fireEvent.pointerMove(block, { clientX: 1_300, pointerId: 1 });
    expect(within(clipRow('Coffee', 1)).getByText(/Live now for/)).toBeInTheDocument();
    // Still hers on the next move: the claim the drag started with is judged again, not given back.
    fireEvent.pointerMove(block, { clientX: 1_350, pointerId: 1 });
    expect(within(clipRow('Coffee', 1)).getByText(/Live now for/)).toBeInTheDocument();
    fireEvent.pointerMove(block, { clientX: 4_800, pointerId: 1 });
    fireEvent.pointerUp(block, { pointerId: 1 });

    expect(within(clipRow('Dinner')).queryByText(/Live now for/)).not.toBeInTheDocument();
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
    vi.spyOn(screen.getByTestId('reel-track'), 'getBoundingClientRect').mockReturnValue({
      width: 5_600,
      left: 0,
    } as DOMRect);
    const handle = screen.getByTestId('clip-0-end-handle');
    fireEvent.pointerDown(handle, { clientX: 3_000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 3_100, pointerId: 1, altKey: true });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.getAllByRole('textbox', { name: 'End time' })[0]).toHaveValue('0:03.1');

    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
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
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Start time' })[1], { target: { value: '5.0' } });
    fireEvent.blur(screen.getAllByRole('textbox', { name: 'Start time' })[1]);

    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
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
  it('publishes an edit made while another request ran on the version it was made on', () => {
    const requestedAt = '2026-11-11T19:00:00Z';
    mocks.backfill.data = { request: status({ status: 'running', requested_at: requestedAt }), entry: null };
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));

    mocks.backfill.data = { request: status({ status: 'done', requested_at: requestedAt }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.plan = { ...mocks.plan, data: entry({ reel_version: 'v2' }) };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
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
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Start time' }), { target: { value: '0.5' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Start time' }));

    mocks.backfill.data = { request: status({ requested_at: requestedAt, status: 'done' }), entry: null };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.plan = { ...mocks.plan, data: entry({ reel_version: 'v2' }) };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    mocks.mutate.mockReset();
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
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
    const notice = screen.getByText(/A re-render couldn.t keep this hand-picked reel/).closest('[role="status"]');
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
    expect(screen.getByText(/still cut on the video from before it, so they can't be edited/)).toHaveTextContent(
      /Nothing is queued to cut it again\. To pick it again, return it to automatic/
    );
    // Said once: the worker's notice lists what it found, and leaves the way out to the reason above.
    expect(screen.getAllByText(/return it to automatic/i)).toHaveLength(1);
    expect(screen.getByText('Clip 1: its speaker has no claim to link it to')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'End time' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Return to automatic' }));
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
    expect(screen.getByText(/still cut on the video from before it/)).toHaveTextContent(
      /in the queue; this page updates when it's done/
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

    const notice = screen.getByText(/couldn.t be carried over after a re-render/).closest('[role="status"]');
    expect(notice).toHaveTextContent(
      "This hand-picked reel couldn't be carried over after a re-render, so the debate has no reel. Pick new clips, or return to automatic."
    );
    expect(notice).toHaveTextContent('Lost reel, clip 1: its speaker has no claim to link it to');
    expect(screen.queryByText(/moved the video/)).not.toBeInTheDocument();
    // The served moments still name a clip; it is not opened as if it played.
    expect(screen.queryByRole('textbox', { name: 'Start time' })).not.toBeInTheDocument();
    expect(screen.queryByText(/times are\s+approximate/)).not.toBeInTheDocument();
    expect(screen.getByText('Locked · no reel')).toBeInTheDocument();
    expect(screen.queryByText('Hand-picked · locked')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Return to automatic' }));
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
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  // The reel changed under the edit; Discard goes back to the reel that is live now, on its version.
  it('discards an edit to the reel that is live now, not the one the page opened on', () => {
    const live = (start: number, end: number) => ({
      clock: 'video' as const,
      clips: [{ start_ms: start, end_ms: end, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
    });
    mocks.plan.data = entry({ live_reel: live(900, 3_000) });
    const { rerender } = render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    mocks.plan = { ...mocks.plan, data: entry({ reel_version: 'v2', live_reel: live(1_000, 2_900) }) };
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:01.5');

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:01.0');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
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
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish (and lock|anyway)$/ }));
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
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
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
    expect(screen.getByText(/still cut on the video from before it/)).toHaveTextContent(
      /discard your changes, then return it to automatic/
    );
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByText(/still cut on the video from before it/)).not.toHaveTextContent(/discard your changes/);
    expect(screen.getByRole('button', { name: 'Return to automatic' })).toBeInTheDocument();
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
    const notice = screen.getByText(/couldn.t be carried over after a re-render/).closest('[role="status"]');
    expect(notice).toHaveTextContent(/in the queue; you can pick new clips or return to automatic once it's done/);
    expect(notice).not.toHaveTextContent('Pick new clips, or return to automatic.');
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();
  });

  it('leaves the way out of a debate locked without a reel to the read-only reason', () => {
    mocks.manualReel = true;
    mocks.transcriptFailed = true;
    mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const notice = screen.getByText(/couldn.t be carried over after a re-render/).closest('[role="status"]');
    expect(notice).not.toHaveTextContent(/Pick new clips|return to automatic/);
    expect(screen.getByText(/Couldn't load this debate's transcript/)).toBeInTheDocument();
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
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:01.4');

    mocks.turns = [turn(0)];
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:00.9');
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
    const end = screen.getByRole('textbox', { name: 'End time' });
    fireEvent.change(end, { target: { value: '3.3' } });
    fireEvent.blur(end);
    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:03.3');

    mocks.turns = [turn(0)];
    mocks.plan.data = entry({
      reel_version: 'v2',
      live_reel: {
        clock: 'video',
        clips: [{ start_ms: 900, end_ms: 3_000, speaker_slot: 0, claim_index: 0, claim_text: 'Coffee is low stakes' }],
      },
    });
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:01.4');
    expect(screen.getByRole('textbox', { name: 'End time' })).toHaveValue('0:03.3');
    fireEvent.click(screen.getByRole('button', { name: /Publish reel/ }));
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
    expect(screen.getByText(/still cut on the video from before it/)).toHaveTextContent(
      /the times and words shown for them are approximate/
    );
    expect(screen.queryByText('Nobody says a whole word in it.')).not.toBeInTheDocument();
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
    expect(screen.getByRole('textbox', { name: 'Start time' })).toBeInTheDocument();
    expect(screen.queryByText(/Only 1 clip/)).not.toBeInTheDocument();
    expect(screen.queryByText(/to check/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No warnings/)).not.toBeInTheDocument();
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
    expect(screen.queryByText('Nobody says a whole word in it.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Only 1 clip/)).not.toBeInTheDocument();

    mocks.plan.data = entry({ reel_version: 'v2', live_reel: { clock: 'video', clips } });
    rerender(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByText(/still cut on the video from before it/)).not.toBeInTheDocument();
    expect(screen.getByText('Nobody says a whole word in it.')).toBeInTheDocument();
    expect(screen.getByText(/Only 1 clip/)).toBeInTheDocument();
  });

  // Return to automatic waits until an edit is gone, so a debate locked without a reel and with an
  // edit on it points to publishing the edit or discarding it, not to a button it hides.
  it('points a debate locked without a reel, with an edit on it, to publishing or discarding it', () => {
    mocks.manualReel = true;
    mocks.plan.data = entry({ reel_unlinkable: true, live_reel: null });
    mocks.playheadSeconds = 1;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByText(/Pick new clips, or return to automatic/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add clip at playhead/ }));
    expect(screen.queryByRole('button', { name: 'Return to automatic' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pick new clips, or return to automatic/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Publish the clips you've picked, or discard them to return to automatic/)
    ).toBeInTheDocument();
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
    expect(screen.getByRole('combobox')).toHaveTextContent('Coffee was the plan (earlier extraction)');
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    expect(screen.getByRole('combobox')).toHaveTextContent('Coffee was the plan (earlier extraction)');
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
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
    expect(screen.getByText(/Couldn't load this debate's transcript/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'End time' })).toBeDisabled();
  });

  it('closes the publish confirm when an edit under it breaks a clip', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
    expect(screen.getByRole('alertdialog', { name: 'Publish this reel?' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '0.5' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('closes the return-to-automatic confirm once the reel is edited', () => {
    mocks.manualReel = true;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Return to automatic' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'End time' }), { target: { value: '1.45' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'End time' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the edge as it stands when a typed time snaps back to it', () => {
    render(<MomentsEditor debateId={DEBATE_ID} />);
    const end = () => screen.getByRole('textbox', { name: 'End time' });
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
    const { unmount } = render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.getByRole('button', { name: 'Add clip at playhead' })).toBeDisabled();
    unmount();

    mocks.playheadSeconds = 4;
    render(<MomentsEditor debateId={DEBATE_ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add clip at playhead' }));
    expect(screen.getAllByRole('textbox', { name: 'Start time' })).toHaveLength(2);
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
    expect(screen.queryByRole('textbox', { name: 'Start time' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add clip at playhead' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'New clip here' })[1]);
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:05.0');
    expect(screen.getByText('Clip 1 selected')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('offers no new clip from the transcript while the reel is read-only', () => {
    sentencesOverride = [{ participant_slot: 1, start_ms: 1_000, end_ms: 2_900, text: 'Coffee dates.' }];
    mocks.plan.data = entry({ refusal: 'media_job_active' });
    render(<MomentsEditor debateId={DEBATE_ID} />);
    expect(screen.queryByRole('button', { name: 'New clip here' })).not.toBeInTheDocument();
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

/** The reel's row for the clip whose quote starts with `word` (the `nth` such row). */
function clipRow(word: string, nth = 0) {
  return screen.getAllByText(new RegExp(`^${word}`), { selector: 'p' })[nth].closest('li') as HTMLElement;
}

/** Picks a clip's claim from its menu. */
function pickClaim(row: HTMLElement, label: string) {
  fireEvent.keyDown(within(row).getByRole('combobox'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: label }));
}

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
    expect(screen.getByRole('textbox', { name: 'Start time' })).toHaveValue('0:01.3');
    expect(screen.queryByText('Clip 1 opens on “So”')).not.toBeInTheDocument();
    // A warning never disables publishing.
    expect(screen.getByRole('button', { name: /^Publish reel/ })).toBeEnabled();
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
    fireEvent.click(screen.getByRole('button', { name: /^Publish reel/ }));
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
