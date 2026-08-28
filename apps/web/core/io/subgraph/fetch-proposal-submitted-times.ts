import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';
import { isValidUUID } from '~/core/io/rest';

import { graphql } from './graphql';

/**
 * When each proposal was submitted, keyed by proposal id.
 *
 * The REST proposal endpoints only carry voting timing (`startTime`/`endTime`), and the
 * v2 contracts leave both at 0 until the first vote fires — so a proposal that is open
 * but unvoted has no timestamp at all to show. `createdAt` on the indexed proposal is
 * the submission time, and it is only available over GraphQL, hence this side lookup.
 */

type ProposalsResult = {
  proposals: { id: string; createdAt: string | null }[] | null;
};

/** Proposal ids come back from REST hyphenated and from GraphQL bare; compare on one form. */
function normalizeProposalId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/** The API rejects very large `in` filters, so ask in batches. */
const CHUNK_SIZE = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchChunk(ids: string[]): Promise<[string, number][]> {
  const idList = ids.map(id => `"${id}"`).join(', ');
  const query = `query {
    proposals(filter: { id: { in: [${idList}] } }, first: ${ids.length}) {
      id
      createdAt
    }
  }`;

  const result = await Effect.runPromise(
    Effect.either(graphql<ProposalsResult>({ endpoint: Environment.getConfig().api, query }))
  );

  if (Either.isLeft(result)) {
    // A missing timestamp hides one line of metadata; it should never take the
    // proposals list down with it.
    console.error('[governance] failed to fetch proposal submitted times:', result.left);
    return [];
  }

  return (result.right.proposals ?? []).flatMap(p => {
    const seconds = Number(p.createdAt);
    if (!p.createdAt || !Number.isFinite(seconds) || seconds <= 0) return [];
    return [[normalizeProposalId(p.id), seconds] as [string, number]];
  });
}

export async function fetchProposalSubmittedTimes(proposalIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(proposalIds.filter(isValidUUID).map(normalizeProposalId))];
  if (ids.length === 0) return new Map();

  const batches = await Promise.all(chunk(ids, CHUNK_SIZE).map(fetchChunk));
  return new Map(batches.flat());
}

/** Look a proposal up in a map from `fetchProposalSubmittedTimes`, id form agnostic. */
export function getSubmittedTime(times: Map<string, number>, proposalId: string): number {
  return times.get(normalizeProposalId(proposalId)) ?? 0;
}
