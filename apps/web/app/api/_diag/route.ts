import { NextResponse } from 'next/server';

/**
 * EXPERIMENT ONLY — GEO-2777. Do not merge.
 *
 * Every variant of the explore feed costs ~11-13s on a cold instance and ~0.35s warm,
 * regardless of how many queries it makes — and the one variant that makes no outbound
 * request at all is fast cold. So the suspect is the first outbound request itself.
 *
 * This times, in order: a trivial GraphQL POST to the Geo API, a second one to the same
 * host (connection now established), and one to an unrelated host. That separates
 * "the first outbound request from a cold instance is slow" from "this particular host
 * is slow to accept new connections".
 */
export const dynamic = 'force-dynamic';

const API = process.env.NEXT_PUBLIC_API_ENDPOINT ?? 'https://api-testnet.geobrowser.io/graphql';

async function timed(label: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await fn();
    return { label, ms: Date.now() - started, ok: true };
  } catch (e) {
    return { label, ms: Date.now() - started, ok: false, error: String(e).slice(0, 200) };
  }
}

const trivialQuery = () =>
  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
    cache: 'no-store',
  }).then(r => r.text());

export async function GET() {
  const results = [];
  // Order matters: the first entry pays whatever one-time cost a cold instance has.
  results.push(await timed('1. geo-api __typename (first outbound request)', trivialQuery));
  results.push(await timed('2. geo-api __typename (same host, again)', trivialQuery));
  results.push(await timed('3. unrelated host (example.com)', () =>
    fetch('https://example.com', { cache: 'no-store' }).then(r => r.text())
  ));
  results.push(await timed('4. geo-api __typename (third time)', trivialQuery));

  return NextResponse.json({ api: API, results }, { headers: { 'cache-control': 'no-store' } });
}
