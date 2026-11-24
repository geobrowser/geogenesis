import { ContentIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook, waitFor } from '@testing-library/react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { EntityQuery, type WhereCondition } from '~/core/sync/experimental_query-layer';
import type { Entity, Relation } from '~/core/types';

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

// Template lists hold only the viewed space's items. The store runs the real local `where`
// matcher, so a query missing its space clause lists the other space's entities.

const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const OTHER = 'b5a31f8182b042437ede0f84ee02f104';
const VIEWER = 'dddddddddddddddddddddddddddddddd';
const PAGE = '4ed3162278994f29bde7a6f7cf60e28e';
/** `SPACE` as a dashed, uppercase UUID: the store's space ids are dashless lowercase. */
const SPACE_DASHED = '89BD89BF-28FF-8A09-63FA-F92A8C905E20';

const state = vi.hoisted(() => ({
  page: null as Entity | null,
  corpus: [] as Entity[],
  viewerSpaceId: null as string | null,
  /** `relationSpaceId` is where the source's Topics link was published; defaults to `spaceId`. */
  coverage: [] as { entityId: string; spaceId: string; title: string; relationSpaceId?: string }[],
  entityReads: [] as { id?: string; spaceId?: string }[],
  infiniteQueries: [] as { queryKey: unknown[]; queryFn: (ctx: { pageParam: string | null }) => Promise<unknown> }[],
  graphqlVariables: [] as Record<string, unknown>[],
  votes: undefined as unknown,
  /** Topic feed claims, and which of them the viewed space tagged (null: still checking). */
  feedClaims: undefined as { entityId: string; title: string; spaceId: string }[] | undefined,
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
  useQueryEntity: (args: { id?: string; spaceId?: string }) => {
    state.entityReads.push(args);
    return { entity: state.page, isLoading: false };
  },
  useQueryEntities: ({
    where,
    first,
    enabled = true,
  }: {
    where: WhereCondition;
    first?: number;
    enabled?: boolean;
  }) => {
    if (!enabled) return { entities: [], isLoading: false };
    const query = new EntityQuery(state.corpus).where(where);
    return { entities: (first ? query.limit(first) : query).execute(), isLoading: false };
  },
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data:
      queryKey[1] === 'multi-space-votes'
        ? state.votes
        : queryKey[1] === 'top-claims'
          ? state.feedClaims
          : queryKey[1] === 'best-news'
            ? state.feedNews
            : undefined,
    isLoading: false,
  }),
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
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: () => ({ data: undefined }),
}));
vi.mock('./use-live-entity-actions', () => ({ useLiveEntityActions: () => ({}) }));
vi.mock('./use-topic-tagged-in-space', () => ({
  useTopicTaggedInSpace: ({ entityIds }: { entityIds: string[] }) => ({
    tagged: state.taggedInSpace,
    isLoading: entityIds.length > 0 && state.taggedInSpace === null,
  }),
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
  state.page = null;
  state.corpus = [];
  state.viewerSpaceId = null;
  state.coverage = [];
  state.entityReads = [];
  state.infiniteQueries = [];
  state.graphqlVariables = [];
  state.votes = undefined;
  state.feedClaims = undefined;
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
              types: [],
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
  it('lists sub-claims and quotes from the viewed space only', () => {
    state.page = pageEntity(CLAIM_TYPE_ID);
    state.corpus = [
      linked('a1', 'Supports, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('a2', 'Supports, elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
      linked('b1', 'Opposes, here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
      linked('b2', 'Opposes, elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
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
    ];

    const { result } = renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.subClaims?.map(claim => claim.title).sort()).toEqual(['Opposes, here', 'Supports, here']);
    const quotes = model.sections.find(section => section.id === 'quotes');
    expect(quotes?.items.map(item => item.title)).toEqual(['Quote, here']);
  });

  it('reads more claims in the topic and debates in the viewed space alone', () => {
    state.page = pageEntity(CLAIM_TYPE_ID, [relation(TOPICS_PROPERTY_ID, 'topic', SPACE)]);
    renderHook(() => useLiveClaimTemplate({ entityId: PAGE, spaceId: SPACE }));

    // No `spaceIds`: the record then scopes to `spaceId` only.
    expect(mocks.useClaimRecord).toHaveBeenCalledWith({ claimId: PAGE, spaceId: SPACE, topicIds: ['topic'] });
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
  it('lists related claims from the viewed space only', () => {
    state.page = pageEntity(ContentIds.NEWS_EVENT_TYPE);
    state.corpus = [
      linked('c1', 'Claim here', SPACE, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID),
      linked('c2', 'Claim elsewhere', OTHER, [CLAIM_TYPE_ID], TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID),
    ];

    const { result } = renderHook(() => useLiveEventTemplate({ entityId: PAGE, spaceId: SPACE }));

    expect(result.current.data!.claims.map(claim => claim.title)).toEqual(['Claim here']);
  });
});

describe('Source template', () => {
  it('lists citing claims, quotes and stories from the viewed space only', () => {
    state.page = pageEntity(TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID);
    const sources = TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID;
    state.corpus = [
      linked('c1', 'Claim here', SPACE, [CLAIM_TYPE_ID], sources),
      linked('c2', 'Claim elsewhere', OTHER, [CLAIM_TYPE_ID], sources),
      linked('q1', 'Quote here', SPACE, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], sources),
      linked('q2', 'Quote elsewhere', OTHER, [TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID], sources),
      linked('s1', 'Story here', SPACE, [TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID], sources),
      linked('s2', 'Story elsewhere', OTHER, [TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID], sources),
    ];

    const { result } = renderHook(() => useLiveSourceTemplate({ entityId: PAGE, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.supportedClaims.map(claim => claim.title)).toEqual(['Claim here']);
    expect(model.quotes?.map(quote => quote.text)).toEqual(['Quote here']);
    expect(model.sections.find(section => section.id === 'cited-by')?.items.map(item => item.title)).toEqual([
      'Story here',
    ]);
  });
});

describe('Podcast show template', () => {
  it('asks for episodes in the viewed space only', async () => {
    state.page = pageEntity(TEMPLATE_ONTOLOGY.PODCAST_TYPE_ID);
    renderHook(() => useLivePodcastShowTemplate({ entityId: PAGE, spaceId: SPACE }));

    const episodes = state.infiniteQueries.at(-1)!;
    expect(episodes.queryKey).toContain(SPACE);
    await episodes.queryFn({ pageParam: null });
    expect(state.graphqlVariables.at(-1)).toMatchObject({ showId: PAGE, spaceIds: [SPACE] });
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
      // In the viewed space, but tagged with this topic only from another space.
      {
        ...linked('c3', 'Claim tagged elsewhere', SPACE, [CLAIM_TYPE_ID], TOPICS_PROPERTY_ID),
        relations: [relation(TOPICS_PROPERTY_ID, PAGE, OTHER)],
      },
      {
        ...linked('e3', 'Event tagged elsewhere', SPACE, [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID], TOPICS_PROPERTY_ID),
        relations: [relation(TOPICS_PROPERTY_ID, PAGE, OTHER)],
      },
    ];
    state.coverage = [
      { entityId: 'r1', spaceId: SPACE, title: 'Source here' },
      { entityId: 'r2', spaceId: OTHER, title: 'Source elsewhere' },
      { entityId: 'r3', spaceId: VIEWER, title: 'Source the viewer added' },
      // In the viewed space, but tagged with this topic only in another space.
      { entityId: 'r4', spaceId: SPACE, relationSpaceId: OTHER, title: 'Source tagged elsewhere' },
    ];
  }

  it('lists claims, timeline items and sources from the viewed space only', async () => {
    topicCorpus();
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.contestedClaims).toBeDefined());
    const model = result.current.data!;
    expect(model.contestedClaims?.map(claim => claim.title)).toEqual(['Claim here']);
    expect(model.timelineHighlights?.map(item => item.title)).toEqual(['Event here']);
    expect(model.sections?.[0]?.items.map(item => item.title)).toEqual(['Source here']);
    expect(mocks.useTopicConnectionCounts).toHaveBeenCalledWith([PAGE], { spaceId: SPACE });
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
    expect(result.current.data!.contestedClaims ?? []).toEqual([]);

    state.taggedInSpace = new Set(['f1']);
    rerender();
    await waitFor(() =>
      expect(result.current.data!.contestedClaims?.map(claim => claim.title)).toEqual(['Feed claim tagged here'])
    );
  });

  it.each([
    [true, ['Space story', 'Story the space tagged']],
    [false, ['Story the space tagged']],
  ])('checks news tags only for topic-feed rows (from the space feed: %s)', async (fromSpaceFeed, expected) => {
    topicCorpus();
    state.corpus = [];
    state.taggedInSpace = new Set(['n2']);
    state.feedNews = {
      fromSpaceFeed,
      items: [
        { entityId: 'n1', title: 'Space story', spaceId: SPACE, createdAtSec: 2 },
        { entityId: 'n2', title: 'Story the space tagged', spaceId: SPACE, createdAtSec: 1 },
      ],
    };
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE, isSpaceHome: true }));

    await waitFor(() => expect(result.current.data?.timelineHighlights?.map(item => item.title)).toEqual(expected));
  });

  it('reads coverage by where the Topics relation was published, not only where the source lives', async () => {
    topicCorpus();
    state.viewerSpaceId = VIEWER;
    renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    const [pageRead, viewerRead] = mocks.useTopicCoverage.mock.calls.slice(-2).map(call => call[0]);
    expect(pageRead).toMatchObject({ spaceIds: [SPACE], scopeRelationToSpaces: true });
    expect(viewerRead).toMatchObject({ spaceIds: [VIEWER], scopeRelationToSpaces: true, enabled: true });
  });

  it('keeps the viewer’s own personal-space sources for that viewer', async () => {
    topicCorpus();
    state.viewerSpaceId = VIEWER;
    const { result } = renderHook(() => useLiveTopicTemplate({ entityId: PAGE, spaceId: SPACE }));

    await waitFor(() => expect(result.current.data?.sections).toBeDefined());
    expect(result.current.data!.sections?.[0]?.items.map(item => item.title)).toEqual([
      'Source here',
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
    expect(result.current.data!.sections?.[0]?.items.map(item => item.title)).toEqual(['Source here']);
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

    await waitFor(() => expect(result.current.data?.contestedClaims).toBeDefined());
    const [claim] = result.current.data!.contestedClaims!;
    expect(claim!.split.rows).toEqual([expect.objectContaining({ label: 'Everyone', voterCount: 3 })]);
  });
});
