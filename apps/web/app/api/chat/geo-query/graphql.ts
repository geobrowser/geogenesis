import { getConfig } from '~/core/environment/environment';

// The skill's canonical client hardcodes the testnet endpoint. We must not: the
// app resolves mainnet vs testnet from chain id, and answering about testnet
// while the user reads mainnet is a silent wrong-scope bug — worse than failing
// outright, because the answer looks right.
export function geoGraphqlEndpoint(): string {
  return getConfig().api;
}

// One query's wall-clock budget. The skill measures an unscoped relation filter
// at 26s against 0.3s scoped, so a badly-shaped query is slow rather than
// broken — it has to be cut off rather than waited on.
export const SINGLE_QUERY_TIMEOUT_MS = 15_000;

export type GraphqlResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * POST one GraphQL query.
 *
 * Never swallows an error into empty `data`. The skill calls that out as "the
 * classic false-'entity not found' bug" — a schema error returning `{data:
 * null}` reads to the model as "no such entity", and it reports that to the
 * user as fact. Errors come back as text so the sub-agent can read them and fix
 * its own query, which is the whole point of giving it a loop.
 */
export async function runGeoGraphql(
  query: string,
  variables: Record<string, unknown> | undefined,
  signal?: AbortSignal,
  timeoutMs: number = SINGLE_QUERY_TIMEOUT_MS
): Promise<GraphqlResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const composite = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(geoGraphqlEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variables ? { query, variables } : { query }),
      signal: composite,
    });
  } catch (err) {
    if (timeout.aborted) {
      return { ok: false, error: `Query timed out after ${Math.round(timeoutMs / 1000)}s. Scope it harder.` };
    }
    return { ok: false, error: `Network error: ${err instanceof Error ? err.message : 'unknown'}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 500)}` };
  }

  let payload: { data?: unknown; errors?: unknown };
  try {
    payload = (await res.json()) as { data?: unknown; errors?: unknown };
  } catch {
    return { ok: false, error: 'Response was not JSON.' };
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const text = payload.errors
      .map(e => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)))
      .join('; ');
    return { ok: false, error: `GraphQL error: ${text.slice(0, 1_000)}` };
  }

  if (payload.data === undefined || payload.data === null) {
    return { ok: false, error: 'Response contained no data and no errors.' };
  }

  return { ok: true, data: payload.data };
}
