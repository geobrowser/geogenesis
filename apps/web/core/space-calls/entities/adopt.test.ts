import { describe, expect, it, vi } from 'vitest';

import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import type { Entity } from '~/core/types';

import { findCuratorCallEvents } from './adopt';
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

const event = (id: string, originalStart: string) =>
  ({
    id,
    values: [{ property: { id: EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY }, value: originalStart }],
    relations: [],
  }) as unknown as Entity;

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
      { backlinks, entities: vi.fn() }
    );
    expect(backlinks).not.toHaveBeenCalled();
  });
});
