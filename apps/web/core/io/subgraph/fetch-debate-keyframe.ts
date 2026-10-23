import { Effect, Either } from 'effect';

import {
  DEBATE_VIDEOS_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  WEB_URL_PROPERTY_ID,
} from '~/core/debates/ontology';
import { Environment } from '~/core/environment';
import { findMediaUrlValue } from '~/core/utils/media-url';

import { graphql } from './graphql';

interface DebateKeyframeResult {
  entity: {
    videos: {
      toEntity: {
        keyframes: { toEntity: { valuesList: { propertyId: string; text: string | null }[] } | null }[];
      } | null;
    }[];
  } | null;
}

const debateKeyframeQuery = (debateId: string) => `
  {
    entity(id: ${JSON.stringify(debateId)}) {
      videos: relationsList(filter: { typeId: { is: ${JSON.stringify(DEBATE_VIDEOS_PROPERTY_ID)} } }) {
        toEntity {
          keyframes: relationsList(filter: { typeId: { is: ${JSON.stringify(KEY_FRAME_IMAGE_PROPERTY_ID)} } }) {
            toEntity {
              valuesList(filter: { propertyId: { in: [${JSON.stringify(IMAGE_URL_PROPERTY_ID)}, ${JSON.stringify(WEB_URL_PROPERTY_ID)}] } }) {
                propertyId
                text
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * A debate's poster still, as a stored value (`ipfs://…` or geo-chat's URL): Debate → Videos → Key
 * frame, picked the way `useDebateKeyframes` picks it. The server-side read, for callers with no store.
 * Null when the debate has none, or the graph can't answer.
 */
export async function fetchDebateKeyframe(debateId: string): Promise<string | null> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<DebateKeyframeResult>({ query: debateKeyframeQuery(debateId), endpoint: Environment.getConfig().api })
    )
  );
  if (Either.isLeft(result)) {
    console.warn('Failed to read the debate keyframe', result.left);
    return null;
  }
  const keyframes = (result.right.entity?.videos ?? []).flatMap(video => video.toEntity?.keyframes ?? []);
  for (const keyframe of keyframes) {
    const url = findMediaUrlValue(
      (keyframe.toEntity?.valuesList ?? []).map(v => ({ value: v.text, property: { id: v.propertyId } }))
    );
    if (url) return url;
  }
  return null;
}
