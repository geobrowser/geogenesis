import { SystemIds } from '@geoprotocol/geo-sdk';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zonedDay } from '../debate-hours';
import { AGENDA_TIME_ZONE, DEBATE_AGENDA_DATE_PROPERTY_ID, useDebateAgendas } from './debate-agendas';

const WORLD = '89bd89bf28ff8a0963faf92a8c905e20';
const CLAIM = 'c0000000000000000000000000000001';

const mocks = vi.hoisted(() => ({
  agendas: { entities: [] as unknown[], isLoading: false },
  blocks: { entities: [] as unknown[], isLoading: false },
  claims: { entities: [] as unknown[], isLoading: false },
}));

// The agendas, then their blocks: told apart by what they ask for.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where, enabled }: { where: { types?: unknown }; enabled: boolean }) => {
    const hop = where.types ? mocks.agendas : mocks.blocks;
    return { entities: enabled ? hop.entities : [], isLoading: enabled && hop.isLoading, error: null };
  },
}));

vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => ({
    entities: ids.length > 0 ? mocks.claims.entities : [],
    isLoading: ids.length > 0 && mocks.claims.isLoading,
    error: null,
  }),
}));

describe('useDebateAgendas', () => {
  beforeEach(() => {
    const today = zonedDay(new Date(), AGENDA_TIME_ZONE);
    mocks.agendas = {
      entities: [
        {
          id: 'agenda-today',
          spaces: [WORLD],
          values: [
            { property: { id: DEBATE_AGENDA_DATE_PROPERTY_ID }, spaceId: WORLD, value: `${today}T00:00:00-04:00` },
          ],
          relations: [{ type: { id: SystemIds.BLOCKS }, toEntity: { id: 'block-1' }, position: 'a0', spaceId: WORLD }],
        },
      ],
      isLoading: false,
    };
    mocks.blocks = {
      entities: [
        {
          id: 'block-1',
          name: 'Brazil election',
          relations: [
            {
              type: { id: SystemIds.COLLECTION_ITEM_RELATION_TYPE },
              toEntity: { id: CLAIM },
              position: 'a0',
              spaceId: WORLD,
            },
          ],
        },
      ],
      isLoading: false,
    };
    mocks.claims = { entities: [{ id: CLAIM, name: 'A claim' }], isLoading: false };
  });

  // Empty agendas mean "none" only once every hop has answered; the picker's landing waits on this.
  it.each([
    ['the agendas', () => (mocks.agendas.isLoading = true)],
    ['their blocks', () => (mocks.blocks.isLoading = true)],
    ['the claims the blocks hold', () => (mocks.claims.isLoading = true)],
  ])('reports loading while %s are still on their way', (_hop, pending) => {
    pending();
    const { result } = renderHook(() => useDebateAgendas());
    expect(result.current.isLoading).toBe(true);
  });

  it('lists the newest agenda’s claims once every hop has answered', () => {
    const { result } = renderHook(() => useDebateAgendas());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.spaceIds).toEqual([WORLD]);
    expect(result.current.claimIds).toEqual([CLAIM]);
    const agendas = result.current.agendasIn(() => true);
    expect(agendas.spaces[0]!.sections.map(section => [section.name, section.claimIds])).toEqual([
      ['Brazil election', [CLAIM]],
    ]);
    expect(result.current.agendasIn(() => false).spaces).toEqual([]);
  });

  it('asks for nothing with the flag off', () => {
    const { result } = renderHook(() => useDebateAgendas(false));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.spaceIds).toEqual([]);
    expect(result.current.claimIds).toEqual([]);
    expect(result.current.agendasIn(() => true).spaces).toEqual([]);
  });
});
