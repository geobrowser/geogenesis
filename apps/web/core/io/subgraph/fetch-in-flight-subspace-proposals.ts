import { graphql } from 'gql.tada';

import { getClient } from '~/core/gql/client';

import { Subspace } from './fetch-subspaces';
import { getSpaceConfigFromMetadata } from './network-local-mapping';

const ImageValueTripleFragment = graphql(`
  fragment ImageValue on Triple {
    attributeId
    textValue
    valueType
  }
`);

const TripleFragment = graphql(
  `
    fragment Triple on Triple {
      attribute {
        id
        name
      }
      entityId
      entity {
        id
        name
      }
      entityValue {
        id
        types {
          nodes {
            id
          }
        }
        name
        triples {
          nodes {
            ...ImageValue
          }
        }
      }
      numberValue
      collectionValue {
        id
        collectionItems {
          nodes {
            index
            collectionItemEntityId
            entity {
              id
              name
              types {
                nodes {
                  id
                }
              }
              triples {
                nodes {
                  ...ImageValue
                }
              }
            }
          }
        }
      }
      textValue
      valueType
      space {
        id
      }
    }
  `,
  [ImageValueTripleFragment]
);

const SpaceMetadataFragment = graphql(
  `
    fragment SpaceMetadata on SpacesMetadatum {
      entity {
        id
        name

        triples {
          nodes {
            ...Triple
          }
        }
      }
    }
  `,
  [TripleFragment]
);

const InflightSubspacesForSpaceIdQuery = graphql(
  `
    query InflightSubspacessForSpaceIdQuery($spaceId: String!, $endTime: Int!) {
      proposals(
        filter: {
          type: { equalTo: ADD_SUBSPACE }
          spaceId: { equalTo: $spaceId }
          endTime: { greaterThanOrEqualTo: $endTime }
        }
      ) {
        nodes {
          proposedSubspaces {
            nodes {
              spaceBySubspace {
                id
                daoAddress
                spaceEditors {
                  totalCount
                }
                spaceMembers {
                  totalCount
                }
                spacesMetadata {
                  nodes {
                    ...SpaceMetadata
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  [SpaceMetadataFragment]
);

export async function fetchInFlightSubspaceProposalsForSpaceId(spaceId: string) {
  const result = await getClient().query(InflightSubspacesForSpaceIdQuery, { spaceId, endTime: Date.now() });

  const subspaces = result.data?.proposals?.nodes.flatMap(p => p?.proposedSubspaces.nodes);

  const spaces = subspaces?.map((spaceBySubspace): Subspace => {
    const subspace = spaceBySubspace?.spaceBySubspace;
    console.log('subspace', subspace);
    const spaceConfigWithImage = getSpaceConfigFromMetadata(
      subspace?.id ?? '',
      subspace?.spacesMetadata.nodes[0].entity
    );

    return {
      id: subspace!.id,
      daoAddress: subspace!.daoAddress,
      totalEditors: subspace?.spaceEditors.totalCount ?? 0,
      totalMembers: subspace?.spaceMembers.totalCount ?? 0,
      spaceConfig: spaceConfigWithImage,
    };
  });

  return spaces ?? [];
}
