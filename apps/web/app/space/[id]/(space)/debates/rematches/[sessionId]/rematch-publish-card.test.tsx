import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import type { PublishOptOutOffer, ThankingDebate } from '~/core/debates/thanking-debate-store';

const mocks = vi.hoisted(() => ({
  offer: { debateId: null, busy: false, cancelled: false, upload: null, percent: null } as PublishOptOutOffer,
  setThankingDebate: vi.fn(),
  setPublishOptOutRequest: vi.fn(),
  // A synchronized clock reading the (faked) device time; `roundTripMs: null` is a failed sync.
  clock: null as { now: () => number; roundTripMs: number | null } | null,
}));

vi.mock('~/core/debates/thanking-debate-store', () => ({
  usePublishOptOutOffer: () => mocks.offer,
  useSetPublishOptOutRequest: () => mocks.setPublishOptOutRequest,
  useSetThankingDebate: () => mocks.setThankingDebate,
}));

// The server sync has its own tests; here it answers with whatever clock a case sets.
vi.mock('~/core/debates/matchmaking/use-request-countdown', () => ({ useServerClock: () => mocks.clock }));

const { RematchPublishCard, publishCardState } = await import('./rematch-publish-card');

const NOW = Date.parse('2026-07-02T00:00:25.000Z');

function debate(overrides: Partial<Debate> = {}): Debate {
  return {
    id: 'debate-1',
    status: 'complete',
    claim: { claim: 'Nuclear power is necessary to hit 2040 climate targets.' },
    turn_ends_at: '2026-07-02T00:00:40.000Z',
    completed_at: '2026-07-02T00:00:22.000Z',
    recordings: [],
    recording_cancelled_at: null,
    recording_cancelled_by: null,
    ...overrides,
  } as Debate;
}

/** A server recording for one debater's slot; only the slot matters to the card. */
const recording = (participant_slot: 1 | 2) =>
  ({ participant_slot, user_id: participant_slot === 1 ? 'user-a' : 'user-b' }) as Debate['recordings'][number];

function renderCard(overrides: Partial<Debate> = {}) {
  return render(<RematchPublishCard debate={debate(overrides)} currentUserId="user-a" opponentName="Jenna" />);
}

const lastPublished = (): ThankingDebate | null => mocks.setThankingDebate.mock.calls.at(-1)?.[0] ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.offer = { debateId: null, busy: false, cancelled: false, upload: null, percent: null };
  mocks.setThankingDebate.mockClear();
  mocks.setPublishOptOutRequest.mockClear();
  mocks.clock = { now: () => Date.now(), roundTripMs: 40 };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RematchPublishCard', () => {
  it('reports the upload, and asks the coordinator to cancel', () => {
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploading', percent: 40 };
    renderCard();

    expect(screen.getByText('Publishing your debate')).toBeInTheDocument();
    // Nothing to wave away while the recording can still be withdrawn.
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('aria-valuenow', '40');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // The request, not the cancellation: the coordinator owns the confirmation and the upload.
    expect(mocks.setPublishOptOutRequest).toHaveBeenCalledWith('debate-1');
  });

  it('tells the coordinator it carries the cancel, so the banner drops its own', () => {
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploading', percent: null };
    renderCard();

    expect(lastPublished()).toEqual({
      debateId: 'debate-1',
      hasPendingLocalRecording: false,
      hasUploadedRecording: false,
      recordingCancelled: false,
      showsPublishControl: true,
      cancelWindowOpen: true,
    });
  });

  it('calls it published once both recordings are in, and keeps offering the cancel', () => {
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploaded', percent: null };
    renderCard({ recordings: [recording(1), recording(2)] });

    expect(screen.getByText('Debate published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('can be dismissed once the debate is published', () => {
    renderCard({ recordings: [recording(1), recording(2)] });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('rematch-publish-card')).toBeNull();
  });

  // Copilot on #2853: a debate plays only with both slots, so one recording in is not published.
  it.each([
    ['the other debater’s', [recording(2)]],
    ['this device’s', [recording(1)]],
  ])('still says publishing when only %s recording is in', (_label, recordings) => {
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: null, percent: null };
    renderCard({ recordings });

    expect(screen.getByText('Publishing your debate')).toBeInTheDocument();
    expect(screen.queryByText('Debate published')).toBeNull();
  });

  it('holds the button while a cancel is already being sent', () => {
    mocks.offer = { debateId: 'debate-1', busy: true, cancelled: false, upload: 'uploading', percent: null };
    renderCard();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  // geo-chat refuses a cancel after the thank-you deadline; the card stays, the button goes.
  it('drops the cancel when geo-chat stops accepting one, and keeps the card', () => {
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploading', percent: null };
    renderCard();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15_100);
    });

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByText('Publishing your debate')).toBeInTheDocument();
    expect(lastPublished()).toEqual(expect.objectContaining({ cancelWindowOpen: false, showsPublishControl: false }));
  });

  // Copilot on #2853: a failed sync falls back to this device's clock, which can run ahead of the
  // server's. Only a synchronized clock may close the window; geo-chat enforces its own otherwise.
  it.each([
    ['the clock sync failed and this device runs a minute fast', { now: () => Date.now(), roundTripMs: null }],
    ['the clock sync has not answered yet', null],
  ])('keeps the cancel while %s', (_label, clock) => {
    mocks.clock = clock;
    vi.setSystemTime(NOW + 60_000);
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploading', percent: null };
    renderCard();

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(lastPublished()).toEqual(expect.objectContaining({ cancelWindowOpen: true }));
  });

  it('closes the window on a synchronized clock that is past the deadline', () => {
    vi.setSystemTime(NOW + 60_000);
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploading', percent: null };
    renderCard();

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('says the debate was not published once the viewer withdraws it', () => {
    mocks.offer = { debateId: null, busy: false, cancelled: true, upload: null, percent: null };
    renderCard();

    expect(screen.getByText('Debate not published')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  // No modal over a live voice room: the news goes in the card.
  it('says so when the other debater withdrew it, and can be dismissed', () => {
    renderCard({ recording_cancelled_at: '2026-07-02T00:00:24.000Z', recording_cancelled_by: 'user-b' });

    expect(screen.getByText('Jenna cancelled publishing')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('rematch-publish-card')).toBeNull();
  });

  it('draws nothing when there is no recording to report or withdraw', () => {
    renderCard();

    expect(screen.queryByTestId('rematch-publish-card')).toBeNull();
    expect(lastPublished()).toEqual(expect.objectContaining({ debateId: 'debate-1', showsPublishControl: false }));
  });

  it('stops speaking for the debate when the picker goes', () => {
    mocks.offer = { debateId: 'debate-1', busy: false, cancelled: false, upload: 'uploading', percent: null };
    const view = renderCard();

    view.unmount();

    expect(mocks.setThankingDebate).toHaveBeenLastCalledWith(null);
  });
});

describe('publishCardState', () => {
  const base = {
    offer: { cancelled: false, upload: null },
    recordingCancelled: false,
    cancelledBy: null,
    currentUserId: 'user-a',
    hasUploadedRecording: false,
    published: false,
  } as const;

  it('reads a debate the server already has both recordings for as published', () => {
    expect(publishCardState({ ...base, hasUploadedRecording: true, published: true })).toBe('published');
  });

  it('reads a finished local upload as still publishing until the debate is', () => {
    expect(publishCardState({ ...base, offer: { cancelled: false, upload: 'uploaded' } })).toBe('publishing');
  });

  it('reads a recording still being written to this device as publishing', () => {
    expect(publishCardState({ ...base, offer: { cancelled: false, upload: 'preparing' } })).toBe('publishing');
  });

  it('puts a withdrawal ahead of any upload state', () => {
    expect(
      publishCardState({
        ...base,
        offer: { cancelled: false, upload: 'uploaded' },
        published: true,
        recordingCancelled: true,
      })
    ).toBe('cancelled_by_you');
  });
});
