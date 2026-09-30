/** Run from apps/web: bun scripts/sync-debate-warehouse.ts [--dry-run | --init-schema] */
import { readFile } from 'node:fs/promises';

import { clickhouseClient, syncDebateWarehouse } from './lib/debate-warehouse-sync';

const flags = process.argv.slice(2);
if (flags.some(flag => !['--dry-run', '--init-schema'].includes(flag)) || flags.length > 1) {
  throw new Error('Use --dry-run, --init-schema, or no flags to sync');
}
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const sources = {
  graphUrl: process.env.DEBATE_WAREHOUSE_GRAPH_URL || 'https://api-testnet.geobrowser.io/graphql',
  chatUrl: process.env.DEBATE_WAREHOUSE_CHAT_URL || 'https://chat-api-testnet.geobrowser.io',
};
if (flags.includes('--dry-run')) {
  console.log(JSON.stringify(await syncDebateWarehouse(sources, async () => {})));
} else {
  const client = clickhouseClient({
    url: required('CLICKHOUSE_URL'),
    username: required('CLICKHOUSE_UN'),
    password: required('CLICKHOUSE_PW'),
  });
  if (flags.includes('--init-schema')) {
    const schema = await readFile(new URL('../../../docs/analytics/geo-3097/schema.sql', import.meta.url), 'utf8');
    for (const statement of schema
      .split(';')
      .map(s => s.trim())
      .filter(Boolean))
      await client.execute(statement);
    console.log('Debate warehouse schema initialized');
  } else console.log(JSON.stringify(await syncDebateWarehouse(sources, client.write)));
}
