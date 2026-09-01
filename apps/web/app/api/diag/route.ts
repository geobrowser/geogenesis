import { NextResponse } from 'next/server';

import { Environment } from '~/core/environment';

/**
 * EXPERIMENT ONLY — GEO-2777. Do not merge.
 *
 * Times the real endpoint the app uses (Environment.getConfig().api), not the raw
 * NEXT_PUBLIC_API_ENDPOINT — those differ: the env var points at api.geobrowser.io,
 * which is NXDOMAIN, while the app resolves to the testnet endpoint by chain id.
 */
export const dynamic = 'force-dynamic';

async function timed(label: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await fn();
    return { label, ms: Date.now() - started, ok: true };
  } catch (e) {
    return { label, ms: Date.now() - started, ok: false, error: String(e).slice(0, 160) };
  }
}

export async function GET() {
  const api = Environment.getConfig().api;
  const q = () =>
    fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      cache: 'no-store',
    }).then(r => r.text());

  const results = [];
  results.push(await timed('1. app api, first outbound', q));
  results.push(await timed('2. app api, again', q));
  results.push(await timed('3. unrelated host', () => fetch('https://example.com', { cache: 'no-store' }).then(r => r.text())));
  results.push(await timed('4. app api, third', q));

  return NextResponse.json(
    { resolvedApi: api, envVar: process.env.NEXT_PUBLIC_API_ENDPOINT ?? null, chainId: process.env.NEXT_PUBLIC_CHAIN_ID ?? null, results },
    { headers: { 'cache-control': 'no-store' } }
  );
}
