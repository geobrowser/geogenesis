import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  unscopedEntity: null as null | Record<string, unknown>,
  calls: [] as Array<{ id: string; spaceId?: string; enabled: boolean }>,
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: (input: { id: string; spaceId?: string; enabled: boolean }) => {
    mocks.calls.push(input);
    return input.spaceId
      ? { entity: { id: input.id, spaces: [input.spaceId], values: [] }, isLoading: false }
      : { entity: mocks.unscopedEntity, isLoading: false };
  },
}));

const { useSidePanelEntityScope } = await import('./use-side-panel-entity-scope');

const ENTITY_ID = '11111111111111111111111111111111';
const PERSONAL_SPACE_ID = '22222222222222222222222222222222';
const HIGHER_RANKED_SPACE_ID = '33333333333333333333333333333333';

beforeEach(() => {
  mocks.calls = [];
  mocks.unscopedEntity = {
    id: ENTITY_ID,
    spaces: [PERSONAL_SPACE_ID, HIGHER_RANKED_SPACE_ID],
    values: [
      {
        property: { id: SystemIds.NAME_PROPERTY },
        spaceId: HIGHER_RANKED_SPACE_ID,
        value: 'Profile in another space',
      },
    ],
  };
});

describe('useSidePanelEntityScope', () => {
  it('keeps an explicitly forced personal-space scope for a multi-space entity', () => {
    const { result } = renderHook(() =>
      useSidePanelEntityScope(ENTITY_ID, PERSONAL_SPACE_ID, {
        preferRequestedSpace: false,
        forceRequestedSpace: true,
      })
    );

    expect(result.current.effectiveSpaceId).toBe(PERSONAL_SPACE_ID);
    expect(mocks.calls.at(-1)?.spaceId).toBe(PERSONAL_SPACE_ID);
  });

  it('continues deriving the normal home space when the caller does not force a scope', () => {
    const { result } = renderHook(() =>
      useSidePanelEntityScope(ENTITY_ID, PERSONAL_SPACE_ID, { preferRequestedSpace: false })
    );

    expect(result.current.effectiveSpaceId).toBe(HIGHER_RANKED_SPACE_ID);
  });
});
