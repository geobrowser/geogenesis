import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Profile } from '~/core/types';
import { Environment } from '~/core/environment';

import { HistoryVersion } from '../dto/versions';
import { defaultProfile, fetchProfileBySpaceId } from './fetch-profile';
import { graphql } from './graphql';

interface FetchVersionArgs {
  versionId: string; // This is the editId
  signal?: AbortSignal;
}

// Query to get a single proposal by ID
const proposalQuery = (proposalId: string) => `query {
  proposal(id: ${JSON.stringify(proposalId)}) {
    id
    proposedBy
    spaceId
    edit {
      id
      name
      createdAt
    }
  }
}`;

interface ProposalNode {
  id: string;
  proposedBy: string;
  spaceId: string;
  edit: {
    id: string;
    name: string;
    createdAt: number;
  } | null;
}

interface ProposalResult {
  proposal: ProposalNode | null;
}

export async function fetchHistoryVersion(args: FetchVersionArgs): Promise<HistoryVersion | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  // Assumption: editId == proposalId in this API/environment.
  // If that invariant ever breaks, this lookup will return null.
  const proposal = await fetchProposal({ proposalId: args.versionId, signal: args.signal, endpoint, queryId });

  if (!proposal) {
    return null;
  }

  // Get creator profile
  const createdById = proposal.proposedBy;
  let profile: Profile | undefined;

  if (createdById) {
    profile = await Effect.runPromise(fetchProfileBySpaceId(createdById));
  }

  // Build HistoryVersion
  const createdAtTimestamp = proposal.edit?.createdAt ?? 0;

  return {
    id: proposal.id,
    name: null,
    description: null,
    spaces: proposal.spaceId ? [proposal.spaceId] : [],
    types: [],
    relations: [],
    values: [],
    versionId: proposal.id,
    editName: proposal.edit?.name ?? `Version ${proposal.id.slice(-8)}`,
    proposalId: proposal.id,
    createdAt: createdAtTimestamp,
    createdBy: profile ?? defaultProfile(createdById || proposal.id, createdById || proposal.id),
  };
}

interface FetchProposalArgs {
  proposalId: string;
  signal?: AbortSignal;
  endpoint: string;
  queryId: string;
}

async function fetchProposal({ proposalId, signal, endpoint, queryId }: FetchProposalArgs): Promise<ProposalNode | null> {
  const query = proposalQuery(proposalId);

  const graphqlFetchEffect = graphql<ProposalResult>({
    endpoint,
    query,
    signal,
  });

  const withFallbacks = Effect.gen(function* () {
    const queryResult = yield* Effect.either(graphqlFetchEffect);

    return Either.match(queryResult, {
      onLeft: error => {
        switch (error._tag) {
          case 'AbortError':
            throw error;
          case 'GraphqlRuntimeError':
            console.error(
              `Encountered runtime graphql error in fetchProposal. queryId: ${queryId} proposalId: ${proposalId}`,
              error.message
            );
            return null;
          default:
            console.error(`${error._tag}: Unable to fetch proposal, queryId: ${queryId} proposalId: ${proposalId}`);
            return null;
        }
      },
      onRight: result => result.proposal,
    });
  });

  return Effect.runPromise(withFallbacks);
}
