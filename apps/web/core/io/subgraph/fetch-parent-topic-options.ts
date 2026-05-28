import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { CURATED_TOPIC_TAG_ID, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { Environment } from '~/core/environment';

import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from './space-image';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

const PARENT_TOPIC_OPTIONS_PAGE_SIZE = 100;

export interface ParentTopicOption {
  id: string;
  name: string;
  image: string;
}

interface ParentTopicNode {
  id: string;
  name: string | null;
  relationsList: SpaceImageRelationNode[];
  // first: 1 — we only need a presence check, not the full subtopic list.
  // The per-parent subtopic fetch lives in fetch-unclaimed-subtopics.ts.
  subtopicProbe: {
    nodes: Array<{ toEntity: { id: string } | null }>;
  };
}

interface NetworkResult {
  entitiesConnection: {
    nodes: ParentTopicNode[];
  };
}

const QUERY = `
  {
    entitiesConnection(
      filter: {
        and: [
          { relations: { some: { typeId: { is: ${JSON.stringify(SystemIds.TYPES_PROPERTY)} }, toEntityId: { is: ${JSON.stringify(TOPIC_TYPE_ID)} } } } },
          { relations: { some: { typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} }, toEntityId: { is: ${JSON.stringify(CURATED_TOPIC_TAG_ID)} } } } },
          { backlinks: { none: { typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} } } } }
        ]
      },
      first: ${PARENT_TOPIC_OPTIONS_PAGE_SIZE}
    ) {
      nodes {
        id
        name
        relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
          typeId
          toEntity {
            valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
              propertyId
              text
            }
          }
        }
        subtopicProbe: relations(filter: { typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} } }, first: 1) {
          nodes {
            toEntity { id }
          }
        }
      }
    }
  }
`;

export async function fetchParentTopicOptions(): Promise<ParentTopicOption[]> {
  const queryEffect = graphql<NetworkResult>({
    query: QUERY,
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch parent topic options`);
    return [];
  }

  const nodes = resultOrError.right?.entitiesConnection?.nodes ?? [];

  return (
    nodes
      // Hide parents that have no subtopics at all — selecting them would yield
      // an empty chip list and is unhelpful as a filter. A parent whose subtopics
      // are all claimed still surfaces here; the client handles that case with a
      // "no unclaimed topics under this parent yet" message.
      .filter(node => (node.subtopicProbe?.nodes ?? []).length > 0)
      .map<ParentTopicOption>(node => ({
        id: node.id,
        name: node.name?.trim() ? node.name : PLACEHOLDER_TOPIC_NAME,
        image: resolveSpaceImage(node.relationsList ?? []),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}
