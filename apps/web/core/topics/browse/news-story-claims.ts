import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { NEWS_STORY_TYPE_ID } from '~/core/constants';
import type { BacklinkCondition, WhereCondition } from '~/core/sync/experimental_query-layer';
import { TEMPLATE_ONTOLOGY } from '~/core/templates/ontology';

/**
 * Claims a news story lists are the story's supporting points, not claims curated for a topic
 * (GEO-3847). The news pipeline tags each of them with the story's topics through the same
 * `Topics` relation a person writes, so the only mark they carry is that a story lists them:
 *
 * - News story -`Notable claims`-> claim, or
 * - News story -`Blocks`-> data block -`Collection item`-> claim (the story's sections).
 *
 * Read from the claim's backlinks, so no graph change is needed. A claim a person links to the
 * topic is hidden too when a story already lists it: the two links are the same relation.
 */
const NOTABLE_CLAIMS_FROM_STORY: BacklinkCondition = {
  typeOf: { id: { equals: TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID } },
  fromEntity: { types: [{ id: { equals: NEWS_STORY_TYPE_ID } }] },
};

const STORY_SECTION_ITEM: BacklinkCondition = {
  typeOf: { id: { equals: SystemIds.COLLECTION_ITEM_RELATION_TYPE } },
  fromEntity: {
    backlinks: [
      {
        typeOf: { id: { equals: SystemIds.BLOCKS } },
        fromEntity: { types: [{ id: { equals: NEWS_STORY_TYPE_ID } }] },
      },
    ],
  },
};

/** A `where` clause that drops entities a news story lists. Add it as `NOT`. */
export const LISTED_BY_NEWS_STORY: WhereCondition = {
  OR: [{ backlinks: [NOTABLE_CLAIMS_FROM_STORY] }, { backlinks: [STORY_SECTION_ITEM] }],
};

/**
 * The same rule as a GraphQL `EntityFilter` fragment, for the hand-written count and tagged
 * queries. Ids are inlined: they are constants, and the documents are cached by shape.
 */
export const NOT_LISTED_BY_NEWS_STORY_FILTER = /* GraphQL */ `backlinks: {
  none: {
    or: [
      { typeId: { is: "${TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID}" }, fromEntity: { typeIds: { overlaps: ["${NEWS_STORY_TYPE_ID}"] } } }
      {
        typeId: { is: "${SystemIds.COLLECTION_ITEM_RELATION_TYPE}" }
        fromEntity: {
          backlinks: {
            some: { typeId: { is: "${SystemIds.BLOCKS}" }, fromEntity: { typeIds: { overlaps: ["${NEWS_STORY_TYPE_ID}"] } } }
          }
        }
      }
    ]
  }
}`;

/**
 * For a check over mixed feed rows (claims, debates, news stories): non-claims pass, claims pass
 * only when no story lists them.
 */
export const CLAIM_NOT_LISTED_BY_NEWS_STORY_FILTER = /* GraphQL */ `or: [
  { not: { typeIds: { overlaps: ["${CLAIM_TYPE_ID}"] } } }
  { ${NOT_LISTED_BY_NEWS_STORY_FILTER} }
]`;
