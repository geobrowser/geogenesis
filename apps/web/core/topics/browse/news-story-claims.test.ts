import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { NEWS_STORY_TYPE_ID } from '~/core/constants';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { EntityQuery, type WhereCondition } from '~/core/sync/experimental_query-layer';
import { TEMPLATE_ONTOLOGY } from '~/core/templates/ontology';
import type { Entity, Relation } from '~/core/types';

import { LISTED_BY_NEWS_STORY, NOT_LISTED_BY_NEWS_STORY_FILTER } from './news-story-claims';
import { topicConnectionCountsDocument } from './topic-connection-counts';

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const EPISODE_TYPE_ID = TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID;

function relation(fromId: string, typeId: string, toId: string): Relation {
  return {
    id: `${fromId}-${typeId}-${toId}`,
    entityId: `${fromId}-${toId}-rel`,
    spaceId: SPACE,
    renderableType: 'RELATION',
    type: { id: typeId, name: null },
    fromEntity: { id: fromId, name: null },
    toEntity: { id: toId, name: null, value: toId },
  } as Relation;
}

function entity(id: string, typeId: string, relations: Relation[] = []): Entity {
  return {
    id,
    name: id,
    description: null,
    spaces: [SPACE],
    types: [{ id: typeId, name: null }],
    relations,
    values: [],
  } as Entity;
}

/** A claim the topic names directly, with nothing else pointing at it. */
const directClaim = entity('direct-claim', CLAIM_TYPE_ID, [relation('direct-claim', TOPICS_PROPERTY_ID, TOPIC)]);
/** A story's notable claim. The pipeline tags it with the topic too. */
const notableStoryClaim = entity('notable-story-claim', CLAIM_TYPE_ID, [
  relation('notable-story-claim', TOPICS_PROPERTY_ID, TOPIC),
]);
/** A claim in one of a story's sections (a data block the story lists under Blocks). */
const sectionStoryClaim = entity('section-story-claim', CLAIM_TYPE_ID, [
  relation('section-story-claim', TOPICS_PROPERTY_ID, TOPIC),
]);
/** A podcast episode's notable claim: not a news story, so it stays. */
const episodeClaim = entity('episode-claim', CLAIM_TYPE_ID, [relation('episode-claim', TOPICS_PROPERTY_ID, TOPIC)]);
/** A claim in a data block on a Page, not a story. */
const pageBlockClaim = entity('page-block-claim', CLAIM_TYPE_ID, [
  relation('page-block-claim', TOPICS_PROPERTY_ID, TOPIC),
]);

const story = entity('story', NEWS_STORY_TYPE_ID, [
  relation('story', TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID, notableStoryClaim.id),
  relation('story', SystemIds.BLOCKS, 'story-section'),
]);
const storySection = entity('story-section', SystemIds.DATA_BLOCK, [
  relation('story-section', SystemIds.COLLECTION_ITEM_RELATION_TYPE, sectionStoryClaim.id),
]);
const episode = entity('episode', EPISODE_TYPE_ID, [
  relation('episode', TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID, episodeClaim.id),
]);
const page = entity('page', SystemIds.PAGE_TYPE, [relation('page', SystemIds.BLOCKS, 'page-section')]);
const pageSection = entity('page-section', SystemIds.DATA_BLOCK, [
  relation('page-section', SystemIds.COLLECTION_ITEM_RELATION_TYPE, pageBlockClaim.id),
]);

const topicClaimsWhere: WhereCondition = {
  types: [{ id: { equals: CLAIM_TYPE_ID } }],
  relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { equals: TOPIC } } }],
};

describe('LISTED_BY_NEWS_STORY', () => {
  const all = [
    directClaim,
    notableStoryClaim,
    sectionStoryClaim,
    episodeClaim,
    pageBlockClaim,
    story,
    storySection,
    episode,
    page,
    pageSection,
  ];

  it('drops claims a news story lists and keeps the rest', () => {
    const without = new EntityQuery(all).where({ ...topicClaimsWhere, NOT: LISTED_BY_NEWS_STORY }).execute();

    expect(without.map(e => e.id).sort()).toEqual(['direct-claim', 'episode-claim', 'page-block-claim']);
  });

  it('leaves the unfiltered read as it was', () => {
    const everything = new EntityQuery(all).where(topicClaimsWhere).execute();

    expect(everything).toHaveLength(5);
  });

  it('sends the server the nested backlink filter checked against testnet', () => {
    const filter = convertWhereConditionToEntityFilter({ NOT: LISTED_BY_NEWS_STORY }, { includeEmptyNames: true });

    expect(filter).toEqual({
      not: {
        or: [
          {
            backlinks: {
              some: {
                typeId: { is: TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID },
                fromEntity: { typeIds: { overlaps: [NEWS_STORY_TYPE_ID] } },
              },
            },
          },
          {
            backlinks: {
              some: {
                typeId: { is: SystemIds.COLLECTION_ITEM_RELATION_TYPE },
                fromEntity: {
                  backlinks: {
                    some: {
                      typeId: { is: SystemIds.BLOCKS },
                      fromEntity: { typeIds: { overlaps: [NEWS_STORY_TYPE_ID] } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });
  });
});

describe('NOT_LISTED_BY_NEWS_STORY_FILTER', () => {
  it('parses as an EntityFilter fragment', () => {
    expect(() => parse(`{ entities(filter: { ${NOT_LISTED_BY_NEWS_STORY_FILTER} }) { id } }`)).not.toThrow();
  });

  it('narrows only the claim count, so the header matches the lists', () => {
    const printed = print(topicConnectionCountsDocument(1, true, true)).replace(/\s+/g, ' ');
    const claimsBucket = printed.slice(printed.indexOf('claims0:'), printed.indexOf('news0:'));
    const rest = printed.slice(printed.indexOf('news0:'));

    expect(claimsBucket).toMatch(/backlinks: ?\{ ?none:/);
    expect(claimsBucket).toContain(TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID);
    expect(rest).not.toContain('backlinks');
  });

  it('is off unless asked for, and cached apart from the plain document', () => {
    expect(print(topicConnectionCountsDocument(1, true))).not.toContain('backlinks');
    expect(topicConnectionCountsDocument(1, true, true)).not.toBe(topicConnectionCountsDocument(1, true));
  });
});
