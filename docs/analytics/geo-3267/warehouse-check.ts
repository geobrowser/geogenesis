// Read-only production acceptance: bun --env-file=/path/to/existing.env run docs/analytics/geo-3267/warehouse-check.ts 2026-10-12 2026-10-19
import { readFileSync } from 'node:fs'

const [start, end] = process.argv.slice(2)
if (
  ![start, end].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) ||
  start >= end
) {
  throw new Error(
    'Provide inclusive start and exclusive end dates: YYYY-MM-DD YYYY-MM-DD'
  )
}
const endpoint = process.env.CLICKHOUSE_URL
if (!endpoint)
  throw new Error(
    'CLICKHOUSE_URL is required; use the existing warehouse connection, not a fixture endpoint'
  )
const url = new URL(endpoint)
if (url.username || url.password)
  throw new Error(
    'Supply credentials via CLICKHOUSE_UN/CLICKHOUSE_PW, not the URL'
  )
if (
  url.protocol !== 'https:' &&
  !['127.0.0.1', 'localhost'].includes(url.hostname)
) {
  throw new Error('Remote warehouse connections require HTTPS')
}
// readonly=2 permits SELECT settings (the report uses join_use_nulls) and forbids writes.
for (const [key, value] of Object.entries({
  readonly: '2',
  max_execution_time: '60',
  max_threads: '2',
  max_memory_usage: '2147483648',
  max_bytes_before_external_group_by: '134217728',
  max_result_rows: '10000',
  result_overflow_mode: 'throw',
  wait_end_of_query: '1',
  param_start_date: start,
  param_end_date: end,
}))
  url.searchParams.set(key, value)

async function query(sql: string) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'text/plain',
      'x-clickhouse-user': process.env.CLICKHOUSE_UN ?? 'default',
      'x-clickhouse-key': process.env.CLICKHOUSE_PW ?? '',
    },
    body: sql,
    signal: AbortSignal.timeout(75000),
  })
  const body = await response.text()
  if (!response.ok)
    throw new Error(`Warehouse query failed (HTTP ${response.status}): ${body}`)
  return body
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

const freshness =
  await query(`SELECT now('UTC') AS checked_at, version() AS clickhouse_version, max(published_at) AS published_at
  FROM analytics.input_generations FORMAT JSONEachRow`)
const schema = await query(`SELECT table, name, type FROM system.columns
  WHERE database = 'analytics' AND (
    (table = 'events_canonical' AND name IN ('event_time','event_name','app','environment','anonymous_id','session_id','privy_user_id','user_id','properties_json'))
    OR (table = 'privy_account_labels' AND name IN ('source_account_id','label_id','privy_user_id','user_id','active','exclude_from_metrics','updated_at')))
  ORDER BY table, name FORMAT JSONEachRow`)
const tables = await query(`SELECT name, engine FROM system.tables
  WHERE database = 'analytics' AND name IN ('events_canonical','privy_account_labels') FORMAT JSONEachRow`)
const sql = readFileSync(new URL('./weekly.sql', import.meta.url), 'utf8')
  .trim()
  .replace(/;$/, '')
const reportStarted = performance.now()
const rows = await query(`${sql} FORMAT JSONEachRow`)
const report_elapsed_ms = Math.round(performance.now() - reportStarted)
console.log(
  JSON.stringify(
    {
      start_date: start,
      end_date: end,
      freshness,
      tables,
      schema,
      report_elapsed_ms,
      rows,
    },
    null,
    2
  )
)
