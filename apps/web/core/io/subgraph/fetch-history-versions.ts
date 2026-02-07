import { Effect, Either } from 'effect';
import { v4 as uuid } from 'uuid';

import { Profile } from '~/core/types';
import { Environment } from '~/core/environment';

import { HistoryVersion } from '../dto/versions';
import { defaultProfile, fetchProfilesBySpaceIds } from './fetch-profile';
import { graphql } from './graphql';

interface FetchVersionsArgs {
  entityId: string;
  page?: number;
  signal?: AbortSignal;
}

const PAGE_SIZE = 5;

// Response from the REST API
interface VersionEntry {
  editId: string;
  blockNumber: string;
  createdAt: string;
}

interface VersionsResponse {
  versions: VersionEntry[];
}

// Query to get proposals by edit IDs
const proposalsQuery = (editIds: string[]) => `query {
  proposals(
    filter: { id: { in: ${JSON.stringify(editIds)} } }
  ) {
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

interface ProposalsResult {
  proposals: ProposalNode[];
}

export async function fetchHistoryVersions(args: FetchVersionsArgs): Promise<HistoryVersion[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;
  const page = args.page ?? 0;
  const offset = page * PAGE_SIZE;

  // Phase 1: Get versions from REST API
  const versions = await fetchVersionsFromRest({
    entityId: args.entityId,
    limit: PAGE_SIZE,
    offset,
    signal: args.signal,
    endpoint,
    queryId,
  });

  if (versions.length === 0) {
    return [];
  }

  // Phase 2: Get proposal info for these edit IDs
  const editIds = versions.map(v => v.editId);
  const proposals = await fetchProposals({ editIds, signal: args.signal, endpoint, queryId });
  const proposalMap = new Map(proposals.map(p => [p.id, p]));

  // Phase 3: Build history items
  const historyItems = versions.map(version => {
    const proposal = proposalMap.get(version.editId);
    const createdAtTimestamp = proposal?.edit?.createdAt ?? Math.floor(new Date(version.createdAt).getTime() / 1000);

    return {
      id: version.editId,
      spaceId: proposal?.spaceId ?? '',
      proposalId: proposal?.id ?? version.editId,
      createdAt: createdAtTimestamp,
      createdById: proposal?.proposedBy ?? '',
      editName: proposal?.edit?.name ?? `Version ${version.editId.slice(-8)}`,
    };
  });

  // Phase 4: Fetch profiles for creators
  const creatorIds = historyItems.map(h => h.createdById).filter(id => id !== '');
  const uniqueCreatorIds = [...new Set(creatorIds)];

  let profilesBySpaceId = new Map<string, Profile>();

  if (uniqueCreatorIds.length > 0) {
    const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueCreatorIds));
    profilesBySpaceId = new Map(uniqueCreatorIds.map((id, i) => [id, profiles[i]]));
  }

  // Phase 5: Transform to HistoryVersion format
  return historyItems.map(item => {
    const profile = profilesBySpaceId.get(item.createdById);

    return {
      id: item.id,
      name: null,
      description: null,
      spaces: item.spaceId ? [item.spaceId] : [],
      types: [],
      relations: [],
      values: [],
      versionId: item.id,
      editName: item.editName,
      proposalId: item.proposalId,
      createdAt: item.createdAt,
      createdBy: profile ?? defaultProfile(item.createdById || item.id, item.createdById || item.id),
    };
  });
}

// Helper functions

interface FetchVersionsFromRestArgs {
  entityId: string;
  limit: number;
  offset: number;
  signal?: AbortSignal;
  endpoint: string;
  queryId: string;
}

async function fetchVersionsFromRest({
  entityId,
  limit,
  offset,
  signal,
  endpoint,
  queryId,
}: FetchVersionsFromRestArgs): Promise<VersionEntry[]> {
  // Convert GraphQL endpoint to REST base URL
  // e.g., https://testnet-api.geobrowser.io/graphql -> https://testnet-api.geobrowser.io
  const baseUrl = endpoint.replace(/\/graphql$/, '');
  const url = `${baseUrl}/versioned/entities/${entityId}/versions?limit=${limit}&offset=${offset}`;

  try {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      console.error(
        `Failed to fetch versions from REST API. queryId: ${queryId} entityId: ${entityId} status: ${response.status}`
      );
      return [];
    }

    const data: VersionsResponse = await response.json();
    return data.versions ?? [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error(`Error fetching versions from REST API. queryId: ${queryId} entityId: ${entityId}`, error);
    return [];
  }
}

interface FetchProposalsArgs {
  editIds: string[];
  signal?: AbortSignal;
  endpoint: string;
  queryId: string;
}

async function fetchProposals({ editIds, signal, endpoint, queryId }: FetchProposalsArgs): Promise<ProposalNode[]> {
  if (editIds.length === 0) {
    return [];
  }

  const query = proposalsQuery(editIds);

  const graphqlFetchEffect = graphql<ProposalsResult>({
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
            console.error(`Encountered runtime graphql error in fetchProposals. queryId: ${queryId}`, error.message);
            return [];
          default:
            console.error(`${error._tag}: Unable to fetch proposals, queryId: ${queryId}`);
            return [];
        }
      },
      onRight: result => result.proposals,
    });
  });

  return Effect.runPromise(withFallbacks);
}
