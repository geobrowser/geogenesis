import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DebateLobbyClaim, LOBBY_CLAIMS_MAX_IDS, getDebateLobbyClaims } from '../api';
import { exploreRoomClaimBatches, roomRowsByClaim } from './lobby-explore-claims-hooks';

function entry(id: string) {
  return { claim: { claim_entity_id: id } };
}

function hex(n: number) {
  return n.toString(16).padStart(32, '0');
}

describe('exploreRoomClaimBatches', () => {
  it('drops repeats across spellings and sorts each batch', () => {
    const a = 'b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const b = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const dashed = `${a.slice(0, 8)}-${a.slice(8, 12)}-${a.slice(12, 16)}-${a.slice(16, 20)}-${a.slice(20)}`;
    expect(exploreRoomClaimBatches([entry(a), entry(b), entry(dashed.toUpperCase())])).toEqual([[b, a]]);
  });

  it('keeps earlier batches as they were when a page is added', () => {
    const first = Array.from({ length: LOBBY_CLAIMS_MAX_IDS }, (_, n) => entry(hex(n + 100)));
    const before = exploreRoomClaimBatches(first);
    const after = exploreRoomClaimBatches([...first, entry(hex(1))]);
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual([hex(1)]);
  });

  it('asks for nothing with nothing on screen', () => {
    expect(exploreRoomClaimBatches([])).toEqual([]);
  });
});

describe('roomRowsByClaim', () => {
  it('keys rows by space and claim, so one claim in two spaces stays two rows', () => {
    const row = (space: string) =>
      ({
        claim: { id: space, space_id: space, claim_entity_id: hex(1), claim: '', description: null },
      }) as DebateLobbyClaim;
    const rows = roomRowsByClaim([[row(hex(2))], undefined, [row(hex(3))]]);
    expect([...rows.keys()]).toEqual([`${hex(2)}:${hex(1)}`, `${hex(3)}:${hex(1)}`]);
  });
});

describe('getDebateLobbyClaims', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the claims, dashless, and leaves the unfiltered read alone', async () => {
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ lobby_id: 'l', source: 'room', claims: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetch);
    const token = async () => 'token';
    const dashed = `${hex(1).slice(0, 8)}-${hex(1).slice(8, 12)}-${hex(1).slice(12, 16)}-${hex(1).slice(16, 20)}-${hex(1).slice(20)}`;

    await getDebateLobbyClaims('lobby1', token, 'account', undefined, [dashed, hex(2)]);
    await getDebateLobbyClaims('lobby1', token, 'account');

    const urls = fetch.mock.calls.map(call => String(call[0])).filter(url => url.includes('/debate-lobbies/'));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(`/debate-lobbies/lobby1/claims?claim_entity_ids=${hex(1)},${hex(2)}`);
    expect(urls[1]).toMatch(/\/debate-lobbies\/lobby1\/claims$/);
  });
});
