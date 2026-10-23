-- How sign-in attempts end, by day and entry point. `closed` is a dialog dismissed before anyone
-- signed in. Since GEO-3243, a dialog exited after Privy had signed someone in is recorded apart:
-- `left_after_sign_up` (the attempt created the account, which Privy then signed back out) and
-- `left_after_sign_in` (an existing account). Before it, both were counted in `closed`.
SELECT
  toDate(event_time) AS day,
  JSONExtractString(properties_json, 'component') AS component,
  JSONExtractString(properties_json, 'outcome') AS outcome,
  count() AS attempts,
  uniqExact(anonymous_id) AS visitors
FROM analytics.events_canonical
WHERE app = 'genesis' AND environment = 'production' AND event_name = 'auth_attempt_completed'
  AND NOT JSONExtractBool(properties_json, 'is_internal')
  AND NOT JSONExtractBool(properties_json, 'is_test')
  AND NOT JSONExtractBool(properties_json, 'is_automated')
GROUP BY day, component, outcome
ORDER BY day, component, outcome;
