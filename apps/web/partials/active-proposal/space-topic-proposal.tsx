import { Effect, Either } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { uuidToHex } from '~/core/id/normalize';
import type { Proposal } from '~/core/io/dto/proposals';
import { graphql } from '~/core/io/subgraph/graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from '~/core/io/subgraph/space-image';
import type { TopicUsageSpaceNode } from '~/core/io/subgraph/topic-space-usage';
import { mergeTopicUsageSpaces } from '~/core/io/subgraph/topic-space-usage';

import { NativeGeoImage } from '~/design-system/geo-image';

interface Props {
  proposal: Proposal;
}

type TopicProposalMetadata = {
  id: string;
  name: string | null;
  image: string;
  associatedSpaces: {
    id: string;
    name: string;
    image: string;
  }[];
  associatedSpacesCount: number;
};

type TopicProposalMetadataResult = {
  entity: {
    id: string;
    name: string | null;
    description: string | null;
    relationsList: SpaceImageRelationNode[];
    spacesByTopicIdConnection: {
      totalCount: number;
      nodes: TopicUsageSpaceNode[];
    };
  } | null;
};

export async function SpaceTopicProposal({ proposal }: Props) {
  const details = proposal.spaceTopicDetails;

  if (!details) {
    return null;
  }

  const topicMetadata = await fetchTopicProposalMetadata(details.targetTopicId);

  const heroTitle = topicMetadata?.name ?? details.targetTopicId;
  const heroImage = topicMetadata?.image ?? PLACEHOLDER_SPACE_IMAGE;
  const changeDescription =
    details.actionType === 'TOPIC_REMOVED' || details.actionType === 'UNSET_TOPIC'
      ? `Remove space topic ${heroTitle}`
      : `Set space topic as ${heroTitle}`;

  return (
    <div className="flex w-full justify-center">
      <div className="mt-24 w-full max-w-[860px] px-6 pb-24">
        <div className="flex flex-col items-center gap-5">
          <div className="shadow-sm size-20 overflow-hidden rounded-xl border border-grey-02 bg-grey-01">
            <NativeGeoImage
              value={heroImage}
              alt={`Image for ${heroTitle}`}
              className="h-full w-full rounded-xl object-cover"
            />
          </div>

          <h2 className="max-w-[400px] text-center text-mainPage text-text">{heroTitle}</h2>
        </div>

        <div className="mx-auto mt-9 w-full max-w-[400px] border-t border-grey-02">
          <div className="border-b border-grey-02 py-4">
            <p className="text-center text-metadata text-text">{changeDescription}</p>
          </div>

          <div className="py-4">
            <p className="text-metadata text-text">Associated spaces</p>

            <div className="mt-6 flex flex-col gap-5">
              {topicMetadata?.associatedSpaces.length ? (
                topicMetadata.associatedSpaces.map(space => <AssociatedSpaceRow key={space.id} space={space} />)
              ) : (
                <p className="text-metadata text-grey-04">No associated spaces found yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssociatedSpaceRow({
  space,
}: {
  space: {
    id: string;
    name: string;
    image: string;
  };
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 size-4 overflow-hidden rounded-[4px] border border-grey-02 bg-grey-01">
        <NativeGeoImage
          value={space.image}
          alt={`Image for ${space.name}`}
          className="h-full w-full rounded-[4px] object-cover"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-button text-text">{space.name}</p>
      </div>
    </div>
  );
}

async function fetchTopicProposalMetadata(topicId: string): Promise<TopicProposalMetadata | null> {
  const normalizedTopicId = uuidToHex(topicId);
  const result = await Effect.runPromise(
    Effect.either(
      graphql<TopicProposalMetadataResult>({
        endpoint: Environment.getConfig().api,
        query: `
          {
            entity(id: ${JSON.stringify(normalizedTopicId)}) {
              id
              name
              description
              relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
                typeId
                toEntity {
                  valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                    propertyId
                    text
                  }
                }
              }
              spacesByTopicIdConnection(first: 3) {
                totalCount
                nodes {
                  id
                  page {
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
                  }
                }
              }
            }
          }
        `,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.warn('Failed to fetch topic proposal metadata', result.left);
    return null;
  }

  if (!result.right.entity) {
    return null;
  }

  const entity = result.right.entity;

  const associatedSpaces = mergeTopicUsageSpaces(entity.spacesByTopicIdConnection.nodes);

  return {
    id: entity.id,
    name: entity.name,
    image: resolveSpaceImage(entity.relationsList),
    associatedSpaces,
    associatedSpacesCount: entity.spacesByTopicIdConnection.totalCount,
  };
}
