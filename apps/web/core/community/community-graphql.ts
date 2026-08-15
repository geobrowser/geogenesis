import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/subgraph/graphql';

/**
 * Shared plumbing for the community tab's aggregation queries.
 */
export const MAX_PAGES = 20;

export const ID_CHUNK_SIZE = 200;

export type Connection<TNode> = {
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  nodes: TNode[];
};

export function gqlId(id: string | null | undefined): string | null {
  if (!id) return null;
  const hex = ID.uuidToHex(id);
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

export function gqlIdList(ids: Iterable<string>): string {
  const quoted: string[] = [];
  for (const id of ids) {
    const hex = gqlId(id);
    if (hex) quoted.push(`"${hex}"`);
  }
  return quoted.join(', ');
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function afterArg(after: string | null): string {
  return after ? `, after: "${after}"` : '';
}

export class CommunityQueryError extends Error {
  readonly label: string;

  constructor(label: string, cause: unknown) {
    super(`community: "${label}" query failed`, { cause });
    this.name = 'CommunityQueryError';
    this.label = label;
  }
}

export async function runQuery<T>(label: string, query: string, signal?: AbortController['signal']): Promise<T> {
  const result = await Effect.runPromise(
    Effect.either(graphql<T>({ endpoint: Environment.getConfig().api, query, signal }))
  );

  if (Either.isLeft(result)) {
    console.error(`community: "${label}" query failed`, result.left);
    throw new CommunityQueryError(label, result.left);
  }

  return result.right;
}

export async function collectConnection<TNode>(
  label: string,
  buildQuery: (after: string | null) => string,
  selectConnection: (data: Record<string, Connection<TNode> | undefined>) => Connection<TNode> | undefined,
  signal?: AbortController['signal']
): Promise<TNode[]> {
  const nodes: TNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: Record<string, Connection<TNode> | undefined> = await runQuery<
      Record<string, Connection<TNode> | undefined>
    >(label, buildQuery(after), signal);
    const connection: Connection<TNode> | undefined = selectConnection(data);
    if (!connection) break;

    nodes.push(...connection.nodes);

    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return nodes;
}
