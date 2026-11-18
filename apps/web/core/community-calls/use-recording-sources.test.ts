import { renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';

import { useRecordingSources } from './use-recording-sources';

const mocks = vi.hoisted(() => ({ relations: [] as Relation[] }));
vi.mock('~/core/sync/use-store', () => ({ useRelations: () => mocks.relations }));

const rel = (toId: string, value: string) =>
  ({ fromEntity: { id: 'e' }, type: { id: 'r' }, spaceId: 's', toEntity: { id: toId, value } }) as unknown as Relation;

describe('useRecordingSources', () => {
  it('drops a published Video with nothing playable, keeps playable and local ones', () => {
    mocks.relations = [rel('v1', ''), rel('v2', 'ipfs://bafy'), rel('v3', 'v3')];
    const { result } = renderHook(() => useRecordingSources({ entityId: 'e', spaceId: 's', relationTypeId: 'r' }));
    expect(result.current).toEqual([
      { directUrl: 'ipfs://bafy', videoEntityId: 'v2' },
      { directUrl: null, videoEntityId: 'v3' },
    ]);
  });
});
