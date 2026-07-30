import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateNotPublishableError, listSweepCandidateDebateIds, loadDebatePublishSource } from './debate-source';

const DEBATE_ID = '019f89dc2124799193daafd5bc4ffa0a';

function debateBody(overrides: Record<string, unknown> = {}) {
  return {
    id: DEBATE_ID,
    status: 'complete',
    claim: { space_id: 'c9f267dcb0d270718c2a3c45a64afd32', claim_entity_id: 'claim-1', claim: 'A claim' },
    participants: [
      { profile_space_id: 'space-1', display_name: 'Specter', position: true, participant_slot: 1 },
      { profile_space_id: 'space-2', display_name: 'Antispecter', position: false, participant_slot: 2 },
    ],
    turn_ends_at: '2026-07-30T11:58:00.000Z',
    completed_at: '2026-07-30T11:58:00.000Z',
    recording_cancelled_at: null,
    ...overrides,
  };
}

/** Routes each geo-chat path the loader touches to a canned response. */
function mockGeoChat(media: unknown, debate = debateBody()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      const body = url.endsWith('/media')
        ? media
        : url.includes('/transcript')
          ? { segments: [] }
          : url.includes('/media/artifacts/url')
            ? { upload: { url: 'https://r2.example/final.webm?X-Amz-Expires=900' } }
            : debate;
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadDebatePublishSource media gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  });

  it('publishes the processed final_video when the job succeeded', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    expect(input.videoUrl).toBe('https://r2.example/final.webm?X-Amz-Expires=900');
  });

  // Without this gate, a succeeded job missing final_video publishes a videoless Debate entity.
  it('treats a succeeded job with no final_video as not yet publishable', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'preview_image' }] });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(DebateNotPublishableError);
    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(/no processed final_video/);
  });

  // The hevc rendition is a companion to final_video, never a substitute for it.
  it('does not count the hevc rendition as the processed video', async () => {
    mockGeoChat({
      job: { status: 'succeeded' },
      artifacts: [{ kind: 'final_video_hevc' }, { kind: 'preview_image' }],
    });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(DebateNotPublishableError);
  });

  it.each([['failed'], ['pending'], ['running']])('leaves a %s media job for a later tick', async status => {
    mockGeoChat({ job: { status }, artifacts: [] });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(/media is not ready/);
  });

  it('permanently rejects a cancelled debate even when media previously succeeded', async () => {
    mockGeoChat(
      { job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] },
      debateBody({ recording_cancelled_at: '2026-07-30T11:59:00.000Z' })
    );

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toMatchObject({ code: 'recording_cancelled' });
  });

  it('waits for the cancellation settlement window before publishing', async () => {
    mockGeoChat(
      { job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] },
      debateBody({ turn_ends_at: '2026-07-30T11:59:30.001Z' })
    );

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toMatchObject({ code: 'cancellation_window_open' });
  });
});

describe('listSweepCandidateDebateIds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  });

  it('returns only complete, uncancelled debates whose settlement window has closed', async () => {
    const eligible = debateBody({ id: 'eligible' });
    const cancelled = debateBody({ id: 'cancelled', recording_cancelled_at: '2026-07-30T11:59:00.000Z' });
    const settling = debateBody({ id: 'settling', turn_ends_at: '2026-07-30T11:59:30.001Z' });
    const active = debateBody({ id: 'active', status: 'thanking' });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ debates: [eligible, cancelled, settling, active] }), { status: 200 })
      )
    );

    await expect(listSweepCandidateDebateIds('space-1')).resolves.toEqual(['eligible']);
  });
});
