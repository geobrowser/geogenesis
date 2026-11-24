import { SystemIds } from '@geoprotocol/geo-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from '~/core/sync/store';
import type { GeoEventStream } from '~/core/sync/stream';
import { useTopicCoverage } from '~/core/topics/browse/use-topic-coverage';
import { COVERAGE_TYPE_IDS } from '~/core/topics/ontology';
import type { Entity, Relation } from '~/core/types';

import { TEMPLATE_ONTOLOGY, readEntityRelations } from '../ontology';
import {
  useEntityWithViewerSources,
  useViewerSpaceId,
  useViewerTopicSources,
  viewerTopicSources,
  withViewerSources,
} from './use-viewer-sources';

const mocks = vi.hoisted(() => ({
  personalSpaceId: null as string | null,
  store: null as unknown as GeoStore,
  queryEntityCalls: [] as { id?: string; spaceId?: string; enabled?: boolean }[],
  graphql: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: !!mocks.personalSpaceId }),
}));

// The real store answers the reads, so space filtering and staged (local) relations are the store's own.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: (options: { id?: string; spaceId?: string; enabled?: boolean }) => {
    mocks.queryEntityCalls.push(options);
    if (options.enabled === false || !options.id) return { entity: null, isLoading: false };
    return { entity: mocks.store.getEntity(options.id, { spaceId: options.spaceId }) ?? null, isLoading: false };
  },
  useRelations: ({ selector }: { selector: (r: Relation) => boolean }) =>
    reactiveRelations.get().filter(r => !r.isDeleted && selector(r)),
}));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: mocks.store }) }));
vi.mock('~/core/io/graphql-client', () => ({ graphql: mocks.graphql }));

const PAGE_SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MY_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_SPACE = 'cccccccccccccccccccccccccccccccc';
const PAGE = '11111111111111111111111111111111';
const TOPIC = '22222222222222222222222222222222';
const SRC_PAGE = '33333333333333333333333333333333';
const SRC_MINE = '44444444444444444444444444444444';
const SRC_OTHER = '55555555555555555555555555555555';
const CLAIM = '66666666666666666666666666666666';
const CLAIM_TYPE = '77777777777777777777777777777777';
const ARTICLE_TYPE = COVERAGE_TYPE_IDS[COVERAGE_TYPE_IDS.length - 1];

let relationSeq = 0;
function relation(from: string, to: string, typeId: string, spaceId: string, extra: Partial<Relation> = {}): Relation {
  relationSeq += 1;
  return {
    id: `rel${relationSeq}`.padEnd(32, '0'),
    entityId: `ent${relationSeq}`.padEnd(32, '0'),
    type: { id: typeId, name: null },
    fromEntity: { id: from, name: null },
    toEntity: { id: to, name: `name-${to.slice(0, 2)}`, value: to },
    renderableType: 'RELATION',
    spaceId,
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
    ...extra,
  } as Relation;
}

const sources = (from: string, to: string, spaceId: string, extra?: Partial<Relation>) =>
  relation(from, to, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID, spaceId, extra);
const tagged = (from: string, spaceId: string, extra?: Partial<Relation>) =>
  relation(from, TOPIC, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID, spaceId, extra);

function syncedEntity(
  id: string,
  types: { id: string; name: string | null }[],
  spaceId: string,
  name = `name-${id.slice(0, 2)}`
) {
  syncedEntities.set(id, {
    id,
    name,
    description: null,
    spaces: [spaceId],
    types,
    relations: [],
    values: [],
  } as Entity);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSources() {
  const pageEntity = mocks.store.getEntity(PAGE, { spaceId: PAGE_SPACE }) ?? null;
  const { result } = renderHook(() =>
    useEntityWithViewerSources({ entity: pageEntity, entityId: PAGE, spaceId: PAGE_SPACE })
  );
  return readEntityRelations(result.current, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID).map(r => [
    r.toEntity.id,
    r.spaceId,
  ]);
}

beforeEach(() => {
  reactiveValues.set([]);
  reactiveRelations.set([]);
  syncedEntities.clear();
  mocks.store = new GeoStore({ on: vi.fn(), emit: vi.fn() } as unknown as GeoEventStream);
  mocks.personalSpaceId = null;
  mocks.queryEntityCalls = [];
  mocks.graphql.mockReset();
});

describe('useEntityWithViewerSources (News story / Claim / Event / Post Sources)', () => {
  beforeEach(() => {
    reactiveRelations.set([
      sources(PAGE, SRC_PAGE, PAGE_SPACE),
      sources(PAGE, SRC_MINE, MY_SPACE),
      sources(PAGE, SRC_OTHER, OTHER_SPACE),
    ]);
  });

  it("adds the viewer's own personal-space source after the page's", () => {
    mocks.personalSpaceId = MY_SPACE;
    expect(renderSources()).toEqual([
      [SRC_PAGE, PAGE_SPACE],
      [SRC_MINE, MY_SPACE],
    ]);
  });

  it("never shows another user's personal-space source", () => {
    mocks.personalSpaceId = MY_SPACE;
    expect(renderSources().map(([id]) => id)).not.toContain(SRC_OTHER);
  });

  it('shows a staged (unpublished) link to the person who added it', () => {
    mocks.personalSpaceId = MY_SPACE;
    const staged = '88888888888888888888888888888888';
    mocks.store.setRelation(sources(PAGE, staged, MY_SPACE));
    expect(renderSources().map(([id]) => id)).toEqual([SRC_PAGE, SRC_MINE, staged]);
  });

  it('keeps one row, the page-space one, when both spaces link the same source', () => {
    mocks.personalSpaceId = MY_SPACE;
    mocks.store.setRelation(sources(PAGE, SRC_PAGE, MY_SPACE));
    expect(renderSources()).toEqual([
      [SRC_PAGE, PAGE_SPACE],
      [SRC_MINE, MY_SPACE],
    ]);
  });

  it('signed out: page-space sources only, and the second read stays disabled', () => {
    mocks.personalSpaceId = null;
    expect(renderSources()).toEqual([[SRC_PAGE, PAGE_SPACE]]);
    expect(mocks.queryEntityCalls.every(call => call.enabled === false)).toBe(true);
  });

  it("no second read when the viewer's personal space is the page's", () => {
    mocks.personalSpaceId = PAGE_SPACE;
    expect(renderSources()).toEqual([[SRC_PAGE, PAGE_SPACE]]);
    expect(mocks.queryEntityCalls.every(call => call.enabled === false)).toBe(true);
  });
});

describe('withViewerSources', () => {
  it('takes only Sources from the viewer entity and leaves the page entity alone when there are none', () => {
    const page = { id: PAGE, relations: [sources(PAGE, SRC_PAGE, PAGE_SPACE)] } as Entity;
    const viewerOther = {
      id: PAGE,
      relations: [relation(PAGE, TOPIC, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID, MY_SPACE)],
    } as Entity;
    expect(withViewerSources(page, viewerOther)).toBe(page);
    expect(withViewerSources(page, null)).toBe(page);
    expect(withViewerSources(null, viewerOther)).toBeNull();
  });
});

describe('withViewerSources and claims added from the page (GEO-3836)', () => {
  it("appends the viewer's own Related claims / Subclaims / Notable claims / Quotes links", () => {
    const page = { id: PAGE, relations: [sources(PAGE, SRC_PAGE, PAGE_SPACE)] } as Entity;
    const added = [
      relation(PAGE, CLAIM, TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID, MY_SPACE),
      relation(PAGE, CLAIM, TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID, MY_SPACE),
      relation(PAGE, CLAIM, TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID, MY_SPACE),
      relation(PAGE, CLAIM, TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID, MY_SPACE),
    ];
    const viewer = { id: PAGE, relations: added } as Entity;
    expect(withViewerSources(page, viewer)?.relations).toEqual([...page.relations, ...added]);
  });
});

describe('Topic viewer sources', () => {
  let typeRels: Relation[] = [];
  beforeEach(() => {
    syncedEntity(SRC_MINE, [{ id: ARTICLE_TYPE, name: 'Article' }], MY_SPACE);
    syncedEntity(SRC_OTHER, [{ id: ARTICLE_TYPE, name: 'Article' }], OTHER_SPACE);
    syncedEntity(CLAIM, [{ id: CLAIM_TYPE, name: 'Claim' }], MY_SPACE);
    // The store reads an entity's types from its Types relations.
    const typed = (id: string, typeId: string, typeName: string, spaceId: string) =>
      relation(id, typeId, SystemIds.TYPES_PROPERTY, spaceId, {
        toEntity: { id: typeId, name: typeName, value: typeId },
      });
    typeRels = [
      typed(SRC_MINE, ARTICLE_TYPE, 'Article', MY_SPACE),
      typed(SRC_OTHER, ARTICLE_TYPE, 'Article', OTHER_SPACE),
      typed(CLAIM, CLAIM_TYPE, 'Claim', MY_SPACE),
    ];
  });

  it("lists the viewer's staged source tagged with the topic, not another user's or a claim", () => {
    reactiveRelations.set([...typeRels, tagged(SRC_OTHER, OTHER_SPACE), tagged(CLAIM, MY_SPACE)]);
    mocks.store.setRelation(tagged(SRC_MINE, MY_SPACE));

    const { result } = renderHook(() => useViewerTopicSources(TOPIC, MY_SPACE));
    expect(result.current).toEqual([
      { id: SRC_MINE, name: 'name-44', typeIds: [ARTICLE_TYPE], typeName: 'Article', spaceId: MY_SPACE },
    ]);
  });

  it('is empty without a viewer space', () => {
    reactiveRelations.set([...typeRels, tagged(SRC_MINE, MY_SPACE)]);
    const { result } = renderHook(() => useViewerTopicSources(TOPIC, null));
    expect(result.current).toEqual([]);
  });

  it("dedupes a source tagged twice and drops other spaces' links", () => {
    reactiveRelations.set(typeRels);
    const rels = [tagged(SRC_MINE, MY_SPACE), tagged(SRC_MINE, MY_SPACE), tagged(SRC_OTHER, OTHER_SPACE)];
    expect(viewerTopicSources(rels, TOPIC, MY_SPACE, id => mocks.store.getEntity(id))).toHaveLength(1);
  });

  it('signed out: no viewer space and no extra coverage request', () => {
    mocks.personalSpaceId = null;
    const { result: space } = renderHook(() => useViewerSpaceId(PAGE_SPACE));
    expect(space.current).toBeNull();

    mocks.graphql.mockReturnValue(Effect.succeed({ rows: [], endCursor: null, hasNextPage: false }));
    renderHook(
      () => useTopicCoverage({ topicId: TOPIC, first: 12, spaceIds: undefined, enabled: space.current !== null }),
      { wrapper }
    );
    expect(mocks.graphql).not.toHaveBeenCalled();
  });
});
