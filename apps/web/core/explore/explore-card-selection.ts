import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { DEBATE_VIDEOS_PROPERTY_ID } from '~/core/debates/ontology';

import { COMMENT_RELATION_TYPE_ID } from './explore-card-item';
import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
} from './explore-constants';

// Only the property IDs and relation-type IDs we actually read per entity.
// Narrowing these on the server slashes payload size — most entities have dozens of
// unrelated values/relations we'd otherwise serialize, ship, and decode for nothing.
const CARD_VALUE_PROPERTY_IDS = [
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_AVATAR_PROPERTY_ID,
];
const CARD_RELATION_TYPE_IDS = [
  SystemIds.COVER_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  // `types` relation — used to derive space-scoped type tags.
  SystemIds.TYPES_PROPERTY,
  // Community call recordings — feed the CommunityCall card's player.
  EVENT_SCHEMA.RECORDINGS_PROPERTY,
  // Rendered debate video — populates ExploreFeedItem.debateVideoUrls.
  DEBATE_VIDEOS_PROPERTY_ID,
];

const valuePropertyIdList = CARD_VALUE_PROPERTY_IDS.map(id => `"${id}"`).join(', ');
const relationTypeIdList = CARD_RELATION_TYPE_IDS.map(id => `"${id}"`).join(', ');


/**
 * The per-entity selection every Explore feed card decodes, shared by all the feed
 * documents so a field added for one sort cannot silently go missing from another.
 *
 * It was duplicated across `explore-entities-document` (New) and
 * `explore-entities-by-property-document` (Top) — byte-identical apart from the
 * fragment name — and a third copy was about to be added for Best. Each document still
 * declares its own fragment name because they are parsed independently and a shared
 * name would collide, so the name is a parameter rather than a constant.
 *
 * Whitespace here is not significant: consumers `parse()` the result, and the
 * equivalence of the New/Top documents before and after this extraction was checked by
 * comparing their printed ASTs, which normalise formatting.
 */
export function exploreCardPropertyFragment(fragmentName: string): string {
  return /* GraphQL */ `
    fragment ${fragmentName} on PropertyInfo {
      id
      name
      dataTypeId
      dataTypeName
      renderableTypeId
      renderableTypeName
      format
      isType
    }
  `;
}

type ExploreCardNodeFieldOptions = {
  /**
   * Whether the values/relations lists are narrowed to `$spaceIdsForLists`, which the caller's
   * query must then declare as `[UUID!]!`.
   *
   * On by default, and the right answer for the feeds: they already know which spaces they are
   * scoped to, and narrowing server-side is what stops a multi-space page pulling every unrelated
   * value on every entity.
   *
   * Off for callers that cannot know the spaces before the rows come back — a topic's Coverage
   * gathers across every space in the graph, so there is no list to scope to. Dropping the clause is
   * safe rather than merely tolerable: the lists are still narrowed by property and relation type,
   * which is what bounds them, and the decoder scopes to the display space afterwards regardless.
   */
  scopeListsToSpaces?: boolean;
};

/** Fields selected inside `nodes { ... }`. */
export function exploreCardNodeFields(fragmentName: string, options: ExploreCardNodeFieldOptions = {}): string {
  const { scopeListsToSpaces = true } = options;
  const spaceClause = scopeListsToSpaces ? 'spaceId: { in: $spaceIdsForLists }' : '';
  const toEntityValuesFilter = scopeListsToSpaces ? '(filter: { spaceId: { in: $spaceIdsForLists } })' : '';

  return /* GraphQL */ `
    id
    name
    description
    spaceIds
    createdAt

    backlinks(filter: { typeId: { is: "${COMMENT_RELATION_TYPE_ID}" } }) {
      totalCount
    }

    types {
      id
      name
    }

    valuesList(filter: {
      ${spaceClause}
      propertyId: { in: [${valuePropertyIdList}] }
    }) {
      spaceId
      property {
        ...${fragmentName}
      }
      text
      integer
      float
      point
      boolean
      time
      language
      unit
      datetime
      date
      decimal
      schedule
    }

    relationsList(filter: {
      ${spaceClause}
      typeId: { in: [${relationTypeIdList}] }
    }) {
      id
      spaceId
      position
      verified
      entityId
      fromEntity {
        id
        name
      }
      toEntity {
        id
        name
        types {
          id
        }
        valuesList${toEntityValuesFilter} {
          spaceId
          propertyId
          text
        }
      }
      toSpaceId
      type {
        id
        name
      }
    }
  `;
}
