import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';

import {
  type IngestionLink,
  buildIngestionLinkRelation,
  ingestionPromptText,
  stageIngestionLink,
} from './ingestion-link';
import type { SerializedOp } from './inject-types';
import { resolveUrlIngestionSeed } from './resolve-url-ingestion-seed';

const sync = vi.hoisted(() => ({
  setRelation: vi.fn(),
  relationsFrom: [] as unknown[],
  relationsTo: [] as unknown[],
}));
vi.mock('~/core/sync/use-mutate', () => ({ storage: { relations: { set: sync.setRelation } } }));
vi.mock('~/core/sync/use-sync-engine', () => ({
  store: {
    getResolvedRelations: () => sync.relationsFrom,
    getRelationsToEntity: () => sync.relationsTo,
  },
}));

const STORY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SOURCE = 'cccccccccccccccccccccccccccccccc';
const SOURCES_PROP = 'dddddddddddddddddddddddddddddddd';
const TOPICS_PROP = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const SPACE = 'ffffffffffffffffffffffffffffffff';

const storyLink: IngestionLink = {
  targetEntityId: STORY,
  targetEntityName: 'Gaza ceasefire',
  propertyId: SOURCES_PROP,
  propertyName: 'Sources',
  direction: 'target-to-source',
};

const topicLink: IngestionLink = {
  targetEntityId: TOPIC,
  targetEntityName: 'Stablecoins',
  propertyId: TOPICS_PROP,
  propertyName: 'Topics',
  direction: 'source-to-target',
};

describe('buildIngestionLinkRelation', () => {
  it('links page --Sources--> source for a Sources relation the page owns', () => {
    const relation = buildIngestionLinkRelation({
      link: storyLink,
      sourceEntityId: SOURCE,
      sourceEntityName: 'Reuters report',
      spaceId: SPACE,
    });
    expect(relation).toMatchObject({
      spaceId: SPACE,
      type: { id: SOURCES_PROP, name: 'Sources' },
      fromEntity: { id: STORY, name: 'Gaza ceasefire' },
      toEntity: { id: SOURCE, name: 'Reuters report', value: SOURCE },
      isLocal: true,
      isDeleted: false,
    });
  });

  it('links source --Topics--> topic for a Topic, whose section lists what is tagged with it', () => {
    const relation = buildIngestionLinkRelation({
      link: topicLink,
      sourceEntityId: SOURCE,
      sourceEntityName: 'Reuters report',
      spaceId: SPACE,
    });
    expect(relation?.fromEntity.id).toBe(SOURCE);
    expect(relation?.toEntity.id).toBe(TOPIC);
    expect(relation?.type.id).toBe(TOPICS_PROP);
  });

  it('adds nothing when the import is the page itself or already made the same link', () => {
    expect(
      buildIngestionLinkRelation({ link: storyLink, sourceEntityId: STORY, sourceEntityName: null, spaceId: SPACE })
    ).toBeNull();

    const ops = [
      { type: 'createRelation', id: 'r1', relationType: TOPICS_PROP, from: SOURCE, to: TOPIC },
    ] as unknown as SerializedOp[];
    expect(
      buildIngestionLinkRelation({
        link: topicLink,
        sourceEntityId: SOURCE,
        sourceEntityName: null,
        spaceId: SPACE,
        ops,
      })
    ).toBeNull();
  });
});

describe('ingestionPromptText', () => {
  it('asks the agent to make the link back to the page, naming its ids', () => {
    const text = ingestionPromptText('https://example.com/a', storyLink);
    expect(text).toContain('`https://example.com/a`');
    expect(text).toContain('"Gaza ceasefire"');
    expect(text).toContain(`fromEntityId \`${STORY}\``);
    expect(text).toContain(`typeId \`${SOURCES_PROP}\``);
    expect(text).toContain('setEntityRelation');
  });

  it('is the plain ingestion prompt without a link', () => {
    expect(ingestionPromptText('https://example.com/a')).toBe(
      'Please ingest this URL into this space and stage the entities: `https://example.com/a`'
    );
  });
});

describe('resolveUrlIngestionSeed with a link', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('carries the page to link back to on the inject seed', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/chat/classify-url') {
        return new Response(JSON.stringify({ route: 'inject', type: 'news-story-single' }), { status: 200 });
      }
      return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const seed = await resolveUrlIngestionSeed('https://example.com/a', 'test', storyLink);
    expect(seed).toEqual({
      mode: 'inject',
      url: 'https://example.com/a',
      jobId: 'job-1',
      injectType: 'news-story-single',
      link: storyLink,
    });
  });

  it('carries it on the chat seed too, and adds nothing without one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ route: 'chat' }), { status: 200 }))
    );

    expect(await resolveUrlIngestionSeed('https://example.com/a', 'test', topicLink)).toEqual({
      mode: 'ingestion',
      url: 'https://example.com/a',
      link: topicLink,
    });
    expect(await resolveUrlIngestionSeed('https://example.com/a', 'test')).toEqual({
      mode: 'ingestion',
      url: 'https://example.com/a',
    });
  });
});

describe('stageIngestionLink', () => {
  beforeEach(() => {
    sync.setRelation.mockReset();
    sync.relationsFrom = [];
    sync.relationsTo = [];
  });

  function existing(from: string, to: string, type = SOURCES_PROP, isDeleted = false): Relation {
    return {
      id: 'existing',
      entityId: 'existing-entity',
      spaceId: SPACE,
      renderableType: 'RELATION',
      type: { id: type, name: null },
      fromEntity: { id: from, name: null },
      toEntity: { id: to, name: null, value: to },
      isDeleted,
    } as Relation;
  }

  it('stages page --Sources--> the import once its ops are applied', () => {
    const staged = stageIngestionLink({
      link: storyLink,
      primaryEntityId: SOURCE,
      primaryEntityName: 'Reuters report',
      spaceId: SPACE,
      ops: [],
    });
    expect(sync.setRelation).toHaveBeenCalledTimes(1);
    expect(sync.setRelation).toHaveBeenCalledWith(staged);
    expect(staged).toMatchObject({ fromEntity: { id: STORY }, toEntity: { id: SOURCE }, spaceId: SPACE });
  });

  it('stages nothing for an enrich of a source the page already lists', () => {
    // Pasting the URL of a story the page already has: the enrich restates no relation, the store has it.
    sync.relationsFrom = [existing(STORY, SOURCE)];
    expect(
      stageIngestionLink({ link: storyLink, primaryEntityId: SOURCE, primaryEntityName: null, spaceId: SPACE, ops: [] })
    ).toBeNull();

    // Same for a Topic: the source already carries Topics -> topic (seen as a backlink of the topic).
    sync.relationsFrom = [];
    sync.relationsTo = [existing(SOURCE, TOPIC, TOPICS_PROP)];
    expect(
      stageIngestionLink({ link: topicLink, primaryEntityId: SOURCE, primaryEntityName: null, spaceId: SPACE, ops: [] })
    ).toBeNull();
    expect(sync.setRelation).not.toHaveBeenCalled();
  });

  it('stages nothing for an enrich of a row the section lists, even when the store has no backlink', () => {
    // A Topic's "Sources & evidence" rows come from a query that never reaches the store, so the
    // store has nothing here; the section's own rows (UUID-form ids from GraphQL) are what tell.
    const listed = { ...topicLink, listedEntityIds: ['cccccccc-cccc-cccc-cccc-cccccccccccc'] };
    expect(
      stageIngestionLink({ link: listed, primaryEntityId: SOURCE, primaryEntityName: null, spaceId: SPACE, ops: [] })
    ).toBeNull();
    expect(sync.setRelation).not.toHaveBeenCalled();

    // A new source the section doesn't list is still linked.
    expect(
      stageIngestionLink({
        link: { ...topicLink, listedEntityIds: [STORY] },
        primaryEntityId: SOURCE,
        primaryEntityName: null,
        spaceId: SPACE,
        ops: [],
      })
    ).toMatchObject({ fromEntity: { id: SOURCE }, toEntity: { id: TOPIC } });
  });

  it('still links when the only matching relation was deleted, and skips without a primary entity', () => {
    sync.relationsFrom = [existing(STORY, SOURCE, SOURCES_PROP, true)];
    expect(
      stageIngestionLink({ link: storyLink, primaryEntityId: SOURCE, primaryEntityName: null, spaceId: SPACE, ops: [] })
    ).not.toBeNull();
    expect(
      stageIngestionLink({ link: storyLink, primaryEntityId: null, primaryEntityName: null, spaceId: SPACE, ops: [] })
    ).toBeNull();
    expect(sync.setRelation).toHaveBeenCalledTimes(1);
  });
});
