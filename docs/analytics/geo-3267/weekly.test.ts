// CLICKHOUSE_BINARY=/path/to/clickhouse bun run docs/analytics/geo-3267/weekly.test.ts
// Alternatively CHDB_PYTHON=/path/to/python-with-chdb uses the same ClickHouse SQL engine.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = '1'.repeat(32)
const profile = '2'.repeat(32)
const share = (n: number) => n.toString(16).padStart(32, '0')
const rows: string[] = []
const quote = (value: string) =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
function event(
  name: string,
  day: number,
  hour: number,
  visitor = '',
  session = '',
  account = '',
  props: Record<string, unknown> = {}
) {
  rows.push(
    `(${quote(`2026-10-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:00:00`)}, ${quote(name)}, ${quote(visitor)}, ${quote(session)}, ${quote(account)}, ${quote(JSON.stringify(props))})`
  )
}
function handoff(n: number, day = 12, visitor = `sender-${n}`, extra = {}) {
  event('share_link_handoff', day, 8, visitor, `sender-session-${n}`, '', {
    share_id: share(n),
    share_content_type: 'debate',
    share_content_id: target,
    method: 'x',
    handoff_kind: 'composer_requested',
    sharer_profile_space_id: profile,
    sharer_role: 'debater',
    ...extra,
  })
}
function landing(
  n: number,
  day: number,
  hour: number,
  visitor: string,
  session: string,
  method = 'x',
  extra = {}
) {
  const url = `https://geobrowser.io/explore?utm_source=${method}&utm_medium=share&utm_campaign=geo_share&utm_content=v1%3Adebate%3A${target}%3A${share(n)}`
  event('page_viewed', day, hour, visitor, session, '', {
    landing_page_url: url,
    ...extra,
  })
}
handoff(1, 11)
handoff(1, 12) // Retried delivery must not move this old handoff into this week's denominator.
landing(1, 12, 9, 'visitor-a', 'session-a')
landing(1, 12, 10, 'visitor-a', 'session-a') // Repeated page view: one acquired session.
event('auth_attempt_started', 12, 10, 'visitor-a', 'session-a', '', {
  auth_attempt_id: 'attempt-a',
  action_anonymous_id: 'visitor-a',
  action_session_id: 'session-a',
})
// Completion in another tab/campaign still credits the original attempt's share.
event(
  'auth_identity_linked',
  12,
  11,
  'different-tab',
  'different-session',
  'account-a',
  {
    auth_attempt_id: 'attempt-a',
    action_anonymous_id: 'visitor-a',
    action_session_id: 'session-a',
  }
)
event('signed_up', 12, 11, 'different-tab', 'different-session', 'account-a', {
  auth_attempt_id: 'attempt-a',
  utm_source: 'reddit',
  signup_context_source: 'completion',
  signup_anonymous_id: 'different-tab',
  signup_session_id: 'different-session',
})
event('signed_up', 13, 11, 'different-tab', 'different-session', 'account-a', {
  auth_attempt_id: 'attempt-a',
})
handoff(2)
landing(2, 12, 12, 'visitor-a', 'session-second-share')
event(
  'signed_in',
  12,
  13,
  'visitor-a',
  'session-second-share',
  'existing-account'
)
landing(3, 12, 9, 'visitor-b', 'session-b', 'reddit') // Missing outbound event must survive LEFT JOIN.
event('signed_up', 12, 10, 'new-tab-b', 'completion-b', 'account-b', {
  signup_context_source: 'auth_start',
  signup_anonymous_id: 'visitor-b',
  signup_session_id: 'session-b',
})
handoff(4, 12, 'self')
landing(4, 12, 10, 'self', 'self-session')
handoff(5, 12, 'sender-test', { is_test: true })
landing(5, 12, 10, 'visitor-test-link', 'session-test-link')
landing(6, 12, 10, 'test-visitor', 'session-test', 'x', { is_automated: true })
landing(6, 12, 10, 'labeled-visitor', 'session-labeled')
event(
  'page_viewed',
  12,
  11,
  'labeled-visitor',
  'session-labeled',
  'team-account'
)
// Identification may arrive after the anonymous page view, without another page view.
landing(2, 12, 10, 'restored-team', 'restored-team-session')
event(
  'session_restored',
  12,
  11,
  'restored-team',
  'restored-team-session',
  'team-account'
)
// A team sender's earlier anonymous share must not become "unmatched" acquisition.
handoff(10, 12, 'late-team-sender')
event(
  'signed_in',
  12,
  9,
  'late-team-sender',
  'sender-session-10',
  'team-account'
)
landing(10, 12, 10, 'outside-recipient', 'outside-recipient-session')
// Account completion in a different tab still excludes its initiating team session.
landing(2, 12, 10, 'team-auth-start', 'team-auth-session')
event(
  'auth_attempt_started',
  12,
  11,
  'team-auth-start',
  'team-auth-session',
  '',
  {
    auth_attempt_id: 'team-attempt',
    action_anonymous_id: 'team-auth-start',
    action_session_id: 'team-auth-session',
  }
)
event(
  'auth_identity_linked',
  12,
  12,
  'team-new-tab',
  'team-new-session',
  'team-account',
  {
    auth_attempt_id: 'team-attempt',
    action_anonymous_id: 'team-auth-start',
    action_session_id: 'team-auth-session',
  }
)
handoff(7)
landing(7, 12, 10, 'ambiguous', 'ambiguous-session')
event('auth_attempt_started', 12, 11, 'ambiguous', 'ambiguous-session', '', {
  auth_attempt_id: 'ambiguous-attempt',
  action_anonymous_id: 'ambiguous',
  action_session_id: 'ambiguous-session',
})
event(
  'auth_identity_linked',
  12,
  11,
  'other',
  'other-session',
  'ambiguous-account',
  {
    auth_attempt_id: 'ambiguous-attempt',
    action_anonymous_id: 'other',
    action_session_id: 'other-session',
  }
)
event(
  'signed_up',
  12,
  12,
  'ambiguous',
  'ambiguous-session',
  'ambiguous-account',
  {
    auth_attempt_id: 'ambiguous-attempt',
    signup_context_source: 'auth_start',
    signup_anonymous_id: 'ambiguous',
    signup_session_id: 'ambiguous-session',
  }
)
event('page_viewed', 13, 10, 'visitor-a', 'direct-session', '', {
  landing_page_url: 'https://geobrowser.io/explore',
})
event('signed_up', 13, 11, 'visitor-a', 'direct-session', 'direct-account', {
  signup_context_source: 'auth_start',
  signup_anonymous_id: 'visitor-a',
  signup_session_id: 'direct-session',
})
landing(8, 12, 10, 'malformed', 'malformed-session', 'invented-channel')
landing(9, 11, 23, 'prior-week', 'prior-week-session', 'reddit')
event('auth_attempt_started', 11, 23, 'prior-week', 'prior-week-session', '', {
  auth_attempt_id: 'prior-week-attempt',
  action_anonymous_id: 'prior-week',
  action_session_id: 'prior-week-session',
})
event(
  'signed_up',
  12,
  1,
  'prior-week',
  'prior-week-session',
  'prior-week-account',
  { auth_attempt_id: 'prior-week-attempt' }
)

// Identity evidence after the report boundary must still clean historical metrics.
for (const lifecycle of ['signed_in', 'session_restored'] as const) {
  const visitor = `boundary-${lifecycle}`
  const session = `${visitor}-session`
  landing(2, 18, 23, visitor, session)
  event(lifecycle, 19, 1, visitor, session, 'team-account')
}
landing(2, 18, 23, 'boundary-auth-start', 'boundary-auth-session')
event(
  'auth_attempt_started',
  18,
  23,
  'boundary-auth-start',
  'boundary-auth-session',
  '',
  {
    auth_attempt_id: 'boundary-team-attempt',
    action_anonymous_id: 'boundary-auth-start',
    action_session_id: 'boundary-auth-session',
  }
)
event(
  'auth_identity_linked',
  19,
  1,
  'boundary-new-tab',
  'boundary-new-session',
  'team-account',
  {
    auth_attempt_id: 'boundary-team-attempt',
    action_anonymous_id: 'boundary-auth-start',
    action_session_id: 'boundary-auth-session',
  }
)
handoff(11, 18, 'boundary-team-sender', { method: 'linkedin' })
event(
  'signed_in',
  19,
  1,
  'boundary-team-sender',
  'sender-session-11',
  'team-account'
)
landing(
  11,
  18,
  23,
  'boundary-outside-recipient',
  'boundary-outside-session',
  'linkedin'
)
// Reading later evidence must not add later handoffs, visits or conversions to the week.
handoff(12, 19, 'future-sender', { method: 'linkedin' })
landing(12, 19, 10, 'future-visitor', 'future-session', 'linkedin')
event(
  'signed_up',
  19,
  11,
  'future-visitor',
  'future-session',
  'future-account',
  {
    signup_context_source: 'auth_start',
    signup_anonymous_id: 'future-visitor',
    signup_session_id: 'future-session',
  }
)

const report = readFileSync(new URL('./weekly.sql', import.meta.url), 'utf8')
  .replaceAll('{start_date:Date}', "toDate('2026-10-12')")
  .replaceAll('{end_date:Date}', "toDate('2026-10-19')")
  .trim()
  .replace(/;$/, '')
const sql = `
CREATE DATABASE analytics;
CREATE TABLE analytics.privy_account_labels (privy_user_id Nullable(String), user_id Nullable(String), active Bool, exclude_from_metrics Bool) ENGINE = Memory;
INSERT INTO analytics.privy_account_labels VALUES ('team-account', NULL, true, true);
CREATE TABLE analytics.events_canonical (event_time DateTime('UTC'), event_name String, anonymous_id Nullable(String), session_id Nullable(String), privy_user_id Nullable(String), properties_json String, user_id Nullable(String) DEFAULT NULL, app String DEFAULT 'genesis', environment String DEFAULT 'production') ENGINE = Memory;
INSERT INTO analytics.events_canonical (event_time, event_name, anonymous_id, session_id, privy_user_id, properties_json) VALUES ${rows.join(',')};
${report} FORMAT JSONEachRow;
`
const directory = mkdtempSync(join(tmpdir(), 'geo-3267-weekly-'))
try {
  const result = process.env.CHDB_PYTHON
    ? spawnSync(
        process.env.CHDB_PYTHON,
        [
          '-c',
          "import chdb, sys; print(chdb.query(sys.stdin.read(), 'JSONEachRow'))",
        ],
        { input: sql, encoding: 'utf8', cwd: directory }
      )
    : spawnSync(
        process.env.CLICKHOUSE_BINARY ?? 'clickhouse',
        ['local', '--path', directory, '--multiquery', '--query', sql],
        { encoding: 'utf8' }
      )
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  const output = result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const channel = (name: string) =>
    output.find((row) => row.channel === name && row.breakdown === 'channel')
  assert.equal(Number(channel('x')?.visits), 3, JSON.stringify(output))
  assert.equal(Number(channel('x')?.visitors), 2)
  assert.equal(Number(channel('x')?.new_accounts), 1)
  assert.equal(Number(channel('x')?.link_handoffs), 3)
  assert.equal(Number(channel('x')?.matched_visits), 3)
  assert.equal(Number(channel('x')?.unmatched_visits), 0)
  assert.equal(Number(channel('reddit')?.visits), 1)
  assert.equal(Number(channel('reddit')?.new_accounts), 2)
  assert.equal(Number(channel('reddit')?.unmatched_visits), 1)
  assert.equal(Number(channel('reddit')?.link_handoffs), 0)
  assert.equal(output.filter((row) => row.breakdown === 'channel').length, 2)
  assert.ok(
    output.some(
      (row) =>
        row.breakdown === 'sharer' &&
        row.sharer_profile_space_id === profile &&
        row.sharer_role === 'debater'
    )
  )
  assert.ok(
    output.some(
      (row) =>
        row.channel === 'reddit' &&
        row.breakdown === 'sharer' &&
        row.sharer_role === 'unknown'
    )
  )
  console.log(
    'Passed weekly acquisition SQL: duplicate delivery, repeated visits, unique visitors, auth recovery/campaign changes, prior-week arrivals, unmatched shares, self/team/test exclusions, direct returns, and ambiguous auth joins.'
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
