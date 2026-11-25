import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation } from '~/core/types';

import { useTemplateSpaceScope, withScopeRelations } from './use-template-space-scope';

const ROUTE = '89bd89bf28ff8a0963faf92a8c905e20'; // World Affairs, rank 9
const ROOT = 'a19c345ab9866679b001d7d2138d88a1'; // rank 0
const POLITICS = '4582fbbee28a16589154f7e36f1ee3c5'; // featured, unranked
const STRAY = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const state = vi.hoisted(() => ({ scope: undefined as string[] | undefined }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => state.scope }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));

function relation(id: string, toId: string, spaceId: string, isDeleted = false): Relation {
  return {
    id,
    entityId: id,
    type: { id: 'prop', name: null },
    fromEntity: { id: 'page', name: null },
    toEntity: { id: toId, name: toId, value: '' },
    renderableType: 'RELATION',
    spaceId,
    isDeleted,
  } as Relation;
}

function page(relations: Relation[]): Entity {
  return { id: 'page', name: 'Page', description: null, spaces: [ROUTE], types: [], relations, values: [] };
}

describe('useTemplateSpaceScope', () => {
  beforeEach(() => {
    state.scope = undefined;
  });

  it('is the route space alone while the canonical spaces resolve', () => {
    const { result } = renderHook(() => useTemplateSpaceScope(ROUTE));
    expect(result.current).toEqual({ spaceIds: [ROUTE], isResolving: true });
  });

  it('puts the route space first, then the rest sorted and deduped, in one list', () => {
    state.scope = [POLITICS, ROUTE.toUpperCase(), ROOT, POLITICS];
    const { result } = renderHook(() => useTemplateSpaceScope(ROUTE));
    expect(result.current).toEqual({ spaceIds: [ROUTE, POLITICS, ROOT], isResolving: false });
  });
});

describe('withScopeRelations', () => {
  it('appends the scope spaces’ relations after the page’s own, best-ranked space first, and no others', () => {
    const own = relation('r-route', 'a', ROUTE);
    const merged = withScopeRelations(
      page([own]),
      {
        relations: [
          own,
          relation('r-politics', 'b', POLITICS),
          relation('r-root', 'c', ROOT),
          relation('r-stray', 'd', STRAY),
          relation('r-deleted', 'e', ROOT, true),
        ],
      },
      [ROUTE, POLITICS, ROOT],
      ROUTE
    );
    expect(merged?.relations.map(item => item.id)).toEqual(['r-route', 'r-root', 'r-politics']);
  });

  it('hands the page entity back untouched when nothing is added', () => {
    const entity = page([relation('r-route', 'a', ROUTE)]);
    expect(withScopeRelations(entity, { relations: [relation('r-stray', 'd', STRAY)] }, [ROUTE], ROUTE)).toBe(entity);
    expect(withScopeRelations(entity, null, [ROUTE, ROOT], ROUTE)).toBe(entity);
  });
});
