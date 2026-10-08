import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnsweredClaimEntities } from './answered-claim-entities';
import type { ClaimPickerEntity } from './claim-picker-page';

const state = vi.hoisted(() => ({
  votedBy: { entities: undefined, isLoading: false, error: null } as {
    entities: ClaimPickerEntity[] | undefined;
    isLoading: boolean;
    error: Error | null;
  },
  byIdLoading: false,
  byIdError: null as Error | null,
  byIdEntities: [] as ClaimPickerEntity[],
  byIdCalls: [] as string[][],
  votedByCalls: [] as Array<string | null>,
}));

vi.mock('./claim-picker-page', () => ({
  useClaimEntitiesVotedBy: (profileSpaceId: string | null) => {
    state.votedByCalls.push(profileSpaceId);
    return state.votedBy;
  },
  useClaimEntitiesByIds: (ids: string[]) => {
    state.byIdCalls.push(ids);
    if (ids.length === 0) return { entities: [], isLoading: false, error: null };
    return {
      entities: state.byIdLoading ? [] : state.byIdEntities.filter(entity => ids.includes(entity.id)),
      isLoading: state.byIdLoading,
      error: state.byIdError,
    };
  },
}));

function entity(id: string): ClaimPickerEntity {
  return { id, name: id, description: null, spaces: [], values: [], relations: [] };
}

const A = '0199aaaa000000000000000000000001';
const B = '0199aaaa000000000000000000000002';
const C = '0199aaaa000000000000000000000003';

beforeEach(() => {
  state.votedBy = { entities: undefined, isLoading: false, error: null };
  state.byIdLoading = false;
  state.byIdError = null;
  state.byIdEntities = [];
  state.byIdCalls.length = 0;
  state.votedByCalls.length = 0;
});

describe('useAnsweredClaimEntities', () => {
  // The whole point: nothing here waits on the ids, so the read starts with positions.
  it('asks by person before any ids exist, and asks nothing by id meanwhile', () => {
    state.votedBy = { entities: undefined, isLoading: true, error: null };
    const { result } = renderHook(() => useAnsweredClaimEntities('person-1', [A, B]));

    expect(state.votedByCalls).toContain('person-1');
    expect(state.byIdCalls.flat()).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('asks by id for nothing when the answer already has every claim', () => {
    state.votedBy = { entities: [entity(A), entity(B)], isLoading: false, error: null };
    const { result } = renderHook(() => useAnsweredClaimEntities('person-1', [A, B]));

    expect(state.byIdCalls.flat()).toEqual([]);
    expect(result.current.entities.map(row => row.id)).toEqual([A, B]);
    expect(result.current.isLoading).toBe(false);
  });

  // Ids from geo-chat or an in-flight write can be hyphenated; the graph's are bare hex.
  it('matches ids across spellings, so a hyphenated one is not fetched again', () => {
    state.votedBy = { entities: [entity(A)], isLoading: false, error: null };
    renderHook(() => useAnsweredClaimEntities('person-1', ['0199aaaa-0000-0000-0000-000000000001']));

    expect(state.byIdCalls.flat()).toEqual([]);
  });

  // A response newer than the answer. Topped up by id, and not waited for: on a first load the
  // only ids here are ones that are not claims, and waiting would restore the dependent hop.
  it('tops up what the answer is missing by id, without waiting for it', () => {
    state.votedBy = { entities: [entity(A)], isLoading: false, error: null };
    state.byIdEntities = [entity(C)];
    state.byIdLoading = true;
    const { result, rerender } = renderHook(() => useAnsweredClaimEntities('person-1', [C, A]));

    expect(state.byIdCalls).toContainEqual([C]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.entities.map(row => row.id)).toEqual([A]);

    state.byIdLoading = false;
    rerender();
    expect(result.current.entities.map(row => row.id)).toEqual([A, C]);
  });

  // The old lookup is still there underneath: a failed `votedBy` read hands the whole list to it,
  // and then it *is* waited for, since it is the only answer.
  it('falls back to the by-id lookup for everything when the votedBy read fails', () => {
    state.votedBy = { entities: undefined, isLoading: false, error: new Error('votedBy down') };
    state.byIdEntities = [entity(A), entity(B)];
    state.byIdLoading = true;
    const { result, rerender } = renderHook(() => useAnsweredClaimEntities('person-1', [A, B]));

    expect(state.byIdCalls).toContainEqual([A, B]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();

    state.byIdLoading = false;
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.entities.map(row => row.id)).toEqual([A, B]);
  });

  it('reports a failure only when the by-id lookup fails as well', () => {
    const failure = new Error('graph down');
    state.votedBy = { entities: undefined, isLoading: false, error: new Error('votedBy down') };
    state.byIdError = failure;
    const { result } = renderHook(() => useAnsweredClaimEntities('person-1', [A]));

    expect(result.current.error).toBe(failure);
  });

  // No participant yet — the viewer's identity is still being exchanged. Idle, not loading; the
  // page's own identity gate is what holds the badge there.
  it('is idle without a participant', () => {
    const { result } = renderHook(() => useAnsweredClaimEntities(null, []));

    expect(state.votedByCalls).toContain(null);
    expect(result.current).toEqual({ entities: [], isLoading: false, error: null });
  });
});
