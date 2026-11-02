"""Execute the GEO-3073 origins report against synthetic ClickHouse CTEs.

Example: python3 scripts/analytics/test-origins.py --url https://play.clickhouse.com/
No production tables, credentials, or data are used. The supplied endpoint must
support read-only ClickHouse HTTP queries; the report itself is not reimplemented.
"""

import argparse
import json
import pathlib
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="ClickHouse HTTP endpoint for synthetic fixtures")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[2]
    report = (root / "docs/analytics/geo-3073/origins.sql").read_text()
    report = report.replace("analytics.events_canonical", "fixture_events")
    report = report.replace("analytics.privy_account_labels", "fixture_labels")
    first = "abcdef0123456789abcdef0123456789"
    second = "123456789abcdef0123456789abcdef0"
    fixtures = [
        {"operation_id": "claim-action", "target_type": "claim", "target_id": "claim",
         "origin_entity_ids": ["ABCDEF01-2345-6789-ABCD-EF0123456789", first, second.upper(), ""],
         "debate_id": first},
        {"operation_id": "debate-action", "target_type": "debate",
         "target_id": first.upper(), "debate_id": "abcdef01-2345-6789-abcd-ef0123456789"},
        {"operation_id": "internal-action", "target_type": "debate", "target_id": first,
         "is_internal": True},
    ]
    literals = ",".join("'" + json.dumps(row).replace("'", "''") + "'" for row in fixtures)
    query = f"""WITH fixture_events AS (
      SELECT now() AS event_time, 'genesis' AS app, 'production' AS environment,
             'action_completed' AS event_name, 'fixture-account' AS privy_user_id,
             'fixture-account' AS user_id, arrayJoin([{literals}]) AS properties_json
    ), fixture_labels AS (
      SELECT '' AS privy_user_id, '' AS user_id, 0 AS active, 0 AS exclude_from_metrics WHERE 0
    )
    {report.strip().removesuffix(';')} FORMAT JSON"""
    separator = "&" if "?" in args.url else "?"
    url = args.url + separator + urllib.parse.urlencode({"query": query})
    with urllib.request.urlopen(url, timeout=30) as response:
        rows = json.load(response)["data"]
    actual = sorted((row["source_id"], int(row["actions"])) for row in rows)
    expected = sorted([(first, 2), (second, 1)])
    assert actual == expected, f"Expected {expected}, got {actual}"
    print("PASS: mixed-case/dashed source, debate and target IDs count once per logical source")


if __name__ == "__main__":
    main()
