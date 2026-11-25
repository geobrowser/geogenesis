import { ContentIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook, waitFor } from '@testing-library/react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { EntityQuery, type WhereCondition } from '~/core/sync/experimental_query-layer';
import type { Entity, Relation } from '~/core/types';
import { RANKED_SPACE_IDS } from '~/core/utils/space/space-ranking';

import { TEMPLATE_ONTOLOGY } from '../ontology';
import { CLAIM_STANCE_VOTE_KIND, activeStanceVotes, aggregateClaimVotes } from './topic-claim-votes';
import { useLiveClaimTemplate } from './use-live-claim-template';
import { useLiveEventTemplate } from './use-live-event-template';
import { useLiveNewsStoryTemplate } from './use-live-news-story-template';
import { useLivePodcastEpisodeTemplate } from './use-live-podcast-episode-template';
import { useLivePodcastShowTemplate } from './use-live-podcast-show-template';
import { useLivePostTemplate } from './use-live-post-template';
import { useLiveSourceTemplate } from './use-live-source-template';
import { useLiveTopicTemplate } from './use-live-topic-template';

// Template lists hold the canonical spaces' items (`useTemplateSpaceScope`): the route space plus the
// other canonical spaces, never a space outside them. The store runs the real local `where` matcher,
// so a query missing its space clause lists the stray space's entities too.

const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
/** Another canonical space, Featured (US Politics): it comes from `useTopicSpaceScope`. */
const OTHER = '4582fbbee28a16589154f7e36f1ee3c5';
/** A ranked space that is not Featured (Podcasts): only `RANKED_SPACE_IDS` brings it in. */
const RANKED = 'b5a31f8182b042437ede0f84ee02f104';
/** The ranked spaces after the route space, in rank order. */
const RANKED_REST = RANKED_SPACE_IDS.filter(id => id !== SPACE);
/** The whole canonical scope with `state.scope = [OTHER, SPACE]`: route, ranked, then the rest. */
const SCOPE = [SPACE, ...RANKED_REST, OTHER];
/** A space outside the canonical set: nothing from it may show. */
const STRAY = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const VIEWER = 'dddddddddddddddddddddddddddddddd';
const PAGE = '4ed3162278994f29bde7a6f7cf60e28e';
/** `SPACE` as a dashed, uppercase UUID: the store's space ids are dashless lowercase. */
const SPACE_DASHED = '89BD89BF-28FF-8A09-63FA-F92A8C905E20';

const state = vi.hoisted(() => ({
  /** What `useTopicSpaceScope` answers; undefined while it resolves. */
  scope: undefined as string[] | undefined,
  page: null as Entity | null,
  /** Every `useQuery` call's options, so a test can run a feed's `queryFn`. */
  queries: [] as { queryKey: unknown[]; queryFn?: (ctx: { signal?: AbortSignal }) => Promise<unknown> }[],
  taggedReads: [] as { spaceIds: string[] }[],
  corpus: [] as Entity[],
  viewerSpaceId: null as string | null,
  /** `relationSpaceId` is where the source's Topics link was published; defaults to `spaceId`. */
  coverage: [] as {
    entityId: string;
    spaceId: string;
    title: string;
    types?: { id: string; name: string | null }[];
    relationSpaceId?: string;
  }[],
  tweetAuthors: undefined as Map<string, { name?: string; handle?: string; avatarUrl?: string | null }> | undefined,
  entityReads: [] as { id?: string; spaceId?: string }[],
  infiniteQueries: [] as { queryKey: unknown[]; queryFn: (ctx: { pageParam: string | null }) => Promise<unknown> }[],
  graphqlVariables: [] as Record<string, unknown>[],
  votes: undefined as unknown,
  /** Topic feed claims, and which of them the viewed space tagged (null: still checking). */
  feedClaims: undefined as { entityId: string; title: string; spaceId: string }[] | undefined,
  /** Best-ranked topic feed claims and best debates (GEO-3868). */
  bestClaims: undefined as { entityId: string; title: string; spaceId: string }[] | undefined,
  bestDebates: undefined as
    | {
        items: { entityId: string; title: string; spaceId: string; debateClaim?: { entityId: string; name: string } }[];
        fromSpaceFeed: boolean;
      }
    | undefined,
  taggedInSpace: null as Set<string> | null,
  feedNews: undefined as
    | { items: { entityId: string; title: string; spaceId: string; createdAtSec: number }[]; fromSpaceFeed: boolean }
    | undefined,
}));

const mocks = vi.hoisted(() => ({
  useClaimRecord: vi.fn(),
  useTopicCoverage: vi.fn(),
  useTopicConnectionCounts: vi.fn(),
}));

vi.mock('~/core/sync/use-store', () => ({
  useValues: () => [],
  // Like the store: a read in a space keeps only that space's relations; an unscoped read keeps all.
  useQueryEntity: (args: { id?: string; spaceId?: string; enabled?: boolean }) => {
    state.entityReads.push({ id: args.id, spaceId: args.spaceId });
    if (args.enabled === false || !state.page) return { entity: null, isLoading: false };
    const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
    const relations = args.spaceId
      ? state.page.relations.filter(relation => norm(relation.spaceId) === norm(args.spaceId!))
      : state.page.relations;
    return { entity: { ...state.page, relations }, isLoading: false };
  },
  useQueryEntities: ({
    where,
    first,
    enabled = true,
    sort,
  }: {
    where: WhereCondition;
    first?: number;
    enabled?: boolean;
    sort?: { propertyId: string; direction: 'asc' | 'desc' };
  }) => {
    if (!enabled) return { entities: [], isLoading: false };
    let matched = new EntityQuery(state.corpus).where(where).execute();
    // Stands in for the server's property order: newest value first, entities without one after.
    if (sort) {
      const valueOf = (entity: Entity) =>
        entity.values.find(value => value.property.id === sort.propertyId)?.value ?? null;
      matched = [...matched].sort((a, b) => {
        const left = valueOf(a);
        const right = valueOf(b);
        if (left === null || right === null) return left === null ? (right === null ? 0 : 1) : -1;
        return sort.direction === 'desc' ? right.localeCompare(left) : left.localeCompare(right);
      });
    }
    return { entities: first ? matched.slice(0, first) : matched, isLoading: false };
  },
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (options: { queryKey: unknown[]; queryFn?: (ctx: { signal?: AbortSignal }) => Promise<unknown> }) => {
    state.queries.push(options);
    const { queryKey } = options;
    return {
      data:
        queryKey[1] === 'multi-space-votes'
          ? state.votes
          : queryKey[1] === 'tweet-authors'
            ? state.tweetAuthors
            : queryKey[1] === 'top-claims'
              ? state.feedClaims
              : queryKey[1] === 'best-claims'
                ? state.bestClaims
                : queryKey[1] === 'best-debates'
                  ? state.bestDebates
                  : queryKey[1] === 'best-news'
                    ? state.feedNews
                    : undefined,
      isLoading: false,
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: (options: (typeof state.infiniteQueries)[number]) => {
    state.infiniteQueries.push(options);
    return { data: undefined, isLoading: false, hasNextPage: false, fetchNextPage: vi.fn() };
  },
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ variables, decoder }: { variables: Record<string, unknown>; decoder: (data: unknown) => unknown }) => {
    state.graphqlVariables.push(variables);
    return Effect.succeed(decoder({}));
  },
}));

vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => state.scope }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: () => ({ data: undefined }),
}));
vi.mock('./use-live-entity-actions', () => ({ useLiveEntityActions: () => ({}) }));
vi.mock('./use-topic-tagged-in-space', () => ({
  useTopicTaggedInSpace: ({ entityIds, spaceIds }: { entityIds: string[]; spaceIds: string[] }) => {
    state.taggedReads.push({ spaceIds });
    return { tagged: state.taggedInSpace, isLoading: entityIds.length > 0 && state.taggedInSpace === null };
  },
}));
vi.mock('./use-viewer-sources', () => ({
  useEntityWithViewerSources: ({ entity }: { entity: Entity | null }) => entity,
  useViewerSpaceId: () => state.viewerSpaceId,
  useViewerTopicSources: () => [],
}));
vi.mock('./use-hydrated-source-cards', () => ({
  useHydratedSourceCards: () => ({ items: [], isLoading: false }),
  usePostAuthorMetadata: () => undefined,
}));
vi.mock('./use-template-claim-vote-counts', () => ({
  useTemplateClaimVoteCounts: () => ({ countsFor: () => null, labelFor: (_: string, label: string) => label }),
}));
vi.mock('./use-topic-media-batch', () => ({
  useTopicMediaBatch: () => ({ data: undefined }),
  useEntitySummaryBatch: () => ({ data: undefined }),
}));
vi.mock('./use-debate-participants-batch', () => ({
  useDebateParticipantsBatch: () => ({ data: undefined }),
  resolveDebateStillSrc: () => null,
}));
vi.mock('~/core/claims/browse/use-claim-record', () => ({ useClaimRecord: mocks.useClaimRecord }));
vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  claimTitleFrom: ({ entity }: { entity: Entity | null }) => entity?.name ?? null,
  useClaimResponseState: () => ({
    claim: null,
    positions: [],
    readiness: 'ready',
    isResponseKindResolved: true,
    isViewerResponseResolved: true,
    responseBlockedReason: null,
    summary: { positive: 0, negative: 0, total: 0, percent: undefined, isControversial: false },
  }),
}));
vi.mock('~/core/debates/hooks', () => ({ useDebateClaims: () => ({ data: undefined }) }));
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  useClaimPositionControl: () => ({ respond: vi.fn(), responseError: null, viewerPosition: null }),
}));
vi.mock('~/core/debates/claims-best-order', () => ({
  useClaimsBestOrder: () => ({ rankByClaimId: new Map(), isReady: true }),
  sortClaimsByBest: (page: Entity[]) => page,
}));
vi.mock('~/core/topics/browse/use-topic-ancestors', () => ({ useTopicAncestors: () => [] }));
vi.mock('~/core/topics/browse/use-topic-connection-counts', () => ({
  useTopicConnectionCounts: mocks.useTopicConnectionCounts,
}));
vi.mock('~/core/topics/browse/use-topic-coverage', () => ({ useTopicCoverage: mocks.useTopicCoverage }));

function relation(typeId: string, toId: string, spaceId: string, toName = toId): Relation {
  return {
    id: `${typeId}-${toId}-${spaceId}`,
    entityId: `${typeId}-${toId}-${spaceId}`,
    type: { id: typeId, name: null },
    fromEntity: { id: 'from', name: null },
    toEntity: { id: toId, name: toName, value: '' },
    renderableType: 'RELATION',
    spaceId,
  } as Relation;
}

/** An entity living in `spaceId` that points at the page through `typeId`. */
function linked(id: string, name: string, spaceId: string, typeIds: string[], linkTypeId: string): Entity {
  return {
    id,
    name,
    description: null,
    spaces: [spaceId],
    types: typeIds.map(type => ({ id: type, name: null })),
    relations: [relation(linkTypeId, PAGE, spaceId)],
    values: [],
  };
}

/** A News event's `Event date` value, as the store holds it. */
function eventDate(entityId: string, spaceId: string, date: string): Entity['values'][number] {
  return {
    id: `${entityId}-date`,
    entity: { id: entityId, name: null },
    spaceId,
    property: { id: TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID, name: 'Event date', dataType: 'DATETIME' },
    value: date,
  } as Entity['values'][number];
}

function pageEntity(typeId: string, relations: Relation[] = []): Entity {
  return {
    id: PAGE,
    name: 'Page',
    description: null,
    spaces: [SPACE],
    types: [{ id: typeId, name: null }],
    relations,
    values: [],
  };
}

beforeEach(() => {
  state.scope = [OTHER, SPACE];
  state.queries = [];
  state.taggedReads = [];
  state.page = null;
  state.corpus = [];
  state.viewerSpaceId = null;
  state.coverage = [];
  state.entityReads = [];
  state.infiniteQueries = [];
  state.graphqlVariables = [];
  state.votes = undefined;
  state.tweetAuthors = undefined;
  state.feedClaims = undefined;
  state.bestClaims = undefined;
  state.bestDebates = undefined;
  state.taggedInSpace = null;
  state.feedNews = undefined;
  mocks.useClaimRecord.mockReset().mockReturnValue({
    claimRows: [],
    debateRows: [],
    claimsLoading: false,
    debatesLoading: false,
    claimsTotal: 0,
    debatesTotal: 0,
  });
  mocks.useTopicConnectionCounts.mockReset().mockReturnValue({ countsByTopicId: null });
  mocks.useTopicCoverage
    .mockReset()
    // Rows come back even while disabled, as a cached query's would.
    .mockImplementation(
      ({ spaceIds, scopeRelationToSpaces }: { spaceIds?: string[]; scopeRelationToSpaces?: boolean }) => ({
        page: {
          rows: state.coverage
            .filter(row => spaceIds === undefined || spaceIds.includes(row.spaceId))
            .filter(
              row =>
                !scopeRelationToSpaces ||
                spaceIds === undefined ||
                spaceIds.includes(row.relationSpaceId ?? row.spaceId)
            )
            .map(({ relationSpaceId: _relationSpaceId, ...row }) => ({
              ...row,
              types: row.types ?? [],
              createdAtSec: 0,
              description: null,
              imageUrl: null,
            })),
          endCursor: null,
          hasNextPage: false,
        },
        isLoading: false,
      })
    );
});

describe('Claim template', () => {
  it('lists sub-claims and quotes from every canonical space, never a stray one', () => {
    state.page = pageEntity(CLAIM_TYPE_ID);
    state.corpus = [
      linked('a1', 'Supports, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('a2', 'Supports, elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('a3', 'Supports, stray', STRAY, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('b1', 'Opposes, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
      linked('b2', 'Opposes, elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
      linked('b3', 'Opposes, stray', STRAY, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
      linked(
        'q1',
        'Quote, here',
        SPACE,
        [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID],
        TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID
      ),
      linked(
        'q2',
        'Quote, elsewhere',
        OTHER,
        [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID],
        TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID
      ),
      linked(
        'q3',
        'Quote, stray',
        STRAY,
        [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID],
        TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID
      ),
    ];

    const { result } = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.subClaims?.map(claim => claim.title).sort()).toEqual([
      'Opposes, elsewhere',
      'Opposes, here',
      'Supports, elsewhere',
      'Supports, here',
    ]);
    // A row in another canonical space links to that space.
    expect(model.subClaims?.find(claim => claim.title === 'Supports, elsewhere')?.href).toContain(OTHER);
    const quotes = model.sections.find(section => section.id === 'quotes');
    expect(quotes?.items.map(item => item.title)).toEqual(['Quote, here', 'Quote, elsewhere']);
  });

  it('lists the claim’s own links from every canonical space, the route space’s first', () => {
    state.page = pageEntity(CLAIM_TYPE_ID, [
      relation(TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID, 's1', SPACE, 'Supported here'),
      relation(TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID, 's2', OTHER, 'Supported elsewhere'),
      relation(TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID, 's3', STRAY, 'Supported stray'),
      relation(TEMPLATE_ONTOLOGY.QUOTES_THAT_OPPOSE_CLAIMS_PROPERTY_ID, 'o1', OTHER, 'Opposing quote elsewhere'),
      relation(TEMPLATE_ONTOLOGY.QUOTES_THAT_OPPOSE_CLAIMS_PROPERTY_ID, 'o2', STRAY, 'Opposing quote stray'),
      relation(TOPICS_PROPERTY_ID, 'topic-here', SPACE),
      relation(TOPICS_PROPERTY_ID, 'topic-elsewhere', OTHER),
      relation(TOPICS_PROPERTY_ID, 'topic-stray', STRAY),
    ]);

    const { result } = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.subClaims?.map(claim => claim.title)).toEqual(['Supported here', 'Supported elsewhere']);
    expect(model.sections.find(section => section.id === 'opposing-quotes')?.items.map(item => item.title)).toEqual([
      'Opposing quote elsewhere',
    ]);
    expect(mocks.useClaimRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ topicIds: ['topic-here', 'topic-elsewhere'] })
    );
  });

  it('lists the route and ranked spaces alone while the Featured and viewer spaces are still resolving', () => {
    state.scope = undefined;
    state.page = pageEntity(CLAIM_TYPE_ID, [
      relation(TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID, 's2', OTHER, 'Supported elsewhere'),
    ]);
    state.corpus = [
      linked('a1', 'Supports, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('a2', 'Supports, elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('a3', 'Supports, ranked', RANKED, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
    ];

    const { result } = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));

    expect(result.current.data!.subClaims?.map(claim => claim.title)).toEqual(['Supports, here', 'Supports, ranked']);
    expect(mocks.useClaimRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ spaceIds: [SPACE, ...RANKED_REST] })
    );
  });

  it('splits supporting and opposing quotes into their own sections', () => {
    // Named like the live properties, so an unexcluded one would show under Properties.
    const quote = (id: string, typeId: string) => {
      const rel = relation(typeId, id, SPACE, `Quote ${id}`);
      return { ...rel, type: { id: typeId, name: 'Quotes that oppose or support claims' } } as Relation;
    };
    state.page = pageEntity(CLAIM_TYPE_ID, [
      quote('s1', TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_LIVE_PROPERTY_ID),
      quote('s2', TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY_ID),
      quote('o1', TEMPLATE_ONTOLOGY.QUOTES_THAT_OPPOSE_CLAIMS_PROPERTY_ID),
    ]);
    state.corpus = [
      linked('s3', 'Quote s3', SPACE, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('o2', 'Quote o2', SPACE, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
    ];

    const { result } = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));
    const model = result.current.data!;

    const supporting = model.sections.find(section => section.id === 'quotes');
    const opposing = model.sections.find(section => section.id === 'opposing-quotes');
    expect(supporting?.title).toBe('Supporting quotes');
    expect(supporting?.items.map(item => item.title)).toEqual(['Quote s1', 'Quote s2', 'Quote s3']);
    expect(opposing?.title).toBe('Opposing quotes');
    expect(opposing?.items.map(item => item.title)).toEqual(['Quote o1', 'Quote o2']);
    // Shown as a section, so not repeated under Properties.
    const propertyLabels = (model.graphConnections ?? []).flatMap(group => group.items.map(item => item.label));
    expect(propertyLabels).not.toContain('Quote o1');
  });

  it('shows no opposing quotes section for a claim without any', () => {
    state.page = pageEntity(CLAIM_TYPE_ID, [
      relation(TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_LIVE_PROPERTY_ID, 's1', SPACE, 'Quote s1'),
    ]);

    const { result } = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));

    expect(result.current.data!.sections.some(section => section.id === 'opposing-quotes')).toBe(false);
  });

  it('reads more claims in the topic and debates in every canonical space, the route space first', () => {
    state.page = pageEntity(CLAIM_TYPE_ID, [relation(TOPICS_PROPERTY_ID, 'topic', SPACE)]);
    renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));

    expect(mocks.useClaimRecord).toHaveBeenCalledWith({
      claimId: PAGE,
      spaceId: SPACE,
      spaceIds: SCOPE,
      topicIds: ['topic'],
    });
  });
});

describe('A route space id written differently', () => {
  it('still matches the store for Claim, Source and Event lists', () => {
    const sources = TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID;
    state.corpus = [
      linked('a1', 'Supports, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('c1', 'Cites, here', SPACE, [CLAIM_TYPE_ID], sources),
      linked('e1', 'Related, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID),
    ];

    state.page = pageEntity(CLAIM_TYPE_ID);
    const claim = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE_DASHED }));
    expect(claim.result.current.data!.subClaims?.map(item => item.title)).toEqual(['Supports, here']);

    state.page = pageEntity(TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID);
    const source = renderHook(() => useLiveSourceTemplate({ entityId: PAGE, spaceId: SPACE_DASHED }));
    expect(source.result.current.data!.supportedClaims.map(item => item.title)).toEqual(['Cites, here']);

    state.page = pageEntity(ContentIds.NEWS_EVENT_TYPE);
    const event = renderHook(() => useLiveEventTemplate({ entityId: PAGE, spaceId: SPACE_DASHED }));
    expect(event.result.current.data!.claims.map(item => item.title)).toEqual(['Related, here']);
  });
});

describe('Event template', () => {
  it('lists related claims from every canonical space, never a stray one', () => {
    state.page = pageEntity(ContentIds.NEWS_EVENT_TYPE);
    state.corpus = [
      linked('c1', 'Claim here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID),
      linked('c2', 'Claim elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID),
      linked('c3', 'Claim stray', STRAY, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID),
    ];

    const { result } = renderHook(() => useLiveEventTemplate({ entityId: PAGE, spaceId: SPACE }));

    expect(result.current.data!.claims.map(claim => claim.title)).toEqual(['Claim here', 'Claim elsewhere']);
  });
});

describe('Source template', () => {
  it('lists citing claims, quotes and stories from every canonical space, never a stray one', () => {
    state.page = pageEntity(TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID);
    const sources = TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID;
    state.corpus = [
      linked('c1', 'Claim here', SPACE, [CLAIM_TYPE_ID], sources),
      linked('c2', 'Claim elsewhere', OTHER, [CLAIM_TYPE_ID], sources),
      linked('q1', 'Quote here', SPACE, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], sources),
      linked('q2', 'Quote elsewhere', OTHER, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], sources),
      linked('s1', 'Story here', SPACE, [TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID], sources),
      linked('s2', 'Story elsewhere', OTHER, [TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID], sources),
      linked('c3', 'Claim stray', STRAY, [CLAIM_TYPE_ID], sources),
      linked('q3', 'Quote stray', STRAY, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], sources),
      linked('s3', 'Story stray', STRAY, [TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID], sources),
    ];

    const { result } = renderHook(() => useLiveSourceTemplate({ entityId: PAGE, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.supportedClaims.map(claim => claim.title).sort()).toEqual(['Claim elsewhere', 'Claim here']);
    expect(model.quotes?.map(quote => quote.text).sort()).toEqual(['Quote elsewhere', 'Quote here']);
    expect(
      model.sections
        .find(section => section.id === 'cited-by')
        ?.items.map(item => item.title)
        .sort()
    ).toEqual(['Story elsewhere', 'Story here']);
  });
});

describe('Podcast show template', () => {
  it('asks for episodes in every canonical space, in one request', async () => {
    state.page = pageEntity(TEMPLATE_ONTOLOGY.PODCAST_TYPE_ID);
    renderHook(() => useLivePodcastShowTemplate({ entityId: PAGE, spaceId: SPACE }));

    const episodes = state.infiniteQueries.at(-1)!;
    expect(episodes.queryKey).toContain(SPACE);
    await episodes.queryFn({ pageParam: null });
    expect(state.graphqlVariables.at(-1)).toMatchObject({ showId: PAGE, spaceIds: SCOPE });
  });
});

describe('Templates drawn from the page entity alone', () => {
  // Post, News story and Episode list only the page entity's own relations, which the store
  // filters to the space the entity is read in.
  it.each([
    ['Post', useLivePostTemplate, TEMPLATE_ONTOLOGY.POST_TYPE_ID],
    ['News story', useLiveNewsStoryTemplate, TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID],
    ['Episode', useLivePodcastEpisodeTemplate, TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID],
  ] as const)('%s reads the page entity in the viewed space', (_, useTemplate, typeId) => {
    state.page = pageEntity(typeId);
    renderHook(() => useTemplate({ entityId: PAGE, spaceId: SPACE }));

    expect(state.entityReads).toContainEqual({ id: PAGE, spaceId: SPACE });
  });
});

describe('Topic template', () => {
  function topicCorpus() {
    state.page = pageEntity(TEMPLATE_ONTOLOGY.TOPIC_TYPE_ID);
    state.corpus = [
      linked('c1', 'Claim here', SPACE, [CLAIM_TYPE_ID], TOPICS_PROPERTY_ID),
      linked('c2', 'Claim elsewhere', OTHER, [CLAIM_TYPE_ID], TOPICS_PROPERTY_ID),
      linked('e1', 'Event here', SPACE, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
      linked('e2', 'Event elsewhere', OTHER, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
      linked('c4', 'Claim stray', STRAY, [CLAIM_TYPE_ID], TOPICS_PROPERTY_ID),
      linked('e4', 'Event stray', STRAY, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
      // In the viewed space, but tagged with this topic only from a space outside the canonical set.
      {
        ...linked('c3', 'Claim tagged in a stray space', SPACE, [CLAIM_TYPE_ID], TOPICS_PROPERTY_ID),
        relations: [relation(TOPICS_PROPERTY_ID, PAGE, STRAY)],
      },
      {
        ...linked(
          'e3',
          'Event tagged in a stray space',
          SPACE,
          [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID],
          TOPICS_PROPERTY_ID
        ),
        relations: [relation(TOPICS_PROPERTY_ID, PAGE, STRAY)],
      },
    ];
    state.coverage = [
      { entityId: 'r1', spaceId: SPACE, title: 'Source here' },
      { entityId: 'r2', spaceId: OTHER, title: 'Source elsewhere' },
      // An episode tagged with this topic only in a ranked, non-Featured space (Podcasts).
      { entityId: 'r6', spaceId: RANKED, title: 'Episode in a ranked space' },
      { entityId: 'r3', spaceId: VIEWER, title: 'Source the viewer added' },
      { entityId: 'r5', spaceId: STRAY, title: 'Source stray' },
      // In the viewed space, but tagged with this topic only in a space outside the canonical set.
      { entityId: 'r4', spaceId: SPACE, relationSpaceId: STRAY, title: 'Source tagged in a stray space' },
    ];
  }

  it('lists claims, timeline items and sources from every canonical space, never a stray one', async () => {
    topicCorpus();
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.claims).toBeDefined());
    const model = result.current.data!;
    expect(model.claims?.map(claim => claim.title)).toEqual(['Claim here', 'Claim elsewhere']);
    // Each row links to the space it lives in.
    expect(model.claims?.[1]?.href).toContain(OTHER);
    expect(model.timelineHighlights?.map(item => item.title)).toEqual(['Event here', 'Event elsewhere']);
    expect(model.sections?.[0]?.items.map(item => item.title)).toEqual([
      'Source here',
      'Source elsewhere',
      'Episode in a ranked space',
    ]);
    expect(mocks.useTopicConnectionCounts).toHaveBeenCalledWith([PAGE], { spaceIds: SCOPE });
  });

  it('asks the topic feed for every canonical space in one request, and keeps what any of them tagged', async () => {
    topicCorpus();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));
      const best = state.queries.find(query => query.queryKey[1] === 'best-claims')!;
      await best.queryFn!({});
      const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'https://geo.test');
      expect(url.pathname).toBe('/api/topics/feed');
      expect(url.searchParams.get('spaceId')).toBe(SPACE);
      expect(url.searchParams.get('spaceIds')).toBe(SCOPE.join(','));
      expect(state.taggedReads.at(-1)).toEqual({ spaceIds: SCOPE });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lists the topic’s own Claims, Stories and Subtopics links from every canonical space', async () => {
    topicCorpus();
    state.corpus = [];
    state.page = pageEntity(TEMPLATE_ONTOLOGY.TOPIC_TYPE_ID, [
      relation(TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID, 'tc1', OTHER, 'Topic claim elsewhere'),
      relation(TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID, 'tc2', STRAY, 'Topic claim stray'),
      relation(TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID, 'st1', SPACE, 'Subtopic here'),
      relation(TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID, 'st2', OTHER, 'Subtopic elsewhere'),
      relation(TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID, 'st3', STRAY, 'Subtopic stray'),
    ]);
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.claims).toBeDefined());
    const model = result.current.data!;
    expect(model.claims?.map(claim => claim.title)).toEqual(['Topic claim elsewhere']);
    expect(model.subtopics?.map(item => item.label)).toEqual(['Subtopic here', 'Subtopic elsewhere']);
  });

  it('lists feed claims only once the viewed space is known to have tagged them', async () => {
    topicCorpus();
    state.corpus = [];
    state.feedClaims = [
      { entityId: 'f1', title: 'Feed claim tagged here', spaceId: SPACE },
      { entityId: 'f2', title: 'Feed claim tagged elsewhere', spaceId: SPACE },
    ];
    const { result, rerender } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));
    // Held back while the check loads, rather than shown and then dropped.
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.claims ?? []).toEqual([]);

    state.taggedInSpace = new Set(['f1']);
    rerender();
    await waitFor(() =>
      expect(result.current.data!.claims?.map(claim => claim.title)).toEqual(['Feed claim tagged here'])
    );
  });

  it('lists claims in Best order, then fills from Top, debate claims and linked claims, never regrouped (GEO-3868)', async () => {
    topicCorpus();
    state.bestClaims = [
      { entityId: 'b1', title: 'Best 1, accepted', spaceId: SPACE },
      { entityId: 'b2', title: 'Best 2, disputed', spaceId: SPACE },
    ];
    state.feedClaims = [
      { entityId: 't1', title: 'Top 1, most votes', spaceId: SPACE },
      { entityId: 'b2', title: 'Best 2, disputed', spaceId: SPACE },
    ];
    state.bestDebates = {
      fromSpaceFeed: false,
      items: [
        { entityId: 'd1', title: 'Debate', spaceId: SPACE, debateClaim: { entityId: 'dc1', name: 'Debated claim' } },
      ],
    };
    state.taggedInSpace = new Set(['b1', 'b2', 't1', 'd1']);
    // Top 1 has the most votes and Best 1 is accepted: neither moves either one.
    const vote = (userId: string, objectId: string, voteType: number) => ({
      userId,
      objectId,
      spaceId: SPACE,
      voteType,
      voteKind: CLAIM_STANCE_VOTE_KIND,
    });
    state.votes = {
      byClaim: aggregateClaimVotes(
        activeStanceVotes([
          vote('u1', 'b1', 0),
          vote('u2', 'b1', 0),
          ...['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((u, i) => vote(u, 't1', i % 2)),
        ]),
        null
      ),
    };
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.claims).toBeDefined());
    const claims = result.current.data!.claims!;
    expect(claims.map(claim => claim.title)).toEqual([
      'Best 1, accepted',
      'Best 2, disputed',
      'Top 1, most votes',
      'Debated claim',
      'Claim here',
      'Claim elsewhere',
    ]);
    expect(claims.map(claim => claim.split.isSplit)).toEqual([false, true, true, true, true, true]);
  });

  it('shows the first 40 Best claims alone when Best has 40 or more', async () => {
    topicCorpus();
    state.bestClaims = Array.from({ length: 41 }, (_, i) => ({
      entityId: `b${i}`,
      title: `Best ${i}`,
      spaceId: SPACE,
    }));
    state.feedClaims = [{ entityId: 't1', title: 'Top 1', spaceId: SPACE }];
    state.taggedInSpace = new Set([...state.bestClaims.map(item => item.entityId), 't1']);
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.claims).toBeDefined());
    expect(result.current.data!.claims!.map(claim => claim.title)).toEqual(
      Array.from({ length: 40 }, (_, i) => `Best ${i}`)
    );
  });

  it('lists the newest News events by Event date, never News stories', async () => {
    topicCorpus();
    const dated = (id: string, name: string, spaceId: string, date: string | null): Entity => ({
      ...linked(id, name, spaceId, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
      values: date ? [eventDate(id, spaceId, date)] : [],
    });
    // Listed oldest first, the way a page ordered by last update can come back: an old event edited
    // last week sorts ahead of one that happened last week.
    state.corpus = [
      dated('old1', 'Event from 2025', SPACE, '2025-09-29T00:00:00Z'),
      dated('old2', 'Event from early 2026', SPACE, '2026-01-21T00:00:00Z'),
      dated('undated', 'Event with no date', SPACE, null),
      ...Array.from({ length: 8 }, (_, i) =>
        dated(`n${i}`, `November ${23 - i * 2}`, SPACE, `2026-11-${String(23 - i * 2).padStart(2, '0')}T00:00:00Z`)
      ),
      dated('mine', 'Viewer event, November 20', VIEWER, '2026-11-20T00:00:00Z'),
    ];
    state.viewerSpaceId = VIEWER;
    state.taggedInSpace = new Set(['story']);
    state.feedNews = {
      fromSpaceFeed: false,
      items: [{ entityId: 'story', title: 'Newest news story', spaceId: SPACE, createdAtSec: 1_900_000_000 }],
    };
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.timelineHighlights).toBeDefined());
    expect(result.current.data!.timelineHighlights!.map(item => item.title)).toEqual([
      'November 23',
      'November 21',
      'Viewer event, November 20',
      'November 19',
      'November 17',
      'November 15',
      'November 13',
      'November 11',
    ]);
    expect(result.current.data!.timelineHighlights![0]!.when).toBe('Nov 23, 2026');
  });

  it('lists an undated News event after every dated one, pre-1970 included', async () => {
    topicCorpus();
    state.corpus = [
      linked('undated', 'Event with no date', SPACE, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
      {
        ...linked('d1', 'Dated event', SPACE, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
        values: [eventDate('d1', SPACE, '2026-11-01T00:00:00Z')],
      },
      // Before 1970 its timestamp is negative, which must still rank above having no date at all.
      {
        ...linked('d0', 'Event from 1967', SPACE, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
        values: [eventDate('d0', SPACE, '1967-06-05T00:00:00Z')],
      },
    ];
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.timelineHighlights).toBeDefined());
    expect(result.current.data!.timelineHighlights!.map(item => [item.title, item.when])).toEqual([
      ['Dated event', 'Nov 1, 2026'],
      ['Event from 1967', 'Jun 5, 1967'],
      ['Event with no date', 'Event'],
    ]);
  });

  it('reads coverage by where the Topics relation was published, not only where the source lives', async () => {
    topicCorpus();
    state.viewerSpaceId = VIEWER;
    renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    const [pageRead, viewerRead] = mocks.useTopicCoverage.mock.calls.slice(-2).map(call => call[0]);
    expect(pageRead).toMatchObject({ spaceIds: SCOPE, scopeRelationToSpaces: true });
    expect(viewerRead).toMatchObject({ spaceIds: [VIEWER], scopeRelationToSpaces: true, enabled: true });
  });

  it('keeps the viewer’s own personal-space sources for that viewer', async () => {
    topicCorpus();
    state.viewerSpaceId = VIEWER;
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.sections).toBeDefined());
    expect(result.current.data!.sections?.[0]?.items.map(item => item.title)).toEqual([
      'Source here',
      'Source elsewhere',
      'Episode in a ranked space',
      'Source the viewer added',
    ]);
  });

  it.each([
    ['the viewer’s space is the page’s', SPACE],
    ['there is no viewer', null],
  ])('reads no second coverage when %s, and lists none of its cached rows', async (_, viewerSpaceId) => {
    topicCorpus();
    state.viewerSpaceId = viewerSpaceId;
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    const viewerRead = mocks.useTopicCoverage.mock.calls.at(-1)![0];
    expect(viewerRead.enabled).toBe(false);
    await waitFor(() => expect(result.current.data?.sections).toBeDefined());
    expect(result.current.data!.sections?.[0]?.items.map(item => item.title)).toEqual([
      'Source here',
      'Source elsewhere',
      'Episode in a ranked space',
    ]);
  });

  it('labels a claim split "Everyone", never another space', async () => {
    topicCorpus();
    // Votes on the listed claim cast in two spaces: one row counting both, named for no space.
    const vote = (userId: string, spaceId: string, voteType: number) => ({
      userId,
      objectId: 'c1',
      spaceId,
      voteType,
      voteKind: CLAIM_STANCE_VOTE_KIND,
    });
    state.votes = {
      byClaim: aggregateClaimVotes(
        activeStanceVotes([vote('u1', SPACE, 0), vote('u2', OTHER, 0), vote('u3', OTHER, 1)]),
        null
      ),
    };
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.claims).toBeDefined());
    const [claim] = result.current.data!.claims!;
    expect(claim!.split.rows).toEqual([expect.objectContaining({ label: 'Everyone', voterCount: 3 })]);
  });

  it('names an X card’s author the way the Post page does, never a bogus handle (GEO-3824)', async () => {
    topicCorpus();
    state.coverage = [
      {
        entityId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
        spaceId: SPACE,
        title: 'A tweet',
        types: [{ id: TEMPLATE_ONTOLOGY.TWEET_TYPE_ID, name: 'Tweet' }],
      },
      {
        entityId: 'b1b2c3d4e5f60718293a4b5c6d7e8f90',
        spaceId: SPACE,
        title: 'A tweet with an app-route link',
        types: [{ id: TEMPLATE_ONTOLOGY.TWEET_TYPE_ID, name: 'Tweet' }],
      },
    ];
    // The Post page's lookup: an x.com/status/123 link yields no handle there, so none here.
    state.tweetAuthors = new Map([
      ['a1b2c3d4e5f60718293a4b5c6d7e8f90', { name: 'Shashank Joshi', handle: '@shashj' }],
      ['b1b2c3d4e5f60718293a4b5c6d7e8f90', { name: undefined, handle: undefined }],
    ]);
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.sections).toBeDefined());
    const [named, unnamed] = result.current.data!.sections![0]!.items;
    expect(named).toMatchObject({ publisher: 'Shashank Joshi', authorHandle: '@shashj' });
    expect(unnamed).toMatchObject({ publisher: 'Tweet', authorHandle: undefined });
  });
});
