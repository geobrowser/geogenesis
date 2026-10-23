// Run with: CLICKHOUSE_BINARY=/path/to/clickhouse bun run docs/analytics/geo-3071/funnel.test.ts
// Executes the shipped report unchanged against synthetic events in an isolated local engine.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scenarios = [
  { name: 'signup_without_terminal', lifecycle: 'signed_up', unresolved: 0 },
  { name: 'login_without_terminal', lifecycle: 'signed_in', unresolved: 0 },
  { name: 'old_open_attempt', unresolved: 1 },
  { name: 'recent_open_attempt', recent: true, unresolved: 0 },
  { name: 'explicit_close', outcome: 'closed', unresolved: 0 },
  { name: 'superseded', outcome: 'superseded', unresolved: 0 },
  { name: 'account_created_then_left', outcome: 'left_after_sign_up', unresolved: 0 },
  { name: 'login_then_left', outcome: 'left_after_sign_in', unresolved: 0 },
  { name: 'terminal_signup_only', outcome: 'signed_up', unresolved: 0 },
  { name: 'terminal_login_only', outcome: 'signed_in', unresolved: 0 },
  {
    name: 'complete_signup',
    lifecycle: 'signed_up',
    outcome: 'signed_up',
    unresolved: 0,
  },
]
const quote = (value: string) =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const rows = scenarios.flatMap((scenario) => {
  const names = ['auth_attempt_started', 'auth_prompt_viewed']
  if (scenario.lifecycle) names.push(scenario.lifecycle)
  if (scenario.outcome) names.push('auth_attempt_completed')
  return names.map((event, index) => {
    const properties = {
      auth_attempt_id: scenario.name,
      component: 'navbar',
      auth_control: scenario.name,
      ...(event === 'auth_attempt_completed'
        ? { outcome: scenario.outcome, auth_duration_ms: 250 }
        : {}),
    }
    return `('genesis', 'production', now() - INTERVAL ${scenario.recent ? 1 : 48} HOUR + INTERVAL ${index} SECOND,
      ${quote(event)}, ${quote(`user-${scenario.name}`)}, NULL, ${quote(JSON.stringify(properties))})`
  })
})
const report = readFileSync(new URL('./funnel.sql', import.meta.url), 'utf8')
  .trim()
  .replace(/;$/, '')
const sql = `
CREATE DATABASE analytics;
CREATE TABLE analytics.privy_account_labels (
  privy_user_id Nullable(String), user_id Nullable(String), active Bool, exclude_from_metrics Bool
) ENGINE = Memory;
CREATE TABLE analytics.events_canonical (
  app String, environment String, event_time DateTime, event_name String,
  privy_user_id Nullable(String), user_id Nullable(String), properties_json String
) ENGINE = Memory;
INSERT INTO analytics.events_canonical VALUES ${rows.join(',')};
${report} FORMAT JSONEachRow;
`
const directory = mkdtempSync(join(tmpdir(), 'geo-3071-funnel-'))
try {
  const result = spawnSync(
    process.env.CLICKHOUSE_BINARY ?? 'clickhouse',
    ['local', '--path', directory, '--multiquery', '--query', sql],
    { encoding: 'utf8' }
  )
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  const output = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(output.length, scenarios.length)
  const failures: string[] = []
  for (const scenario of scenarios) {
    const row = output.find((row) => row.control === scenario.name)
    try {
      assert.ok(row, `Missing ${scenario.name}`)
      assert.equal(Number(row.attempts), 1)
      assert.equal(Number(row.prompts), 1)
      assert.equal(
        Number(row.new_accounts),
        scenario.lifecycle === 'signed_up' ? 1 : 0
      )
      assert.equal(
        Number(row.logins),
        scenario.lifecycle === 'signed_in' ? 1 : 0
      )
      assert.equal(
        Number(row.closed),
        ['closed', 'superseded'].includes(scenario.outcome ?? '') ? 1 : 0
      )
      assert.equal(
        Number(row.accounts_created_then_left),
        scenario.outcome === 'left_after_sign_up' ? 1 : 0
      )
      assert.equal(
        Number(row.logins_then_left),
        scenario.outcome === 'left_after_sign_in' ? 1 : 0
      )
      assert.equal(Number(row.unresolved_after_24h), scenario.unresolved)
      assert.equal(
        row.mean_observed_auth_duration_ms,
        scenario.outcome ? 250 : null
      )
    } catch (error) {
      failures.push(`${scenario.name}: ${String(error)}`)
    }
  }
  assert.equal(failures.length, 0, failures.join('\n'))
  console.log(
    `Passed ${scenarios.length} auth funnel scenarios using the shipped SQL.`
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
