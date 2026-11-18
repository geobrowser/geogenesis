import { describe, expect, it, vi } from 'vitest';

import { buildGeoPublisherProposal, getGeoPublisherStatus } from './server';

const SPACE = 'a'.repeat(32);
const VIEWER = 'b'.repeat(32);
const PUBLISHER = 'c'.repeat(32);

const request = (token: string | null = 'tok') =>
  new Request('http://x/api', { headers: token ? { authorization: `Bearer ${token}` } : {} });

function deps(over: Record<string, unknown> = {}) {
  return {
    appId: 'app',
    verify: vi.fn(async () => ({ userId: 'u', walletAddress: '0xabc' })),
    resolveSpace: vi.fn(async () => VIEWER),
    publisherSpaceId: () => PUBLISHER,
    roles: vi.fn(async () => ({ editorSpaceIds: [VIEWER] })),
    spaceType: vi.fn(async () => 'DAO'),
    activeRequest: vi.fn(async () => null),
    ...over,
  };
}

describe('getGeoPublisherStatus', () => {
  it('answers editors of the space', async () => {
    expect(await getGeoPublisherStatus(request(), SPACE, deps())).toEqual({ ok: true, status: 'not_editor' });
    expect(
      await getGeoPublisherStatus(
        request(),
        SPACE,
        deps({ roles: vi.fn(async () => ({ editorSpaceIds: [VIEWER, PUBLISHER] })) })
      )
    ).toEqual({ ok: true, status: 'editor' });
    expect(
      await getGeoPublisherStatus(
        request(),
        SPACE,
        deps({ activeRequest: vi.fn(async () => ({ proposalId: 'p', isVotingEnded: false })) })
      )
    ).toEqual({ ok: true, status: 'pending' });
  });

  it('does not count a request whose vote ended', async () => {
    const result = await getGeoPublisherStatus(
      request(),
      SPACE,
      deps({ activeRequest: vi.fn(async () => ({ proposalId: 'p', isVotingEnded: true })) })
    );
    expect(result).toEqual({ ok: true, status: 'not_editor' });
  });

  it('refuses anyone who is not a signed-in editor, never naming the publisher', async () => {
    expect(await getGeoPublisherStatus(request(null), SPACE, deps())).toMatchObject({ status: 401 });
    expect(await getGeoPublisherStatus(request(), SPACE, deps({ verify: vi.fn(async () => null) }))).toMatchObject({
      status: 401,
    });
    const nonEditor = await getGeoPublisherStatus(
      request(),
      SPACE,
      deps({ roles: vi.fn(async () => ({ editorSpaceIds: [PUBLISHER] })) })
    );
    expect(nonEditor).toEqual({ ok: false, status: 403, code: 'editor_required' });
    expect(JSON.stringify(nonEditor)).not.toContain(PUBLISHER);
  });

  it('refuses a personal space and a bad id', async () => {
    expect(
      await getGeoPublisherStatus(request(), SPACE, deps({ spaceType: vi.fn(async () => 'PERSONAL') }))
    ).toMatchObject({ status: 400, code: 'space_not_dao' });
    expect(await getGeoPublisherStatus(request(), 'nope', deps())).toMatchObject({ status: 400 });
  });

  it('is unavailable without a configured publisher', async () => {
    expect(await getGeoPublisherStatus(request(), SPACE, deps({ publisherSpaceId: () => null }))).toMatchObject({
      status: 503,
    });
  });
});

describe('buildGeoPublisherProposal', () => {
  it('builds a slow add-editor proposal authored by the viewer', async () => {
    const result = await buildGeoPublisherProposal(request(), SPACE, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.authorSpaceId).toBe(VIEWER);
    expect(result.proposal.calldata).toMatch(/^0x/);
    expect(result.proposal.calldata.toLowerCase()).toContain(PUBLISHER);
    expect(result.proposal.proposalId).toMatch(/^0x[0-9a-f]{32}$/);
  });

  it('refuses when the publisher already edits or a request is under vote', async () => {
    expect(
      await buildGeoPublisherProposal(
        request(),
        SPACE,
        deps({ roles: vi.fn(async () => ({ editorSpaceIds: [VIEWER, PUBLISHER] })) })
      )
    ).toMatchObject({ status: 409, code: 'already_editor' });
    expect(
      await buildGeoPublisherProposal(
        request(),
        SPACE,
        deps({ activeRequest: vi.fn(async () => ({ proposalId: 'p', isVotingEnded: false })) })
      )
    ).toMatchObject({ status: 409, code: 'request_pending' });
  });
});
