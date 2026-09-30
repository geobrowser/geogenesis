"""Run the actual GEO-3095 report against synthetic data on a ClickHouse HTTP endpoint.

No production tables, credentials or user data are used.
Example: python3 scripts/analytics/test-signup-journeys.py --url https://play.clickhouse.com/
"""
import argparse
import json
import pathlib
import urllib.parse
import urllib.request


def literal(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[2]
    report = (root / 'docs/analytics/geo-3095/signup-journeys.sql').read_text()
    report = report.replace('analytics.privy_signups', 'fixture_signups')
    report = report.replace('analytics.events_canonical', 'fixture_events')
    report = report.replace('{signup_day:Date}', "toDate('2026-09-29')")
    report = report.replace('{source_account_id:String}', "'fixture-source'")
    events = []

    def event(id, name, when='2026-09-29 12:01:00', account='', visitor='', session='session', props=None, page=''):
        events.append((id, when, name, visitor, session, account, account, page, json.dumps(props or {})))

    def link(account, source='auth_start', visitor=None, name='signed_up'):
        event(account + source, name, when='2026-09-30 00:00:01' if account == 'restored' else '2026-09-29 12:01:00',
              account=account, props={
            'signup_anonymous_id': visitor or account + '-visitor',
            'signup_session_id': account + '-session', 'signup_context_source': source,
        })

    link('history')
    link('history', 'completion', 'wrong-visitor')  # Must prefer the initiating snapshot.
    link('instant')
    link('restored', name='session_restored')
    event('missing-fields', 'signed_up', account='missing-fields')
    event('page1', 'page_viewed', '2026-09-28 09:00:00', visitor='history-visitor', page='/explore')
    events.append(events[-1])  # Replayed event, counted once.
    event('page2', 'page_viewed', '2026-09-29 11:59:00', visitor='history-visitor', page='/debate')
    event('watch', 'debate_playback_interval', '2026-09-29 11:59:30', visitor='history-visitor',
          props={'debate_id': 'fixture-debate', 'active_ms': 10000})
    event('after', 'page_viewed', '2026-09-29 12:00:01', visitor='history-visitor', page='/too-late')
    event('signed-in', 'page_viewed', '2026-09-29 11:00:00', account='old-account', visitor='history-visitor', page='/signed-in')
    event('restored-page', 'page_viewed', '2026-09-29 11:00:00', visitor='restored-visitor', page='/claim')
    event('outside-lookback', 'page_viewed', '2026-07-01 11:00:00', visitor='instant-visitor', page='/old')
    # Source creation times differ within the same day. The scan's midnight bound
    # is deliberately broader than each account's exact history window.
    for account, boundary in [('history', '12:00:00'), ('restored', '23:59:59')]:
        for suffix, when in [('outside', '00:00:00'), ('boundary', boundary)]:
            event(f'{account}-{suffix}-page', 'page_viewed', f'2026-08-30 {when}',
                  visitor=f'{account}-visitor', page=f'/{suffix}')
            event(f'{account}-{suffix}-watch', 'debate_playback_interval', f'2026-08-30 {when}',
                  visitor=f'{account}-visitor', props={'debate_id': suffix, 'active_ms': 1000})
        event(f'{account}-at-signup', 'page_viewed', f'2026-09-29 {boundary}',
              visitor=f'{account}-visitor', page='/at-signup')
        event(f'{account}-watch-at-signup', 'debate_playback_interval', f'2026-09-29 {boundary}',
              visitor=f'{account}-visitor', props={'debate_id': 'at-signup', 'active_ms': 1000})
    accounts = ['history', 'instant', 'missing', 'missing-fields', 'restored', 'history']
    account_literals = ','.join(literal(a) for a in accounts)
    event_literals = ','.join('(' + ','.join(literal(v) for v in e) + ')' for e in events)
    fixtures = f"""WITH fixture_signups AS (
        SELECT arrayJoin([{account_literals}]) AS privy_user_id,
               toDateTime64(if(privy_user_id = 'restored', '2026-09-29 23:59:59', '2026-09-29 12:00:00'), 3, 'UTC') AS event_time,
               'fixture-source' AS source_account_id
    ), fixture_events AS (
        SELECT t.1 AS event_id, toDateTime64(t.2, 3, 'UTC') AS event_time, t.3 AS event_name,
               t.4 AS anonymous_id, t.5 AS session_id, t.6 AS privy_user_id, t.7 AS user_id,
               t.8 AS page_path, t.9 AS properties_json, 'genesis' AS app, 'production' AS environment
        FROM (SELECT arrayJoin([{event_literals}]) AS t)
    ),"""
    query = report.replace('WITH', fixtures, 1).strip().removesuffix(';') + ' FORMAT JSON'
    separator = '&' if '?' in args.url else '?'
    url = args.url + separator + urllib.parse.urlencode({'query': query})
    with urllib.request.urlopen(url, timeout=30) as response:
        rows = json.load(response)['data']
    by_account = {row['account_id']: row for row in rows}
    assert len(rows) == 5, rows
    assert [p[1] for p in by_account['history']['pages_before_signup']] == ['/boundary', '/explore', '/debate'], rows
    assert [p[1] for p in by_account['history']['playback_before_signup']] == ['boundary', 'fixture-debate'], rows
    assert [p[1] for p in by_account['restored']['pages_before_signup']] == ['/boundary', '/claim'], rows
    assert [p[1] for p in by_account['restored']['playback_before_signup']] == ['boundary'], rows
    assert by_account['history']['context_source'] == 'auth_start', rows
    assert by_account['instant']['history_status'] == 'no_observed_history', rows
    assert by_account['missing']['history_status'] == 'missing_link', rows
    assert by_account['missing-fields']['history_status'] == 'missing_link', rows
    assert by_account['restored']['history_status'] == 'has_history', rows
    for row in rows:
        assert int(row['source_accounts']) == 5, row
        assert int(row['linked_accounts']) == 3, row
        assert int(row['accounts_without_history']) == 1, row
        assert int(row['accounts_missing_link']) == 2, row
        assert row['pct_source_accounts_linked'] == 60, row
        assert row['pct_observed_app_accounts_linked'] == 75, row
        assert row['coverage_below_target'] == 1, row
    print('PASS: signup joins, restore, prior sessions, playback, deduplication, empty history, missing links, exact 30-day boundaries and coverage')


if __name__ == '__main__':
    main()
