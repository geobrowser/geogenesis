import { randomUUID } from 'node:crypto';

import { type PublishedDebate, type WarehouseSources, discoverDebates, readDebate } from './debate-warehouse-source';

export type WarehouseWriter = (table: string, rows: Record<string, unknown>[]) => Promise<void>;

/** A generation is visible only after every source read and synchronous insert succeeds. */
export async function syncDebateWarehouse(
  sources: WarehouseSources,
  write: WarehouseWriter,
  dependencies = { discover: discoverDebates, read: readDebate }
) {
  const generation = randomUUID();
  const debates: PublishedDebate[] = await dependencies.discover(sources);
  let turnCount = 0;
  let claimCount = 0;
  let unknownClaimCount = 0;
  let missingTimelineCount = 0;
  for (const published of debates) {
    const result = await dependencies.read(sources, published);
    const stamp = (rows: Record<string, unknown>[]) => rows.map(row => ({ generation, ...row }));
    if (result.turns.length) await write('debate_timing_turns', stamp(result.turns));
    if (result.claims.length) await write('debate_timing_claims', stamp(result.claims));
    await write('debate_timing_debates', stamp([result.debate]));
    turnCount += result.turns.length;
    claimCount += result.claims.length;
    unknownClaimCount += result.debate.unknown_claim_count;
    missingTimelineCount += Number(result.debate.status !== 'ready');
  }
  // Protect against a service returning a successful but unusable corpus.
  if (turnCount === 0) throw new Error('No debate timelines recovered; previous generation remains current');
  await write('debate_timing_generations', [
    {
      generation,
      published_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
      debate_count: debates.length,
      turn_count: turnCount,
      claim_count: claimCount,
    },
  ]);
  return {
    generation,
    debates: debates.length,
    turns: turnCount,
    claims: claimCount,
    unknownClaimCount,
    missingTimelineCount,
  };
}

export function clickhouseClient(config: { url: string; username: string; password: string; fetch?: typeof fetch }) {
  const execute = async (query: string, data = '') => {
    const url = new URL(config.url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('ClickHouse requires HTTPS');
    url.searchParams.set('query', query);
    url.searchParams.set('wait_end_of_query', '1');
    url.searchParams.set('async_insert', '0');
    const response = await (config.fetch ?? fetch)(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}` },
      body: data,
    });
    const body = await response.text();
    if (!response.ok || /^Code: \d+/m.test(body))
      throw new Error(`ClickHouse request failed (HTTP ${response.status})`);
    return body;
  };
  const write: WarehouseWriter = async (table, rows) => {
    if (
      !['debate_timing_turns', 'debate_timing_claims', 'debate_timing_debates', 'debate_timing_generations'].includes(
        table
      )
    ) {
      throw new Error('Unexpected warehouse table');
    }
    for (let i = 0; i < rows.length; i += 1000) {
      await execute(
        `INSERT INTO analytics.${table} FORMAT JSONEachRow`,
        rows
          .slice(i, i + 1000)
          .map(row => JSON.stringify(row))
          .join('\n')
      );
    }
  };
  return { execute, write };
}
