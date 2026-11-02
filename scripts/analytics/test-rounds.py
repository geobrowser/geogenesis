"""Run the actual GEO-3097 report with synthetic CTEs; no production data or credentials.

python3 scripts/analytics/test-rounds.py --url https://play.clickhouse.com/
"""
import argparse
import json
from pathlib import Path
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--user', default='play', help='ClickHouse user (use default for a local instance)')
    args = parser.parse_args()
    report = (Path(__file__).resolve().parents[2] / 'docs/analytics/geo-3097/rounds.sql').read_text()
    for table in ['debate_timing_generations', 'debate_timing_claims', 'debate_timing_turns', 'events_canonical', 'privy_account_labels']:
        report = report.replace('analytics.' + table, 'fixture_' + table)
    report = report.replace('WITH current_generation AS (', ', current_generation AS (', 1)
    report = report.removesuffix('\n').removesuffix(';').replace('SETTINGS join_use_nulls = 0', 'FORMAT JSON SETTINGS join_use_nulls = 0')
    events = []
    def event(op, **kwargs):
        events.append(dict(operation_id=op, outcome='succeeded', target_type='debate', target_id='DE-BATE', debate_id='DE-BATE', component='debate_player', **kwargs))
    event('opening', playback_position_ms=999)
    event('boundary', playback_position_ms=1000)
    event('boundary', playback_position_ms=1000)  # duplicate delivery
    event('outside', playback_position_ms=2000)
    event('null', playback_position_ms=None)
    event('negative', playback_position_ms=-1)
    event('string', playback_position_ms='1500')
    event('missing')  # absent is not zero
    event('internal', playback_position_ms=100, is_internal=True)
    event('bot', playback_position_ms=100, is_automated=True)
    event('', playback_position_ms=100)
    for op, claim, debate in [('exact', 'claim', 'debate'), ('reused', 'reused', ''), ('unknown', 'missing', 'debate'), ('wrong-source', 'claim', 'another')]:
        events.append(dict(operation_id=op, outcome='succeeded', target_type='claim', target_id=claim, debate_id=debate,
                           component='claim_vote', playback_position_ms=1500))
    events.append(dict(operation_id='end', outcome='succeeded', target_type='claim', target_id='claim', debate_id='no-timeline', component='debate_end_card'))
    events.append(dict(operation_id='nonsource', outcome='succeeded', target_type='person', target_id='person', component='person', playback_position_ms=0))
    literals = ','.join("'" + json.dumps(e).replace("'", "''") + "'" for e in events)
    query = f"""WITH fixture_events_canonical AS (
      SELECT toDateTime('2026-09-29 12:00:00', 'UTC') AS event_time, 'genesis' AS app, 'production' AS environment,
      'action_completed' AS event_name, 'fixture' AS privy_user_id, 'fixture' AS user_id, arrayJoin([{literals}]) AS properties_json
    ), fixture_privy_account_labels AS (
      SELECT '' AS privy_user_id, '' AS user_id, 0 AS active, 0 AS exclude_from_metrics WHERE 0
    ), fixture_debate_timing_generations AS (
      SELECT 'current' AS generation, now() AS published_at
    ), fixture_debate_timing_turns AS (
      SELECT 'current' AS generation, 'debate' AS debate_id, x.1 AS start_ms, x.2 AS end_ms, x.3 AS round, x.4 AS speaker_space_id
      FROM (SELECT arrayJoin([(toUInt64(0),toUInt64(1000),'opening','speaker1'),(toUInt64(1000),toUInt64(2000),'closing','speaker2')]) AS x)
    ), fixture_debate_timing_claims AS (
      SELECT x.1 AS generation, x.2 AS claim_id, x.3 AS debate_id, x.4 AS round, x.5 AS speaker_space_id, x.6 AS timing_source, x.7 AS confidence
      FROM (SELECT arrayJoin([
        ('current','claim','debate','opening','speaker1','exact',1.0),
        ('current','reused','debate','opening','speaker1','turn_only',0.0),
        ('current','reused','debate','closing','speaker2','matched',0.7),
        ('current','reused','second','rebuttal','speaker3','exact',1.0),
        ('aborted','claim','debate','wrong','wrong','exact',1.0)
      ]) AS x)
    ) {report}"""
    def run(query):
        # Only synthetic values travel to the read-only playground. Keep the report's
        # real parameter binding, rather than replacing it with SQL literals.
        params = {'user': args.user, 'query': query,
                  'param_from': '2026-09-01 00:00:00', 'param_to': '2026-10-01 00:00:00'}
        url = args.url + ('&' if '?' in args.url else '?') + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                rows = json.load(response)['data']
        except urllib.error.HTTPError as error:
            raise RuntimeError(error.read().decode()) from error
        return sorted((r['debate_id'], r['round'], r['speaker_space_id'], r['timing_source'], int(r['actions'])) for r in rows)

    actual = run(query)
    expected = sorted([
        ('debate','opening','speaker1','playback',1), ('debate','closing','speaker2','playback',1),
        ('debate','unknown','','unknown',6), ('debate','opening','speaker1','exact',1),
        ('debate','opening','speaker1','turn_only',1), ('debate','closing','speaker2','matched',1),
        ('second','rebuttal','speaker3','exact',1), ('another','unknown','','unknown',1),
        ('notimeline','end_card','','end_card',1),
    ])
    assert actual == expected, f'Expected {expected}, got {actual}'
    empty_snapshot = query.replace("SELECT 'current' AS generation, now() AS published_at",
                                   "SELECT 'current' AS generation, now() AS published_at WHERE 0")
    expected_empty = sorted([
        ('debate', 'unknown', '', 'unknown', 9), ('another', 'unknown', '', 'unknown', 1),
        ('', 'unknown', '', 'unknown', 1), ('notimeline', 'end_card', '', 'end_card', 1),
    ])
    actual_empty = run(empty_snapshot)
    assert actual_empty == expected_empty, f'Empty snapshot: expected {expected_empty}, got {actual_empty}'
    print('PASS: bound parameters, boundaries, invalid positions, empty snapshots, claim precedence, reuse, deduplication, end cards, traffic filters, incomplete generations')


if __name__ == '__main__':
    main()
