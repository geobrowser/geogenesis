import { Effect, Either } from 'effect';
import Image from 'next/legacy/image';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { fetchSpace } from '~/core/io/subgraph';
import { entityFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamEntity, getSpaceConfigFromMetadata } from '~/core/io/subgraph/network-local-mapping';
import { Proposal } from '~/core/types';

import { AddTo } from '~/design-system/icons/add-to';
import { EditSmall } from '~/design-system/icons/edit-small';
import { Member } from '~/design-system/icons/member';

interface Props {
  proposal: Proposal;
}

export async function SubspaceProposal({ proposal }: Props) {
  const [subspace, space] = await Promise.all([
    fetchProposedSubspace(proposal.id, proposal.space.id),
    fetchSpace({ id: proposal.space.id }),
  ]);

  if (!subspace) {
    // @TODO: Error handle though this should never happen
    return null;
  }

  const isAddSubspace = proposal.type === 'ADD_SUBSPACE';

  return (
    <div className="flex w-full justify-center">
      <div className="mt-20 flex w-[585px] flex-col items-center rounded-lg border border-grey-02 p-5">
        <div className="flex w-full flex-col gap-5 divide-y divide-grey-02">
          <div className="flex w-full flex-col items-center gap-6">
            <div className="relative h-[72px] w-[72px] overflow-hidden rounded-lg border border-white object-cover shadow-lg">
              <Image
                src={space?.spaceConfig?.image ?? PLACEHOLDER_SPACE_IMAGE}
                alt={`Space cover image for ${space?.spaceConfig?.name ?? space?.id}`}
                className="h-[72px] w-[72px] rounded-lg"
                objectFit="cover"
                layout="fill"
              />
            </div>
            <div className="space-y-5">
              <h2 className="break-all text-mainPage">{space?.spaceConfig?.name ?? space?.id}</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="flex h-6 items-center rounded-sm bg-text px-1.5 text-breadcrumb text-white">
                  Space
                </span>
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <EditSmall color="grey-04" />
                  {space?.editors.length}
                </div>
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <Member color="grey-04" />
                  {space?.members.length}
                </div>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3">
            <p className="mt-5 text-metadataMedium text-grey-04">
              {isAddSubspace ? 'Add subspace' : 'Remove subspace'}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Optically align centered */}
                <div className="-mt-1">
                  <AddTo color="grey-04" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative h-4 w-4 overflow-hidden rounded-sm object-cover">
                    <Image
                      src={subspace?.spaceConfig?.image ?? PLACEHOLDER_SPACE_IMAGE}
                      alt={`Space cover image for ${subspace?.spaceConfig?.name ?? space?.id}`}
                      className="h-4 w-4 rounded-sm"
                      objectFit="cover"
                      layout="fill"
                    />
                  </div>
                </div>
                <p className="text-smallTitle">{subspace?.spaceConfig?.name ?? subspace?.id}</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <EditSmall color="grey-04" />
                  {subspace?.editorsCount}
                </div>
                <div className="flex h-6 items-center gap-1 rounded-sm bg-divider px-1.5 text-breadcrumb text-text">
                  <Member color="grey-04" />
                  {subspace?.membersCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const getSubspaceInProposalQuery = (proposalId: string) => `query {
  proposedSubspaces(
    first: 1
    filter: { proposalId: { equalTo: "${proposalId}" } }
  ) {
    nodes {
      spaceBySubspace {
        id

        spaceEditors {
          totalCount
        }

        metadata {
          nodes {
            ${entityFragment}
          }           
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

        spaceEditors: {
          totalCount: number;
        };

        metadata: { nodes: SubstreamEntity[] };
      };
    }[];
  };
}

async function fetchProposedSubspace(proposalId: string, spaceId: string) {
  const endpoint = Environment.getConfig().api;

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
            `Encountered runtime graphql error in fetchProposedSubspace. spaceId: ${spaceId} proposalId: ${proposalId} endpoint: ${endpoint}

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
  const spaceConfigWithImage = getSpaceConfigFromMetadata(proposedSpace.id, proposedSpace.metadata.nodes[0]);

  return {
    id: proposedSpace.id,
    membersCount: proposedSpace.spaceEditors.totalCount,
    editorsCount: proposedSpace.spaceEditors.totalCount,
    spaceConfig: spaceConfigWithImage,
  };
}
