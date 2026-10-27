"""Execute the GEO-3094 report against synthetic ClickHouse CTEs.

Uses the same read-only HTTP fixture approach as test-origins.py. No production
tables, credentials, or data are used, and the report SQL is not reimplemented.
Example: python3 scripts/analytics/test-compare-counts.py --url https://play.clickhouse.com/?user=play
"""

import argparse
import datetime
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request


DEPLOYED_AT = datetime.datetime(2026, 9, 29, 12, tzinfo=datetime.timezone.utc)
EVENTS = ("action_completed", "component_impression")


def event(name, offset, page_id="page", **overrides):
    row = {
        "event_time": (DEPLOYED_AT + datetime.timedelta(seconds=offset)).strftime("%Y-%m-%d %H:%M:%S"),
        "event_name": name, "app": "genesis", "environment": "production",
        "privy_user_id": "public", "user_id": "public",
        "properties": {
            "component": "entity_vote_buttons", "page_path": "/explore", "page_type": "explore",
            "page_view_id": page_id, "target_id": "claim", "target_type": "claim",
            "action_context_version": "v1", "operation_id": "operation", "action_kind": "vote",
            "outcome": "succeeded", "presentation_instance_id": "display",
        },
    }
    row.update(overrides)
    return row


def fixtures(case):
    rows, labels, expected = [], [], {}
    for name in EVENTS:
        for window, offset in (("before", -86400), ("after", 0)):
            expected[window, name] = (0, 0, 0)
            if case == "page-views":
                ids = ["real-page", "real-page", "", None] if window == "before" else [""]
                rows.extend(event(name, offset, page_id) for page_id in ids)
                missing = event(name, offset)
                del missing["properties"]["page_view_id"]
                rows.append(missing)
                expected[window, name] = (5, 1, 3) if window == "before" else (2, 0, 2)
            elif case == "traffic":
                # Unlabeled, inactive-label, retained-label and anonymous traffic stays included.
                for account in ("public", "inactive", "retained", None):
                    rows.append(event(name, offset, str(account), privy_user_id=account, user_id=account))
                for flag in ("is_internal", "is_automated"):
                    excluded = event(name, offset, flag)
                    excluded["properties"][flag] = True
                    rows.append(excluded)
                rows.append(event(name, offset, "privy-label", privy_user_id="excluded"))
                rows.append(event(name, offset, "user-label", privy_user_id=None, user_id="fallback"))
                rows.append(event(name, offset, "preview", environment="preview"))
                rows.append(event(name, offset, "other-app", app="news"))
                expected[window, name] = (4, 4, 0)
        # Both date boundaries are half-open, including the first before second and excluding the last after second.
        rows.extend([event(name, -86401), event(name, 86400)])
    if case == "traffic":
        for account, active, exclude in (("excluded", True, True), ("fallback", True, True),
                                         ("inactive", False, True), ("retained", True, False), ("", True, True)):
            labels.append({"privy_user_id": account if account != "fallback" else None,
                           "user_id": account, "active": active, "exclude_from_metrics": exclude})
    return rows, labels, expected


def sql_rows(rows):
    literals = ["'" + json.dumps(row).replace("\\", "\\\\").replace("'", "\\'") + "'" for row in rows]
    return "arrayJoin(CAST([" + ",".join(literals) + "], 'Array(String)'))"


def query_for(report, rows, labels):
    report = report.replace("analytics.events_canonical", "fixture_events")
    report = report.replace("analytics.privy_account_labels", "fixture_labels")
    fixtures_sql = f"""fixture_events AS (
      SELECT toDateTime(JSONExtractString(row, 'event_time'), 'UTC') AS event_time,
             JSONExtractString(row, 'event_name') AS event_name,
             JSONExtractString(row, 'app') AS app, JSONExtractString(row, 'environment') AS environment,
             nullIf(JSONExtractString(row, 'privy_user_id'), '') AS privy_user_id,
             nullIf(JSONExtractString(row, 'user_id'), '') AS user_id,
             JSONExtractRaw(row, 'properties') AS properties_json
      FROM (SELECT {sql_rows(rows)} AS row)
    ), fixture_labels AS (
      SELECT nullIf(JSONExtractString(row, 'privy_user_id'), '') AS privy_user_id,
             nullIf(JSONExtractString(row, 'user_id'), '') AS user_id,
             JSONExtractBool(row, 'active') AS active,
             JSONExtractBool(row, 'exclude_from_metrics') AS exclude_from_metrics
      FROM (SELECT {sql_rows(labels)} AS row)
    ), """
    return report.replace("WITH ", "WITH " + fixtures_sql, 1).strip().removesuffix(";") + " FORMAT JSON"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="ClickHouse HTTP endpoint for synthetic fixtures")
    parser.add_argument("--case", choices=("page-views", "traffic", "empty"), help="Run one regression independently")
    root = pathlib.Path(__file__).resolve().parents[2]
    parser.add_argument("--report", type=pathlib.Path, default=root / "docs/analytics/geo-3094/compare-counts.sql")
    args = parser.parse_args()
    report = args.report.read_text()
    for case in ([args.case] if args.case else ("page-views", "traffic", "empty")):
        rows, labels, expected = fixtures(case)
        params = {"query": query_for(report, rows, labels), "param_deployed_at": DEPLOYED_AT.strftime("%Y-%m-%d %H:%M:%S")}
        url = args.url + ("&" if "?" in args.url else "?") + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                actual_rows = json.load(response)["data"]
        except urllib.error.HTTPError as error:
            raise RuntimeError(error.read().decode()) from error
        actual = {(row.get("window", row.get("windows.window")), row.get("event_name", row.get("events.event_name"))): tuple(int(row[key]) for key in ("events", "page_views", "missing_required"))
                  for row in actual_rows}
        assert len(actual_rows) == 4 and actual == expected, f"{case}: expected {expected}, got {actual_rows}"
        print(f"PASS: {case} (both events, both windows)")


if __name__ == "__main__":
    main()
