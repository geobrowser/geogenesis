import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DebateLobbyClaim, LOBBY_CLAIMS_MAX_IDS, getDebateLobbyClaims } from '../api';
import {
  exploreRoomClaimBatches,
  namedRoomClaims,
  nearBatchIndexes,
  roomRowsByClaim,
  useNearExploreBatches,
} from './lobby-explore-claims-hooks';

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

  it('folds only uuid-shaped ids, as geo-chat does, and keeps others as they are', () => {
    const uuid = 'A1B2C3D4-E5F6-A1B2-C3D4-E5F6A1B2C3D4';
    expect(exploreRoomClaimBatches([entry(uuid), entry('Claim-One'), entry('claim-one')])).toEqual([
      ['Claim-One', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'claim-one'],
    ]);
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

  it('sends a non-uuid id as it is, encoded', async () => {
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ lobby_id: 'l', source: 'room', claims: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetch);

    await getDebateLobbyClaims('lobby1', async () => 'token', 'account', undefined, [hex(1), 'Claim-One,x']);

    const url = fetch.mock.calls.map(call => String(call[0])).find(url => url.includes('/debate-lobbies/'));
    expect(url).toMatch(`/debate-lobbies/lobby1/claims?claim_entity_ids=${hex(1)},Claim-One%2Cx`);
  });
});

describe('reading only near the viewport', () => {
  const batches = [
    [hex(1), hex(2)],
    [hex(3), hex(4)],
    [hex(5), hex(6)],
  ];

  it('picks the batches with a claim in range', () => {
    expect(nearBatchIndexes(batches, new Set([hex(2), hex(5)]))).toEqual([0, 2]);
    expect(nearBatchIndexes(batches, new Set())).toEqual([]);
  });

  it('follows cards in and out of range, keeping each batch as it was', () => {
    const { result } = renderHook(() => useNearExploreBatches(batches));
    expect(result.current.active).toEqual([]);

    act(() => result.current.onNear(hex(3), true));
    expect(result.current.active).toEqual([batches[1]]);

    // Ids arrive in either spelling.
    act(() => result.current.onNear(hex(6).toUpperCase(), true));
    expect(result.current.active).toEqual([batches[1], batches[2]]);

    act(() => result.current.onNear(hex(3), false));
    expect(result.current.active).toEqual([batches[2]]);
  });

  it('keeps a batch while another card for the same claim is still in range', () => {
    const { result } = renderHook(() => useNearExploreBatches(batches));

    // One claim tagged in two spaces: two cards, one id.
    act(() => result.current.onNear(hex(3), true));
    act(() => result.current.onNear(hex(3), true));
    act(() => result.current.onNear(hex(3), false));
    expect(result.current.active).toEqual([batches[1]]);

    act(() => result.current.onNear(hex(3), false));
    expect(result.current.active).toEqual([]);
  });
});

describe('namedRoomClaims', () => {
  const row = (entityId: string) =>
    ({
      claim: { id: entityId, space_id: hex(9), claim_entity_id: entityId, claim: '', description: null },
    }) as DebateLobbyClaim;

  it('keeps only the claims the batch named', () => {
    const response = { lobby_id: 'l', source: 'room' as const, claims: [row(hex(1)), row(hex(7))] };
    expect(namedRoomClaims(response, [hex(1), hex(2)]).claims.map(r => r.claim.claim_entity_id)).toEqual([hex(1)]);
  });

  it('matches a uuid in either spelling and any other id only as it is', () => {
    const dashed = `${hex(1).slice(0, 8)}-${hex(1).slice(8, 12)}-${hex(1).slice(12, 16)}-${hex(1).slice(16, 20)}-${hex(1).slice(20)}`;
    const response = {
      lobby_id: 'l',
      source: 'room' as const,
      claims: [row(dashed.toUpperCase()), row('Claim-One'), row('claimone')],
    };
    const ids = namedRoomClaims(response, [hex(1), 'Claim-One']).claims.map(r => r.claim.claim_entity_id);
    expect(ids).toEqual([dashed.toUpperCase(), 'Claim-One']);
  });

  it('ignores a recent-claims answer from a geo-chat that dropped the filter', () => {
    const response = { lobby_id: 'l', source: 'recent' as const, claims: [row(hex(1))] };
    expect(namedRoomClaims(response, [hex(1)]).claims).toEqual([]);
  });
});
