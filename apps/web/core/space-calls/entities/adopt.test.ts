import { describe, expect, it, vi } from 'vitest';

import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { WEB_URL_PROPERTY_ID } from '~/core/debates/ontology';
import type { Entity } from '~/core/types';

import { CURATOR_EVENT_TAKEN, findCuratorCallEvents, needsCuratorLookup } from './adopt';
import { CALL_EVENT_PUBLISHED_BY_PROPERTY_ID } from './draft';
import type { CallEntityClaim } from './service';

const SPACE = 'a'.repeat(32);
const SERIES = '1'.repeat(32);

const claim = (callId: string, originalStart: string | null, over: Partial<CallEntityClaim> = {}) =>
  ({
    call_id: callId,
    claim_id: callId,
    claimed_until: '',
    action: 'create',
    entity_id: null,
    entity: { space_id: SPACE, series_id: SERIES, original_start: originalStart },
    previous: null,
    attempts: 0,
    last_error: null,
    ...over,
  }) as unknown as CallEntityClaim;

const PUBLISHER = '0xAbC0000000000000000000000000000000000001';
const OPTIONS = {
  publisherAddress: PUBLISHER,
  pageUrlOf: (c: CallEntityClaim) => `https://geo.test/space/${SPACE}/calls/${c.call_id}`,
};
const parent = (to = SERIES, spaceId = SPACE) => ({
  spaceId,
  type: { id: EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY },
  toEntity: { id: to },
});

const event = (
  id: string,
  originalStart: string,
  { relations = [parent()], values = [] }: { relations?: object[]; values?: object[] } = {}
) =>
  ({
    id,
    values: [{ property: { id: EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY }, value: originalStart }, ...values],
    relations,
  }) as unknown as Entity;

const linked = (...ids: string[]) =>
  vi.fn(async () => ids.map(id => ({ id, types: [{ id: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE }] })));

describe('findCuratorCallEvents', () => {
  it('matches each slot to the nearest event of that series, two reads per series', async () => {
    const backlinks = vi.fn(async () => [
      { id: 'e1'.padEnd(32, '0'), types: [{ id: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE }] },
      { id: 'e2'.padEnd(32, '0'), types: [{ id: EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE }] },
      { id: 'zz'.padEnd(32, '0'), types: [{ id: 'other' }] },
    ]);
    const entities = vi.fn(async () => [
      event('e1'.padEnd(32, '0'), '2026-11-25T16:00:00.000Z'),
      event('e2'.padEnd(32, '0'), '2026-12-02T16:05:00.000Z'),
    ]);
    const found = await findCuratorCallEvents(
      [
        claim('c1'.padEnd(32, '0'), '2026-11-25T16:00:00Z'),
        claim('c2'.padEnd(32, '0'), '2026-12-02T16:00:00Z'),
        claim('c3'.padEnd(32, '0'), '2026-12-09T16:00:00Z'),
      ],
      OPTIONS,
      { backlinks, entities }
    );
    expect(Object.fromEntries(found)).toEqual({
      ['c1'.padEnd(32, '0')]: 'e1'.padEnd(32, '0'),
      ['c2'.padEnd(32, '0')]: 'e2'.padEnd(32, '0'),
    });
    expect(backlinks).toHaveBeenCalledTimes(1);
    expect(entities).toHaveBeenCalledWith(['e1'.padEnd(32, '0'), 'e2'.padEnd(32, '0')], SPACE);
  });

  it('looks nothing up for a recorded id, an update, or a call started on the spot', async () => {
    const backlinks = vi.fn(async () => []);
    await findCuratorCallEvents(
      [
        claim('c1'.padEnd(32, '0'), '2026-11-25T16:00:00Z', { entity_id: 'x'.padEnd(32, '0') }),
        claim('c2'.padEnd(32, '0'), '2026-11-25T16:00:00Z', { action: 'update' }),
        claim('c3'.padEnd(32, '0'), null),
      ],
      OPTIONS,
      { backlinks, entities: vi.fn() }
    );
    expect(backlinks).not.toHaveBeenCalled();
  });

  it('takes only events whose Parent is this series, in this space', async () => {
    const slot = '2026-11-25T16:00:00Z';
    const found = await findCuratorCallEvents([claim('c1'.padEnd(32, '0'), slot)], OPTIONS, {
      backlinks: linked('e1'.padEnd(32, '0'), 'e2'.padEnd(32, '0'), 'e3'.padEnd(32, '0')),
      entities: vi.fn(async () => [
        // Links the series some other way (an agenda block, a related call): not its occurrence.
        event('e1'.padEnd(32, '0'), slot, { relations: [{ ...parent(), type: { id: 'related' } }] }),
        event('e2'.padEnd(32, '0'), slot, { relations: [parent('9'.repeat(32))] }),
        event('e3'.padEnd(32, '0'), slot, { relations: [parent(SERIES, 'f'.repeat(32))] }),
      ]),
    });
    expect(found.size).toBe(0);
  });

  it('never adopts an event this publisher published', async () => {
    const slot = '2026-11-25T16:00:00Z';
    const ours = { property: { id: CALL_EVENT_PUBLISHED_BY_PROPERTY_ID }, value: PUBLISHER.toLowerCase() };
    const curators = { property: { id: CALL_EVENT_PUBLISHED_BY_PROPERTY_ID }, value: '0xcurator' };
    const found = await findCuratorCallEvents([claim('c1'.padEnd(32, '0'), slot)], OPTIONS, {
      backlinks: linked('e1'.padEnd(32, '0'), 'e2'.padEnd(32, '0')),
      entities: vi.fn(async () => [
        event('e1'.padEnd(32, '0'), slot, { values: [ours] }),
        event('e2'.padEnd(32, '0'), '2026-11-25T16:10:00Z', { values: [curators] }),
      ]),
    });
    expect(Object.fromEntries(found)).toEqual({ ['c1'.padEnd(32, '0')]: 'e2'.padEnd(32, '0') });
  });

  it('skips an event another call already wrote its page onto, but not its own', async () => {
    const slot = '2026-11-25T16:00:00Z';
    const pageOf = (callId: string) => ({
      property: { id: WEB_URL_PROPERTY_ID },
      value: `https://geo.test/space/${SPACE}/calls/${callId}`,
    });
    const run = (values: object[]) =>
      findCuratorCallEvents([claim('c1'.padEnd(32, '0'), slot)], OPTIONS, {
        backlinks: linked('e1'.padEnd(32, '0')),
        entities: vi.fn(async () => [event('e1'.padEnd(32, '0'), slot, { values })]),
      });
    expect((await run([pageOf('c9'.padEnd(32, '0'))])).size).toBe(0);
    expect((await run([pageOf('c1'.padEnd(32, '0'))])).size).toBe(1);
    expect((await run([{ property: { id: WEB_URL_PROPERTY_ID }, value: 'https://meet.example.com/abc' }])).size).toBe(
      1
    );
  });

  it('mints rather than adopts after geo-chat said the event is another call’s', () => {
    expect(needsCuratorLookup(claim('c1'.padEnd(32, '0'), '2026-11-25T16:00:00Z'))).toBe(true);
    expect(
      needsCuratorLookup(claim('c1'.padEnd(32, '0'), '2026-11-25T16:00:00Z', { last_error: CURATOR_EVENT_TAKEN }))
    ).toBe(false);
  });
});
