import { ContentIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation, Value } from '~/core/types';

import { TEMPLATE_ONTOLOGY } from '../ontology';
import { useLiveEventTemplate } from './use-live-event-template';
import { useLivePostTemplate } from './use-live-post-template';

const state = vi.hoisted(() => ({
  entity: null as Entity | null,
  authorMeta: undefined as { name?: string; handle?: string; avatarUrl?: string | null } | undefined,
  sourceCards: [] as { id: string; title: string; kind: string }[],
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: state.entity, isLoading: false }),
  useQueryEntities: () => ({ entities: [], isLoading: false }),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: () => ({ data: undefined }),
}));
vi.mock('./use-live-entity-actions', () => ({ useLiveEntityActions: () => ({}) }));
// Viewer personal-space sources (GEO-3819 #3172) read the wallet; these tests have no viewer.
vi.mock('./use-viewer-sources', () => ({
  useEntityWithViewerSources: ({ entity }: { entity: Entity | null }) => entity,
}));
vi.mock('./use-hydrated-source-cards', () => ({
  useHydratedSourceCards: () => ({ items: state.sourceCards }),
  usePostAuthorMetadata: () => state.authorMeta,
}));

const SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';

function value(propertyId: string, text: string): Value {
  return {
    id: `${propertyId}-v`,
    entity: { id: 'e', name: null },
    property: { id: propertyId, name: null, dataType: 'TEXT' } as Value['property'],
    value: text,
    spaceId: SPACE,
  };
}

function relation(typeId: string, toId: string, toName: string): Relation {
  return {
    id: `${typeId}-${toId}`,
    entityId: `${typeId}-${toId}`,
    type: { id: typeId, name: null },
    fromEntity: { id: 'e', name: null },
    toEntity: { id: toId, name: toName, value: '' },
    renderableType: 'RELATION',
    spaceId: SPACE,
  } as Relation;
}

function entity(over: Partial<Entity>): Entity {
  return {
    id: '65d42f6018084c6cb661d7122fdeaa26',
    name: null,
    description: null,
    spaces: [SPACE],
    types: [],
    relations: [],
    values: [],
    ...over,
  };
}

beforeEach(() => {
  state.entity = null;
  state.authorMeta = undefined;
  state.sourceCards = [];
});

/**
 * Shaped like the real News events on testnet (e.g. 65d42f60… in Crypto): typed Claim *and* News
 * event, an `Event date` stored as a datetime, a generated description, Topics and Sources.
 * Registry precedence now sends these to the Event template, which had never drawn a real one.
 */
describe('useLiveEventTemplate with a Claim + News event entity', () => {
  it('reads the date, summary, sources and topics', () => {
    state.entity = entity({
      name: 'The US Justice Department filed a civil forfeiture complaint',
      description: 'The complaint asks the court to transfer the frozen USDC to the government.',
      types: [
        { id: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID, name: 'Claim' },
        { id: ContentIds.NEWS_EVENT_TYPE, name: 'News event' },
      ],
      values: [value(TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID, '2026-11-23T00:00:00Z')],
      relations: [
        relation(TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Crypto hacks'),
        relation(TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'US Seeks to Recover'),
      ],
    });
    state.sourceCards = [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', title: 'US Seeks to Recover', kind: 'source' }];

    const { result } = renderHook(() => useLiveEventTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.when).toBe('Nov 23, 2026');
    expect(model.summary).toBe('The complaint asks the court to transfer the frozen USDC to the government.');
    expect(model.breadcrumbs?.[0]?.label).toBe('Crypto hacks');
    expect(model.sections.map(section => section.id)).toEqual(['sources', 'topics']);
    expect(model.claims).toEqual([]);
  });

  it('keeps an empty Sources section and leaves out the rest it has nothing for', () => {
    state.entity = entity({
      name: 'An event with no date, sources or topics',
      types: [
        { id: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID, name: 'Claim' },
        { id: ContentIds.NEWS_EVENT_TYPE, name: 'News event' },
      ],
    });

    const { result } = renderHook(() => useLiveEventTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.when).toBe('');
    expect(model.summary).toBeUndefined();
    // Sources stays, empty, so the first source can be added from its "+"; Topics drops out.
    expect(model.sections).toEqual([
      {
        id: 'sources',
        title: 'Sources',
        layout: 'cards',
        emptyText: 'No sources',
        items: [],
        // The "+" that adds the first source (#3172's ingestion link on #3174's always-shown section).
        ingestionLink: expect.objectContaining({ targetSpaceId: SPACE }),
      },
    ]);
    expect(model.breadcrumbs).toBeUndefined();
  });
});

/**
 * The graph stores a tweet's own words as its name and a generated summary as its description, so
 * the card has to read the name. Checked against live Tweets (a91306fd…, b3fe3e53…).
 */
describe('useLivePostTemplate author card', () => {
  const tweet = () =>
    entity({
      id: 'a91306fd9af647489366fe91d5c3a2f3',
      name: 'Striking to see the degree to which Israel has become a major dividing line within both parties.',
      description: 'Israel has become a major dividing line within both US parties (generated summary).',
      types: [{ id: TEMPLATE_ONTOLOGY.TWEET_TYPE_ID, name: 'Tweet' }],
      relations: [
        relation(TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID, 'b82f4143c93049c558b523204448ec32', 'Shashank Joshi'),
      ],
    });

  it("shows a tweet's own text, not the summary, under its author", () => {
    state.entity = tweet();
    state.authorMeta = { name: 'Shashank Joshi', handle: '@shashj', avatarUrl: 'https://example.com/a.png' };

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.body).toBe(
      'Striking to see the degree to which Israel has become a major dividing line within both parties.'
    );
    expect(model.body).not.toContain('generated summary');
    expect(model.title).toBe('Shashank Joshi on X');
    expect(model.authorHandle).toBe('@shashj');
    expect(model.authorAvatarUrl).toBe('https://example.com/a.png');
  });

  it('falls back to the Authors relation name and leaves out a missing handle and avatar', () => {
    state.entity = tweet();

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.authorName).toBe('Shashank Joshi');
    expect(model.authorHandle).toBeUndefined();
    expect(model.authorAvatarUrl).toBeNull();
  });

  it('keeps a headline Post titled by its headline, with the description as its text', () => {
    state.entity = entity({
      name: 'The UN secretary-general race is steeped in intrigue. Should we care?',
      description: 'Ben Cohen analyzes the contest to succeed Guterres.',
      types: [{ id: TEMPLATE_ONTOLOGY.POST_TYPE_ID, name: 'Post' }],
      relations: [
        relation(
          TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
          'bc0283a874964409b1806ef74e7140df',
          'Foundation for Defense of Democracies'
        ),
      ],
    });

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.title).toBe('The UN secretary-general race is steeped in intrigue. Should we care?');
    expect(model.body).toBe('Ben Cohen analyzes the contest to succeed Guterres.');
  });

  it("never uses a tweet's own text as its author when it has none", () => {
    state.entity = { ...tweet(), relations: [] };

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.authorName).toBe('Unknown author');
    expect(model.title).toBe('Post on X');
    expect(model.body).toBe(
      'Striking to see the degree to which Israel has become a major dividing line within both parties.'
    );
  });

  it('names an author-less tweet by its handle when the post URL has one', () => {
    state.entity = { ...tweet(), relations: [] };
    state.authorMeta = { handle: '@shashj', avatarUrl: null };

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.authorName).toBe('@shashj');
    expect(model.authorHandle).toBeUndefined();
    expect(model.title).toBe('@shashj on X');
  });

  it('keeps an author-less headline Post titled by its headline', () => {
    state.entity = entity({
      name: 'The UN secretary-general race is steeped in intrigue. Should we care?',
      description: 'Ben Cohen analyzes the contest to succeed Guterres.',
      types: [{ id: TEMPLATE_ONTOLOGY.POST_TYPE_ID, name: 'Post' }],
    });

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.authorName).toBe('Unknown author');
    expect(model.title).toBe('The UN secretary-general race is steeped in intrigue. Should we care?');
    expect(model.body).toBe('Ben Cohen analyzes the contest to succeed Guterres.');
  });

  it("reads an author-less tweet's handle from its own X URL before the author query lands", () => {
    state.entity = {
      ...tweet(),
      relations: [],
      values: [value(TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID, 'https://x.com/shashj/status/1990000000000000000')],
    };

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.authorName).toBe('@shashj');
    expect(model.title).toBe('@shashj on X');
  });

  it('treats an Authors relation to a nameless entity as no author', () => {
    state.entity = {
      ...tweet(),
      relations: [relation(TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID, 'b82f4143c93049c558b523204448ec32', '  ')],
    };

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));
    const model = result.current.data!;

    expect(model.authorName).toBe('Unknown author');
    expect(model.title).toBe('Post on X');
  });

  it('prefers the local Authors relation over the cached author query', () => {
    state.entity = tweet();
    state.authorMeta = { name: 'Old Name', handle: '@shashj', avatarUrl: null };

    const { result } = renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE }));

    expect(result.current.data!.authorName).toBe('Shashank Joshi');
  });

  it('never uses the "Unknown author" placeholder as image alt text', () => {
    state.entity = { ...tweet(), relations: [] };
    expect(
      renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE })).result.current.data!
        .mediaAlt
    ).toBe('');

    state.entity = tweet();
    expect(
      renderHook(() => useLivePostTemplate({ entityId: state.entity!.id, spaceId: SPACE })).result.current.data!
        .mediaAlt
    ).toBe('Shashank Joshi');
  });
});
