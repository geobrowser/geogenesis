-- Emitted-account quality; the external Privy export must also be reconciled to
-- this account ID set to detect entirely missing signups. Alert if known_pct < 98.
SELECT toDate(event_time) AS day, count() AS signup_rows,
  uniqExact(coalesce(privy_user_id, user_id, '')) AS accounts,
  signup_rows - accounts AS duplicate_rows,
  uniqExactIf(coalesce(privy_user_id, user_id, ''),
    JSONExtractString(properties_json, 'auth_control') NOT IN ('', 'unknown')
    AND JSONExtractString(properties_json, 'component') NOT IN ('', 'unknown')
    AND JSONExtractString(properties_json, 'auth_attempt_id') != '') AS known_accounts,
  100.0 * known_accounts / nullIf(accounts, 0) AS known_pct
FROM analytics.events_canonical
WHERE app = 'genesis' AND environment = 'production' AND event_name = 'signed_up'
  AND event_time >= now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day;
