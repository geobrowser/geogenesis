import { Graph, Op, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import {
  DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID,
  DATA_BLOCK_PAGE_SIZE_PROPERTY_ID,
  DATA_BLOCK_TOOLS_PROPERTY_ID,
  DATA_BLOCK_VIEW_ALL_PROPERTY_ID,
  LINK_INGESTION_TOOL_ID,
} from '~/core/blocks/data/block-ontology-ids';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { FEATURED_TAG_ID, SCORE_SYSTEM_PROPERTY, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { DATA_BLOCK_VIEW_EXPLORE_ID } from '~/core/data-block-ids';
import { DEBATES_PAGE_TYPE_ID, DEBATE_TYPE_ID, DEBATE_VIDEOS_PROPERTY_ID } from '~/core/debates/ontology';
import { EPISODE_TYPE_ID, NEWS_STORY_TYPE_ID, PAPER_TYPE_ID, TWEET_TYPE_ID } from '~/core/explore/explore-constants';
import { ID } from '~/core/id';
import {
  RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_ID,
  RANKING_AGGREGATION_RESTRICTION_PROPERTY_ID,
  RANKING_BLOCK_TYPE_ID,
  RANKING_VIEW_PILL_ID,
  ROLLING_RANKING_TYPE_ID,
  SUBMISSION_FREQUENCY_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import { SORT_PROPERTY } from '~/core/system-ids';

/**
 * The overview-tab template every space created through the "+ New space" UI gets.
 *
 * Four blocks hang off the space's home (topic) entity via `Blocks`, in order:
 *   1. Recent debates  — query block, gallery, 3 per page, links to an "All debates" page
 *   2. Trending claims — rolling ranking block, bulleted list
 *   3. Trending topics — rolling ranking block, pill view
 *   4. Recent news     — query block, explore view, infinite scroll, link-ingestion tool
 */

const ROLLING_RANKING_SUBMISSION_FREQUENCY_HOURS = 24;

const RECENT_DEBATES_PAGE_SIZE = 3;
const TRENDING_CLAIMS_PAGE_SIZE = 5;

const RECENT_NEWS_TYPE_IDS = [
  NEWS_STORY_TYPE_ID,
  CLAIM_TYPE_ID,
  DEBATE_TYPE_ID,
  TWEET_TYPE_ID,
  EPISODE_TYPE_ID,
  PAPER_TYPE_ID,
];

function filterByType(spaceId: string, typeId: string): string {
  return JSON.stringify({
    spaceId: { in: [spaceId] },
    filter: { [SystemIds.TYPES_PROPERTY]: { is: typeId } },
  });
}

function filterByTypes(spaceId: string, typeIds: string[]): string {
  return JSON.stringify({
    mode: 'OR',
    spaceId: { in: [spaceId] },
    filter: { [SystemIds.TYPES_PROPERTY]: { in: typeIds } },
  });
}

const SORT_BY_SCORE_DESCENDING = JSON.stringify({
  sort_by: SCORE_SYSTEM_PROPERTY,
  sort_direction: 'descending',
});

type Args = {
  spaceId: string;
  spaceHomeEntityId: string;
};

export function generateNewSpaceTemplateOps({ spaceId, spaceHomeEntityId }: Args): Op[] {
  const ops: Op[] = [];

  let cursor: string | null = null;
  const nextPosition = () => {
    const position = Position.generateBetween(cursor, null);
    cursor = position;
    return position;
  };

  const allDebatesPageId = ID.createEntityId();
  const allDebatesBlockId = ID.createEntityId();
  const debatesFilter = filterByType(spaceId, DEBATE_TYPE_ID);

  const { ops: allDebatesBlockOps } = Graph.createEntity({
    id: allDebatesBlockId,
    name: 'All debates',
    types: [SystemIds.DATA_BLOCK],
    values: [
      { property: SystemIds.FILTER, type: 'text', value: debatesFilter },
      { property: SORT_PROPERTY, type: 'text', value: SORT_BY_SCORE_DESCENDING },
    ],
    relations: {
      [SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE]: { toEntity: SystemIds.QUERY_DATA_SOURCE },
    },
  });
  ops.push(...allDebatesBlockOps);

  const { ops: allDebatesPageOps } = Graph.createEntity({
    id: allDebatesPageId,
    name: 'All debates',
    types: [DEBATES_PAGE_TYPE_ID],
    relations: {
      [SystemIds.BLOCKS]: {
        toEntity: allDebatesBlockId,
        position: Position.generate(),
        entityValues: [{ property: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID, type: 'boolean', value: true }],
        entityRelations: {
          [SystemIds.VIEW_PROPERTY]: { toEntity: SystemIds.GALLERY_VIEW },
          [SystemIds.PROPERTIES]: [{ toEntity: SystemIds.NAME_PROPERTY }, { toEntity: DEBATE_VIDEOS_PROPERTY_ID }],
        },
      },
    },
  });
  ops.push(...allDebatesPageOps);

  const recentDebatesBlockId = ID.createEntityId();

  const { ops: recentDebatesBlockOps } = Graph.createEntity({
    id: recentDebatesBlockId,
    name: 'Recent debates',
    types: [SystemIds.DATA_BLOCK],
    values: [
      { property: SystemIds.FILTER, type: 'text', value: debatesFilter },
      { property: SORT_PROPERTY, type: 'text', value: SORT_BY_SCORE_DESCENDING },
    ],
    relations: {
      [SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE]: { toEntity: SystemIds.QUERY_DATA_SOURCE },
      [DATA_BLOCK_VIEW_ALL_PROPERTY_ID]: { toEntity: allDebatesPageId },
    },
  });
  ops.push(...recentDebatesBlockOps);

  const { ops: recentDebatesRelationOps } = Graph.createRelation({
    fromEntity: spaceHomeEntityId,
    type: SystemIds.BLOCKS,
    toEntity: recentDebatesBlockId,
    position: nextPosition(),
    entityValues: [{ property: DATA_BLOCK_PAGE_SIZE_PROPERTY_ID, type: 'integer', value: RECENT_DEBATES_PAGE_SIZE }],
    entityRelations: {
      [SystemIds.VIEW_PROPERTY]: { toEntity: SystemIds.GALLERY_VIEW },
      [SystemIds.PROPERTIES]: [{ toEntity: SystemIds.NAME_PROPERTY }, { toEntity: DEBATE_VIDEOS_PROPERTY_ID }],
    },
  });
  ops.push(...recentDebatesRelationOps);

  const rankingBlock = ({
    name,
    typeId,
    view,
    pageSize,
  }: {
    name: string;
    typeId: string;
    view: string;
    pageSize?: number;
  }) => {
    const blockId = ID.createEntityId();

    const { ops: blockOps } = Graph.createEntity({
      id: blockId,
      name,
      types: [RANKING_BLOCK_TYPE_ID, ROLLING_RANKING_TYPE_ID],
      values: [
        { property: SystemIds.FILTER, type: 'text', value: filterByType(spaceId, typeId) },
        {
          property: SUBMISSION_FREQUENCY_PROPERTY_ID,
          type: 'integer',
          value: ROLLING_RANKING_SUBMISSION_FREQUENCY_HOURS,
        },
      ],
      relations: {
        [TAG_PROPERTY_ID]: { toEntity: FEATURED_TAG_ID },
        [RANKING_AGGREGATION_RESTRICTION_PROPERTY_ID]: {
          toEntity: RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_ID,
        },
      },
    });
    ops.push(...blockOps);

    const { ops: relationOps } = Graph.createRelation({
      fromEntity: spaceHomeEntityId,
      type: SystemIds.BLOCKS,
      toEntity: blockId,
      position: nextPosition(),
      ...(pageSize !== undefined
        ? { entityValues: [{ property: DATA_BLOCK_PAGE_SIZE_PROPERTY_ID, type: 'integer' as const, value: pageSize }] }
        : {}),
      entityRelations: {
        [SystemIds.VIEW_PROPERTY]: { toEntity: view },
        [SystemIds.PROPERTIES]: [{ toEntity: SystemIds.DESCRIPTION_PROPERTY }, { toEntity: SystemIds.TYPES_PROPERTY }],
      },
    });
    ops.push(...relationOps);
  };

  rankingBlock({
    name: 'Trending claims',
    typeId: CLAIM_TYPE_ID,
    view: SystemIds.BULLETED_LIST_VIEW,
    pageSize: TRENDING_CLAIMS_PAGE_SIZE,
  });

  rankingBlock({
    name: 'Trending topics',
    typeId: TOPIC_TYPE_ID,
    view: RANKING_VIEW_PILL_ID,
  });

  const recentNewsBlockId = ID.createEntityId();

  const { ops: recentNewsBlockOps } = Graph.createEntity({
    id: recentNewsBlockId,
    name: 'Recent news',
    types: [SystemIds.DATA_BLOCK],
    values: [
      { property: SystemIds.FILTER, type: 'text', value: filterByTypes(spaceId, RECENT_NEWS_TYPE_IDS) },
      { property: SORT_PROPERTY, type: 'text', value: SORT_BY_SCORE_DESCENDING },
    ],
    relations: {
      [SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE]: { toEntity: SystemIds.QUERY_DATA_SOURCE },
    },
  });
  ops.push(...recentNewsBlockOps);

  const { ops: recentNewsRelationOps } = Graph.createRelation({
    fromEntity: spaceHomeEntityId,
    type: SystemIds.BLOCKS,
    toEntity: recentNewsBlockId,
    position: nextPosition(),
    entityValues: [{ property: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID, type: 'boolean', value: true }],
    entityRelations: {
      [SystemIds.VIEW_PROPERTY]: { toEntity: DATA_BLOCK_VIEW_EXPLORE_ID },
      [DATA_BLOCK_TOOLS_PROPERTY_ID]: { toEntity: LINK_INGESTION_TOOL_ID },
    },
  });
  ops.push(...recentNewsRelationOps);

  return ops;
}
