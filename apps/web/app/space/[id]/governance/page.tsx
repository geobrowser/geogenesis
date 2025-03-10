import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { cookies } from 'next/headers';

import * as React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';

import { ActiveProposal } from '~/partials/active-proposal/active-proposal';
import { GovernanceProposalsList } from '~/partials/governance/governance-proposals-list';
import { GovernanceProposalsListInfiniteScroll } from '~/partials/governance/governance-proposals-list-infinite-scroll';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ proposalId?: string }>;
}

const INITIAL_PUBLIC_SPACES = [
  '25omwWh6HYgeRQKCaSpVpa', // Geo root
  'DqiHGrgbniQ9RXRbcQArQ2', // Industries
  'SgjATMbm41LX6naizMqBVd', // Crypto
  'BDuZwkjCg3nPWMDshoYtpS', // Crypto News
  '9WjyZnACdQorhyZWXvjsYB', // software
];

const getVotingPeriod = (spaceId: string) => {
  // We don't currently track voting settings in the indexer, so we
  // hardcode which initial spaces had the 4h voting duration.
  if (INITIAL_PUBLIC_SPACES.includes(spaceId)) return '4h';
  return '24h';
};
const passThreshold = '50%';

export const dynamic = 'force-dynamic';

export default async function GovernancePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const { acceptedProposals, rejectedProposals, activeProposals } = await getProposalsCount({ id: params.id });

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-5">
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Voting period</h2>
            <p className="text-mediumTitle">{getVotingPeriod(params.id)}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Pass threshold</h2>
            <p className="text-mediumTitle">{passThreshold}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Active proposals</h2>
            <p className="text-mediumTitle">{activeProposals.totalCount}</p>
          </GovernanceMetadataBox>
          <GovernanceMetadataBox>
            <h2 className="text-metadata text-grey-04">Accepted vs. rejected</h2>
            <div className="flex items-center gap-3 text-mediumTitle">
              <span>{acceptedProposals.totalCount}</span>
              <div className="h-4 w-px bg-grey-02" />
              <span>{rejectedProposals.totalCount}</span>
            </div>
          </GovernanceMetadataBox>
        </div>
        {/* <SmallButton variant="secondary" icon={<ChevronDownSmall />}>
          All Proposals
        </SmallButton> */}
        <React.Suspense fallback="Loading initial...">
          <GovernanceProposalsList page={0} spaceId={params.id} />
        </React.Suspense>

        <GovernanceProposalsListInfiniteScroll spaceId={params.id} page={0} />
      </div>

      <ActiveProposal connectedAddress={connectedAddress} spaceId={params.id} proposalId={searchParams.proposalId} />
    </>
  );
}

function GovernanceMetadataBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-1 rounded-lg border border-grey-02 py-3">{children}</div>
  );
}

interface NetworkResult {
  activeProposals: {
    totalCount: number;
  };
  acceptedProposals: {
    totalCount: number;
  };
  rejectedProposals: {
    totalCount: number;
  };
}

async function getProposalsCount({ id }: Awaited<Props['params']>) {
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
    query: `
    query {
      activeProposals: proposals(
        filter: {
          spaceId: { equalToInsensitive: "${id}" }
          status: { equalTo: PROPOSED }
          endTime: { greaterThanOrEqualTo: ${Math.floor(Date.now() / 1000)} }
          or: [
            { type: { equalTo: ADD_EDIT } }
            { type: { equalTo: ADD_SUBSPACE } }
            { type: { equalTo: REMOVE_SUBSPACE } }
          ]
        }
      ) {
        totalCount
      }

      acceptedProposals: proposals(
        filter: {
          spaceId: { equalToInsensitive: "${id}" }
          status: { equalTo: ACCEPTED }
          or: [
            { type: { equalTo: ADD_EDIT } }
            { type: { equalTo: ADD_SUBSPACE } }
            { type: { equalTo: REMOVE_SUBSPACE } }
          ]
        }
      ) {
        totalCount
      }

      rejectedProposals: proposals(
        filter: {
          spaceId: { equalToInsensitive: "${id}" }
          status: { in: [REJECTED, PROPOSED] }
          endTime: { greaterThanOrEqualTo: ${Math.floor(Date.now() / 1000)} }
          or: [
            { type: { equalTo: ADD_EDIT } }
            { type: { equalTo: ADD_SUBSPACE } }
            { type: { equalTo: REMOVE_SUBSPACE } }
          ]
        }
      ) {
        totalCount
      }
    }`,
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
          console.error(`Encountered runtime graphql error in governance/page. spaceId: ${id}`, error.message);
          return {
            activeProposals: {
              totalCount: 0,
            },
            acceptedProposals: {
              totalCount: 0,
            },
            rejectedProposals: {
              totalCount: 0,
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals count, spaceId: ${id}`);
          return {
            activeProposals: {
              totalCount: 0,
            },
            acceptedProposals: {
              totalCount: 0,
            },
            rejectedProposals: {
              totalCount: 0,
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  return result;
}
