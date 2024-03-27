import { SYSTEM_IDS } from '@geogenesis/ids';
import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { fetchEntities } from '~/core/io/subgraph';
import { graphql } from '~/core/io/subgraph/graphql';
import { Proposal, SpaceConfigEntity } from '~/core/types';
import { Entity } from '~/core/utils/entity';

interface Props {
  proposal: Proposal;
}

export async function SubspaceProposal({ proposal }: Props) {
  const subspace = await fetchSubspace(proposal.id, proposal.space);

  console.log('subspace', subspace);

  if (!subspace) {
    return null;
  }

  return <div>{subspace?.spaceConfig?.name ?? subspace?.id}</div>;
}

const getSubspaceInProposalQuery = (proposalId: string) => `query {
  proposedSubspaces(
    first: 1
    filter: { proposalId: { equalTo: "${proposalId}" } }
  ) {
    nodes {
      spaceBySubspace {
        id

        spaceEditorsV2s {
          totalCount
        }
      }
    }
  }
}`;

interface NetworkResult {
  proposedSubspaces: {
    nodes: {
      spaceBySubspace: {
        id: string;

        spaceEditorsV2s: {
          totalCount: number;
        };
      };
    }[];
  };
}

async function fetchSubspace(proposalId: string, spaceId: string) {
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getSubspaceInProposalQuery(proposalId),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchSubspace. spaceId: ${spaceId} proposalId: ${proposalId} endpoint: ${endpoint}

            queryString: ${getSubspaceInProposalQuery(proposalId)}
            `,
            error.message
          );

          return {
            proposedSubspaces: {
              nodes: [],
            },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch subspace, spaceId: ${spaceId} proposalId: ${proposalId} endpoint: ${endpoint}`
          );

          return {
            proposedSubspaces: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedSubspaces = result.proposedSubspaces.nodes;

  if (proposedSubspaces.length === 0) {
    return null;
  }

  // There should only be one proposed space in a single proposal
  const proposedSpace = proposedSubspaces[0].spaceBySubspace;

  const spaceConfigs = await fetchEntities({
    query: '',
    spaceId: proposedSpace.id,
    typeIds: [SYSTEM_IDS.SPACE_CONFIGURATION],
    filter: [],
  });

  // Ensure that we're using the space config that has been defined in the current space.
  // Eventually this association will be handled by the substream API.
  const spaceConfig = spaceConfigs.find(s =>
    Boolean(s.triples.find(t => t.attributeId === SYSTEM_IDS.TYPES && t.space === proposedSpace.id))
  );

  const spaceConfigWithImage: SpaceConfigEntity | null = spaceConfig
    ? {
        ...spaceConfig,
        image: Entity.avatar(spaceConfig.triples) ?? Entity.cover(spaceConfig.triples) ?? null,
      }
    : null;

  return {
    id: proposedSpace.id,
    membersCount: proposedSpace.spaceEditorsV2s.totalCount,
    editorsCount: proposedSpace.spaceEditorsV2s.totalCount,
    spaceConfig: spaceConfigWithImage,
  };
}
