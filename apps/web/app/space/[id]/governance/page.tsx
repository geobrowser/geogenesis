import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';

import { SmallButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { GovernanceProposalsList } from '~/partials/governance/governance-proposals-list';

interface Props {
  params: { id: string };
}

const votingPeriod = '24h';
const passThreshold = '51%';
const rejectedProposalsCount = 0;

export default async function GovernancePage({ params }: Props) {
  const acceptedProposalsCount = await getProposalsCount({ params });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Voting period</h2>
          <p className="text-mediumTitle">{votingPeriod}</p>
        </GovernanceMetadataBox>
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Pass threshold</h2>
          <p className="text-mediumTitle">{passThreshold}</p>
        </GovernanceMetadataBox>
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Active proposals</h2>
          <p className="text-mediumTitle">0</p>
        </GovernanceMetadataBox>
        <GovernanceMetadataBox>
          <h2 className="text-metadata text-grey-04">Accepted vs. rejected</h2>
          <div className="flex items-center gap-3 text-mediumTitle">
            <span>{acceptedProposalsCount}</span>
            <div className="h-4 w-px bg-grey-02" />
            <span>{rejectedProposalsCount}</span>
          </div>
        </GovernanceMetadataBox>
      </div>
      <SmallButton variant="secondary" icon={<ChevronDownSmall />}>
        All Proposals
      </SmallButton>
      <React.Suspense>
        <GovernanceProposalsList spaceId={params.id} />
      </React.Suspense>
    </div>
  );
}

function GovernanceMetadataBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-1 rounded-lg border border-grey-02 py-3">{children}</div>
  );
}

interface NetworkResult {
  proposals: {
    totalCount: number;
  };
}

async function getProposalsCount({ params }: Props) {
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: `
      query {
        proposals(filter: { spaceId: { equalToInsensitive: "${params.id}" } }) {
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
          console.error(`Encountered runtime graphql error in governance/page. spaceId: ${params.id}`, error.message);
          return {
            proposals: {
              totalCount: 0,
            },
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposals count, spaceId: ${params.id}`);
          return {
            proposals: {
              totalCount: 0,
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  return result.proposals.totalCount;
}
