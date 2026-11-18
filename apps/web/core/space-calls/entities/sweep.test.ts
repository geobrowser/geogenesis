import { describe, expect, it, vi } from 'vitest';

import type { DebateAcceptorConfig } from '~/core/debates/server/acceptor-config';

import type { CallEntity, CallEntityClaim, CallEntityRecord } from './service';
import { deploymentMayWrite, sweepCallEntities } from './sweep';

vi.mock('~/core/debates/server/publish-debate', () => ({ submitEditAsAcceptor: vi.fn() }));

const CONFIG: DebateAcceptorConfig = {
  privateKey: `0x${'1'.repeat(64)}`,
  spaceId: 'ffffffffffffffffffffffffffffffff',
};
const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DAO = { id: SPACE, type: 'DAO', address: '0x0000000000000000000000000000000000000001' };

const entity = (over: Partial<CallEntity> = {}): CallEntity => ({
  space_id: SPACE,
  status: 'scheduled',
  name: 'Call',
  series_id: '39c0a4c8a1d24e30971498f9014b4ef4',
  original_start: '2026-11-25T16:00:00Z',
  scheduled_starts_at: '2026-11-25T16:00:00Z',
  scheduled_ends_at: '2026-11-25T17:00:00Z',
  started_at: null,
  ended_at: null,
  starts_at: '2026-11-25T16:00:00Z',
  ends_at: '2026-11-25T17:00:00Z',
  attendees: [],
  recording: null,
  ...over,
});

const claim = (callId: string, over: Partial<CallEntityClaim> = {}): CallEntityClaim => ({
  call_id: callId,
  claim_id: `${callId.slice(0, 31)}c`,
  claimed_until: '2026-11-18T15:15:00Z',
  action: 'create',
  entity_id: null,
  entity: entity(),
  previous: null,
  attempts: 0,
  last_error: null,
  ...over,
});

function harness(claims: CallEntityClaim[] | null, over: Record<string, unknown> = {}) {
  const records: Array<[string, CallEntityRecord]> = [];
  const submit = vi.fn(async () => '0xhash');
  const deps = {
    claim: vi.fn(async () => claims),
    record: vi.fn(async (callId: string, record: CallEntityRecord) => {
      records.push([callId, record]);
      return { status: 'recorded' as const, current: true };
    }),
    findCurator: vi.fn(async () => new Map<string, string>()),
    loadSpace: vi.fn(async () => DAO),
    loadEntity: vi.fn(async () => null),
    submit,
    appOrigin: 'https://geobrowser.io',
    mayWrite: () => true,
    ...over,
  };
  return { deps, records, submit };
}

const run = (deps: object, canStart = () => true) =>
  sweepCallEntities(CONFIG, [SPACE], { canStart, deps: deps as never });

describe('sweepCallEntities', () => {
  it('skips quietly when geo-chat lists nothing by design', async () => {
    const { deps, submit } = harness(null);
    expect(await run(deps)).toMatchObject({ skipped: 'not_configured', written: [] });
    expect(submit).not.toHaveBeenCalled();
  });

  it('writes nothing from a preview deployment', async () => {
    const { deps, submit } = harness([claim('0'.repeat(32))], { mayWrite: () => false });
    expect(await run(deps)).toMatchObject({ skipped: 'not_production' });
    expect(deps.claim).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('lets production and a local run write, and no other deployment', () => {
    expect([undefined, '', 'production', 'preview', 'development'].map(deploymentMayWrite)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('mints a new call under its call id and records it', async () => {
    const callId = '1'.repeat(32);
    const { deps, records, submit } = harness([claim(callId)]);
    const result = await run(deps);
    expect(result.written).toEqual([callId]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0] as unknown[])[1]).toMatchObject({ space: DAO });
    expect(records).toEqual([[callId, { claim_id: claim(callId).claim_id, outcome: 'written', entity_id: callId }]]);
  });

  it('adopts curator’s event for the slot', async () => {
    const callId = '2'.repeat(32);
    const curatorId = 'b'.repeat(32);
    const { deps, records } = harness([claim(callId)], {
      findCurator: vi.fn(async () => new Map([[callId, curatorId]])),
    });
    await run(deps);
    expect(records[0]![1]).toMatchObject({ outcome: 'written', entity_id: curatorId });
  });

  it('keeps the id geo-chat recorded over any lookup', async () => {
    const callId = '3'.repeat(32);
    const recorded = 'c'.repeat(32);
    const { deps, records } = harness([claim(callId, { action: 'update', entity_id: recorded })], {
      findCurator: vi.fn(async () => new Map([[callId, 'b'.repeat(32)]])),
    });
    await run(deps);
    expect(records[0]![1]).toMatchObject({ entity_id: recorded });
  });

  it('holds a claim back rather than minting a duplicate when the curator lookup fails', async () => {
    const callId = '4'.repeat(32);
    const onTheSpot = '5'.repeat(32);
    const { deps, records, submit } = harness(
      [claim(callId), claim(onTheSpot, { entity: entity({ series_id: null, original_start: null }) })],
      { findCurator: vi.fn(async () => Promise.reject(new Error('503'))) }
    );
    await run(deps);
    expect(records.map(([id, r]) => [id, r.outcome])).toEqual([
      [callId, 'failed'],
      [onTheSpot, 'written'],
    ]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('records a failed write so geo-chat holds the call back', async () => {
    const callId = '6'.repeat(32);
    const { deps, records } = harness([claim(callId)], {
      submit: vi.fn(async () => Promise.reject(new Error('vote reverted'))),
    });
    const result = await run(deps);
    expect(result.failed).toEqual([{ callId, error: 'vote reverted' }]);
    expect(records[0]![1]).toMatchObject({ outcome: 'failed', error: 'vote reverted' });
  });

  it('holds a call in a space that is not a DAO back a day', async () => {
    const callId = '7'.repeat(32);
    const { deps, records, submit } = harness([claim(callId)], {
      loadSpace: vi.fn(async () => ({ ...DAO, type: 'PERSONAL' })),
    });
    await run(deps);
    expect(submit).not.toHaveBeenCalled();
    expect(records[0]![1]).toMatchObject({ outcome: 'failed', error: 'space_not_dao', retry_after_seconds: 86_400 });
  });

  it('removes what the graph holds for a recorded entity', async () => {
    const callId = '8'.repeat(32);
    const { deps, records, submit } = harness([claim(callId, { action: 'remove', entity_id: callId })], {
      loadEntity: vi.fn(async () => ({
        id: callId,
        values: [
          { spaceId: SPACE, property: { id: 'a126ca530c8e48d5b88882c734c38935', dataType: 'TEXT' } },
          { spaceId: 'f'.repeat(32), property: { id: 'a126ca530c8e48d5b88882c734c38935', dataType: 'TEXT' } },
        ],
        relations: [],
      })),
    });
    const result = await run(deps);
    expect(result.removed).toEqual([callId]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(records[0]![1]).toMatchObject({ outcome: 'written', entity_id: callId });
  });

  it('holds a removal back while the entity is not readable yet', async () => {
    const callId = '8'.repeat(32);
    const { deps, records, submit } = harness([claim(callId, { action: 'remove', entity_id: callId })]);
    const result = await run(deps);
    expect(submit).not.toHaveBeenCalled();
    expect(result.removed).toEqual([]);
    expect(records[0]![1]).toEqual({ claim_id: expect.any(String), outcome: 'failed', error: 'entity_not_indexed' });
  });

  it('records the removal written once the entity stayed unreadable for five tries', async () => {
    const callId = '8'.repeat(32);
    const stale = { action: 'remove' as const, entity_id: callId, last_error: 'entity_not_indexed' };
    const fourth = harness([claim(callId, { ...stale, attempts: 4 })]);
    await run(fourth.deps);
    expect(fourth.records[0]![1]).toMatchObject({ outcome: 'failed' });

    const fifth = harness([claim(callId, { ...stale, attempts: 5 })]);
    const result = await run(fifth.deps);
    expect(fifth.submit).not.toHaveBeenCalled();
    expect(result.removed).toEqual([callId]);
    expect(fifth.records[0]![1]).toMatchObject({ outcome: 'written', entity_id: callId });
  });

  it('records a failed entity read as failed, not removed', async () => {
    const callId = '8'.repeat(32);
    const { deps, records, submit } = harness([claim(callId, { action: 'remove', entity_id: callId })], {
      loadEntity: vi.fn(async () => {
        throw new Error('api down');
      }),
    });
    const result = await run(deps);
    expect(submit).not.toHaveBeenCalled();
    expect(result.removed).toEqual([]);
    expect(records[0]![1]).toMatchObject({ outcome: 'failed', error: 'api down' });
  });

  it('records a removal written once nothing is left in the space', async () => {
    const callId = '8'.repeat(32);
    const { deps, records, submit } = harness([claim(callId, { action: 'remove', entity_id: callId })], {
      loadEntity: vi.fn(async () => ({
        id: callId,
        values: [{ spaceId: 'f'.repeat(32), property: { id: 'a126ca530c8e48d5b88882c734c38935', dataType: 'TEXT' } }],
        relations: [],
      })),
    });
    const result = await run(deps);
    expect(submit).not.toHaveBeenCalled();
    expect(result.removed).toEqual([callId]);
    expect(records[0]![1]).toMatchObject({ outcome: 'written', entity_id: callId });
  });

  it('starts nothing past the deadline and leaves the claims to lapse', async () => {
    const { deps, records, submit } = harness([claim('9'.repeat(32))]);
    let calls = 0;
    await run(deps, () => calls++ === 0);
    expect(submit).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it('reports an id conflict without counting it written', async () => {
    const callId = 'a'.repeat(32);
    const { deps } = harness([claim(callId)], {
      record: vi.fn(async () => ({ status: 'id_conflict' as const, entityId: 'c'.repeat(32) })),
    });
    const result = await run(deps);
    expect(result).toMatchObject({ written: [], conflicts: [callId] });
  });
});
