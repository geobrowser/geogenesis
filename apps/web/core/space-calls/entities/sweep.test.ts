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
  shape: 1,
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
  const queue = claims === null ? null : [...claims];
  const submit = vi.fn(async () => '0xhash');
  const deps = {
    // Serves the due calls a claim at a time, as geo-chat leases them.
    claim: vi.fn(async (_spaceIds: string[], limit: number) => (queue === null ? null : queue.splice(0, limit))),
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

  it('writes nothing without a web origin for the network', async () => {
    const { deps } = harness([claim('0'.repeat(32))], { appOrigin: null });
    expect(await run(deps)).toMatchObject({ skipped: 'no_web_origin' });
    expect(deps.claim).not.toHaveBeenCalled();
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

  it('records without a proposal an update that changes nothing on the graph', async () => {
    const callId = '6'.repeat(32);
    const ended = entity({ status: 'ended' });
    const { deps, records, submit } = harness([
      claim(callId, {
        action: 'update',
        entity_id: callId,
        // Attendees changed, and they are not written while the flag is off.
        entity: { ...ended, attendees: ['c'.repeat(32)] },
        previous: ended,
      }),
    ]);
    const result = await run(deps);
    expect(submit).not.toHaveBeenCalled();
    expect(result.written).toEqual([callId]);
    expect(records[0]![1]).toMatchObject({ outcome: 'written', entity_id: callId });
  });

  it('rewrites a call when only the shape changed', async () => {
    const callId = '6'.repeat(32);
    const { deps, submit } = harness([
      claim(callId, { action: 'update', entity_id: callId, entity: entity({ shape: 2 }), previous: entity() }),
    ]);
    await run(deps);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('writes an update that moves the call', async () => {
    const callId = '6'.repeat(32);
    const { deps, submit } = harness([
      claim(callId, {
        action: 'update',
        entity_id: callId,
        entity: entity({ starts_at: '2026-11-25T18:00:00Z' }),
        previous: entity(),
      }),
    ]);
    await run(deps);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('claims nothing past the deadline, so no claim is left to lapse', async () => {
    const { deps, records, submit } = harness([claim('9'.repeat(32))]);
    await run(deps, () => false);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it('claims each call just before writing it, and stops at the deadline', async () => {
    const { deps, submit } = harness([claim('1'.repeat(32)), claim('2'.repeat(32))]);
    let checks = 0;
    const result = await run(deps, () => checks++ === 0);
    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(deps.claim).toHaveBeenCalledWith([SPACE], 1);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result.written).toEqual(['1'.repeat(32)]);
  });

  it('does not count updates that send nothing against the four writes', async () => {
    const noop = (digit: string) =>
      claim(digit.repeat(32), { action: 'update', entity_id: digit.repeat(32), previous: entity() });
    const calls = [noop('1'), noop('2'), noop('3'), ...['4', '5', '6', '7', '8'].map(d => claim(d.repeat(32)))];
    const { deps, submit, records } = harness(calls);
    await run(deps);
    expect(submit).toHaveBeenCalledTimes(4);
    expect(records).toHaveLength(7);
  });

  it('stops after twenty claims however few of them send an edit', async () => {
    const calls = Array.from({ length: 25 }, (_, i) =>
      claim(i.toString(16).padStart(32, '0'), {
        action: 'update',
        entity_id: i.toString(16).padStart(32, '0'),
        previous: entity(),
      })
    );
    const { deps, submit } = harness(calls);
    await run(deps);
    expect(deps.claim).toHaveBeenCalledTimes(20);
    expect(submit).not.toHaveBeenCalled();
  });

  it('writes at most four calls a run', async () => {
    const calls = ['1', '2', '3', '4', '5'].map(digit => claim(digit.repeat(32)));
    const { deps, submit } = harness(calls);
    await run(deps);
    expect(submit).toHaveBeenCalledTimes(4);
  });

  it('claims across spaces in chunks of at most 500, moving on when one has nothing due', async () => {
    const spaces = Array.from({ length: 1001 }, (_, i) => i.toString(16).padStart(32, '0'));
    const due = claim('7'.repeat(32));
    let leased = false;
    const claimFn = vi.fn(async (spaceIds: string[]) => {
      if (leased || !spaceIds.includes(spaces[1000]!)) return [];
      leased = true;
      return [due];
    });
    const { deps, submit } = harness([], { claim: claimFn });
    await sweepCallEntities(CONFIG, spaces, { canStart: () => true, deps: deps as never });
    expect(claimFn.mock.calls.map(([spaceIds]) => (spaceIds as string[]).length)).toEqual([500, 500, 1, 1]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('records failed when the adopted event is another call’s, so the next claim mints', async () => {
    const callId = 'a'.repeat(32);
    const outcomes: CallEntityRecord[] = [];
    const { deps } = harness([claim(callId)], {
      findCurator: vi.fn(async () => new Map([[callId, 'b'.repeat(32)]])),
      record: vi.fn(async (_callId: string, record: CallEntityRecord) => {
        outcomes.push(record);
        return record.outcome === 'written'
          ? { status: 'id_taken' as const }
          : { status: 'recorded' as const, current: true };
      }),
    });
    const result = await run(deps);
    expect(outcomes.map(o => o.outcome)).toEqual(['written', 'failed']);
    expect(outcomes[1]).toMatchObject({ error: 'call_entity_id_taken' });
    expect(result).toMatchObject({ written: [], failed: [{ callId, error: 'call_entity_id_taken' }] });
  });

  it('passes the publisher and the claim’s call page to the curator lookup', async () => {
    const callId = 'a'.repeat(32);
    const findCurator = vi.fn(async () => new Map<string, string>());
    const { deps } = harness([claim(callId)], { findCurator });
    await run(deps);
    const [, options] = findCurator.mock.calls[0] as unknown as [
      unknown,
      { publisherAddress: string; pageUrlOf: (c: CallEntityClaim) => string },
    ];
    expect(options.publisherAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(options.pageUrlOf(claim(callId))).toBe(`https://geobrowser.io/space/${SPACE}/calls/${callId}`);
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
