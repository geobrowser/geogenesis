import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
} from './explore-constants';

// Only the four property IDs and the three relation-type IDs we actually read per entity.
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
];

const valuePropertyIdList = CARD_VALUE_PROPERTY_IDS.map(id => `"${id}"`).join(', ');
const relationTypeIdList = CARD_RELATION_TYPE_IDS.map(id => `"${id}"`).join(', ');

/** Comment relation type — `backlinks` through it is how a card gets its comment count. */
const COMMENT_RELATION_TYPE_ID = '310d4a240e5b451cb2151bfce40d0fe6';

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

/**
 * Fields selected inside `nodes { ... }`. `$spaceIdsForLists` must be declared by the
 * caller's query as `[UUID!]!` — the values/relations lists are space-scoped so a
 * multi-space feed still decodes cover/avatar/description without pulling every
 * unrelated value.
 */
export function exploreCardNodeFields(fragmentName: string): string {
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
      spaceId: { in: $spaceIdsForLists }
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
      spaceId: { in: $spaceIdsForLists }
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
        valuesList(filter: { spaceId: { in: $spaceIdsForLists } }) {
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
