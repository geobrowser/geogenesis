import { GraphQLClient } from 'graphql-request';

import { normalizeSpaceId } from '~/core/access/space-access';
import { getConfig } from '~/core/environment/environment';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';

// `memberSpaceId` is a UUID column, so the variable must be typed `UUID!` or the request fails
// schema validation before it executes. This query is hand-written, so codegen can't catch that.
//
// A cursor connection rather than `editors(first: …)`: the sweep finds its work here, so a capped
// read would leave every space past the cap unswept, with nothing to say so.
const EDITOR_SPACES_QUERY = `
  query DebateAcceptorEditorSpaces($memberSpaceId: UUID!, $first: Int!, $after: Cursor) {
    editorsConnection(filter: { memberSpaceId: { is: $memberSpaceId } }, first: $first, after: $after) {
      nodes {
        spaceId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const EDITOR_SPACES_PAGE_SIZE = 500;

type EditorSpacesPage = {
  editorsConnection: {
    nodes: Array<{ spaceId: string }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

/**
 * Retries for this query, and why it needs its own.
 *
 * Every other GraphQL read in the app goes through `core/io/graphql-client`, which already retries
 * 408/429/5xx on an exponential jittered schedule. This one does not: it is a hand-written query on
 * a raw `GraphQLClient`, so it inherited none of that and a single upstream blip became a hard
 * failure. Observed in production — the API returned
 *
 *   GraphQL Error (Code: 503): upstream connect error or disconnect/reset before headers.
 *   reset reason: connection termination
 *
 * from envoy, on one request. The caller treats a failure as "unknown", which deliberately means
 * "do not filter" — so that one 503 silently widened the claims corpus to every space the viewer
 * can see, instead of the six the acceptor edits.
 *
 * Three attempts over ~450ms is sized for that failure mode: a connection reset is either gone on
 * the next attempt or it is a real outage, and this sits in a request path so it cannot wait long.
 */
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 150;

/** A 503 from a load balancer is transient; a 400 from a malformed query is not worth retrying. */
export function isTransientEditorSpacesError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  // No status at all is a transport failure (DNS, reset, timeout) rather than a rejected query.
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}

export function editorSpacesRetryDelayMs(attempt: number): number {
  return BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Every space the given member space is an editor of, straight from the knowledge graph. This is
 * how the publish sweep finds its work: the acceptor publishes only into spaces it can edit, so
 * enumerating its editor spaces is the whole candidate set — no manual allowlist to maintain.
 *
 * Throws once retries are exhausted, or when the cursor chain breaks (see `collectCursorPages`): a
 * partial list is never returned as though it were the whole set. Callers decide what an
 * unanswerable question means; see the route for why it must not mean "nothing is publishable".
 */
export async function listEditorSpaceIds(memberSpaceId: string): Promise<string[]> {
  const client = new GraphQLClient(getConfig().api);
  const member = normalizeSpaceId(memberSpaceId);

  // Retried per page, so a blip on page three does not restart the walk.
  const fetchPage = async (after: string | undefined): Promise<CursorPage<string>> => {
    const variables = { memberSpaceId: member, first: EDITOR_SPACES_PAGE_SIZE, after: after ?? null };
    const { editorsConnection } = await requestWithRetry(() =>
      client.request<EditorSpacesPage>(EDITOR_SPACES_QUERY, variables)
    );
    return {
      items: editorsConnection.nodes.map(editor => editor.spaceId),
      endCursor: editorsConnection.pageInfo.endCursor,
      hasNextPage: editorsConnection.pageInfo.hasNextPage,
    };
  };

  return [...new Set(await collectCursorPages(fetchPage))];
}

async function requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isTransientEditorSpacesError(error) || attempt === MAX_ATTEMPTS - 1) throw error;
      await sleep(editorSpacesRetryDelayMs(attempt));
    }
  }

  throw lastError;
}
