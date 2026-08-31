import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateNotPublishableError, listSweepCandidateDebateIds, loadDebatePublishSource } from './debate-source';

const DEBATE_ID = '019f89dc2124799193daafd5bc4ffa0a';

const OBJECT_STORE_HOST = 'https://r2.example';

// Stands in for the IPFS upload. Each artifact's fake bytes are its kind, so the returned CID
// records which artifact was actually pinned.
const { uploadGeoImage, pinToFakeIpfs } = vi.hoisted(() => {
  const pinToFakeIpfs = async ({ blob }: { blob: Blob }) => ({ cid: `ipfs://cid-for-${await blob.text()}` });
  return { uploadGeoImage: vi.fn(pinToFakeIpfs), pinToFakeIpfs };
});

vi.mock('~/core/sdk/geo-client', () => ({ uploadGeoImage }));

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

/** Routes each geo-chat path the loader touches — plus the object store it redirects to — to a canned response. */
function mockGeoChat(media: unknown, debate = debateBody(), artifactStatus = 200, claims: unknown = null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(OBJECT_STORE_HOST)) {
        return new Response(new URL(url).pathname.slice(1), { status: artifactStatus });
      }
      const body = url.endsWith('/media')
        ? media
        : url.endsWith('/claims')
          ? claims
          : url.includes('/transcript')
            ? { segments: [] }
            : url.includes('/media/artifacts/url')
              ? { upload: { url: presignedUrlFor(String(init?.body)) } }
              : debate;
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
}

/** geo-chat presigns a distinct short-lived URL per artifact kind. */
function presignedUrlFor(requestBody: string) {
  const { kind } = JSON.parse(requestBody) as { kind: string };
  return `${OBJECT_STORE_HOST}/${kind}?X-Amz-Expires=900`;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uploadGeoImage.mockReset();
  uploadGeoImage.mockImplementation(pinToFakeIpfs);
});

describe('loadDebatePublishSource media gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  });

  // Publishing geo-chat's presigned URL puts a link on-chain that expires 15 minutes later.
  it('pins the processed final_video and publishes its permanent ipfs:// URI', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    // Handed over as the artifact's bytes, never as the presigned URL: the SDK's URL path rejects a
    // webm body. Asserted by reading the blob rather than `expect.any(Blob)`, which is an
    // `instanceof` against the test realm's global and fails on the Blob `fetch` actually returns.
    const [uploaded] = uploadGeoImage.mock.calls[0];
    expect(uploaded).not.toHaveProperty('url');
    expect(await uploaded.blob.text()).toBe('final_video');
    expect(input.videoUrl).toBe('ipfs://cid-for-final_video');
  });

  it('pins the preview_image as the video keyframe', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }, { kind: 'preview_image' }] });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    expect(input.keyframeUrl).toBe('ipfs://cid-for-preview_image');
  });

  it('uses geo-chat canonical turns + pre-attributed claims when available', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] }, debateBody(), 200, {
      turns: [
        { turn_index: 0, participant_slot: 1, attributed_space_id: 'space-1', speaker_name: 'Specter', text: 'Nuclear program was advancing.' },
        { turn_index: 1, participant_slot: 2, attributed_space_id: 'space-2', speaker_name: 'Antispecter', text: 'There was no congressional approval.' },
      ],
      claims: [
        { text: 'The nuclear program was advancing.', is_factual: true, turn_index: 0 },
        { text: 'The action was unjustified.', is_factual: false, turn_index: 1 },
      ],
    });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    // Transcript blocks come from geo-chat's canonical turns, attributed to each speaker's space entity.
    expect(input.transcriptTurns.map(t => t.speakerSpaceEntityId)).toEqual(['space-1', 'space-2']);
    expect(input.transcriptTurns[0].text).toBe('Nuclear program was advancing.');
    // Claims arrive pre-attributed, keyed to the same turn indices.
    expect(input.claims).toEqual([
      { text: 'The nuclear program was advancing.', isFactual: true, turnIndex: 0 },
      { text: 'The action was unjustified.', isFactual: false, turnIndex: 1 },
    ]);
  });

  it('falls back to the raw transcript with no claims when geo-chat reports none', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    expect(input.claims).toEqual([]);
    expect(input.transcriptTurns).toEqual([]); // /transcript mock returns no segments
  });

  it('publishes without a keyframe when the worker composed no preview_image', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    expect(input.keyframeUrl).toBeNull();
    expect(uploadGeoImage).toHaveBeenCalledTimes(1);
  });

  it('still publishes the video when pinning the keyframe fails', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }, { kind: 'preview_image' }] });
    uploadGeoImage.mockImplementation(async ({ blob }: { blob: Blob }) => {
      if ((await blob.text()) === 'preview_image') throw new Error('ipfs upload failed');
      return { cid: 'ipfs://cid-for-final_video' };
    });

    const { input } = await loadDebatePublishSource(DEBATE_ID);
    expect(input.videoUrl).toBe('ipfs://cid-for-final_video');
    expect(input.keyframeUrl).toBeNull();
  });

  // An expired or revoked presigned URL must fail the publish, not pin the object store's error page.
  it('fails the publish when the artifact download is rejected', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'final_video' }] }, debateBody(), 403);

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(/Downloading final_video/);
    expect(uploadGeoImage).not.toHaveBeenCalled();
  });

  // Without this gate, a succeeded job missing final_video publishes a videoless Debate entity.
  // Terminal rather than a wait: the job that would have produced the video has already finished.
  it('treats a succeeded job with no final_video as permanently unpublishable', async () => {
    mockGeoChat({ job: { status: 'succeeded' }, artifacts: [{ kind: 'preview_image' }] });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(DebateNotPublishableError);
    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toMatchObject({ code: 'media_failed' });
  });

  // The hevc rendition is a companion to final_video, never a substitute for it.
  it('does not count the hevc rendition as the processed video', async () => {
    mockGeoChat({
      job: { status: 'succeeded' },
      artifacts: [{ kind: 'final_video_hevc' }, { kind: 'preview_image' }],
    });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toThrow(DebateNotPublishableError);
  });

  it.each([['queued'], ['pending'], ['running']])('leaves a %s media job for a later tick', async status => {
    mockGeoChat({ job: { status }, artifacts: [] });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toMatchObject({ code: 'media_not_ready' });
  });

  // A failed job has already spent its retries in the worker, so no later tick will publish this
  // debate. Sharing `media_not_ready` with the statuses above is what let a dead debate count as a
  // healthy backlog on every sweep, forever.
  it('reports a failed media job as permanent rather than pending', async () => {
    mockGeoChat({ job: { status: 'failed' }, artifacts: [] });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toMatchObject({ code: 'media_failed' });
  });

  // A debate with no job row at all is the ambiguous case: a lost enqueue looks exactly like one
  // about to happen, so it stays a wait rather than being reported as permanently dead.
  it('treats a missing media job as a wait, not a permanent failure', async () => {
    mockGeoChat({ job: null, artifacts: [] });

    await expect(loadDebatePublishSource(DEBATE_ID)).rejects.toMatchObject({ code: 'media_not_ready' });
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
