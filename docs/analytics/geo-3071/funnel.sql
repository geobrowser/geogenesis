-- Attempts are grouped by opening day; completion can occur on a later day.
-- Unresolved is intentionally separate from explicit closure and has no fake duration.
WITH excluded AS (
  SELECT coalesce(privy_user_id, user_id, '') AS account_id
  FROM analytics.privy_account_labels
  WHERE active AND exclude_from_metrics AND account_id != ''
), excluded_attempts AS (
  SELECT DISTINCT JSONExtractString(properties_json, 'auth_attempt_id') AS id
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND event_time >= now() - INTERVAL 31 DAY
    AND coalesce(privy_user_id, user_id, '') IN (SELECT account_id FROM excluded)
), events AS (
  SELECT *, JSONExtractString(properties_json, 'auth_attempt_id') AS attempt_id
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_time >= now() - INTERVAL 31 DAY
    AND event_name IN ('auth_attempt_started', 'auth_prompt_viewed', 'auth_attempt_completed', 'signed_up', 'signed_in')
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_test')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND attempt_id != '' AND attempt_id NOT IN (SELECT id FROM excluded_attempts)
), attempts AS (
  SELECT attempt_id, min(event_time) AS started,
    argMin(JSONExtractString(properties_json, 'component'), event_time) AS component,
    argMin(JSONExtractString(properties_json, 'auth_control'), event_time) AS control,
    countIf(event_name = 'auth_attempt_started') > 0 AS requested,
    countIf(event_name = 'auth_prompt_viewed') > 0 AS viewed,
    countIf(event_name = 'signed_up') > 0 AS signed_up,
    countIf(event_name = 'signed_in') > 0 AS signed_in,
    argMaxIf(JSONExtractString(properties_json, 'outcome'), event_time, event_name = 'auth_attempt_completed') AS outcome,
    maxIf(JSONExtractFloat(properties_json, 'auth_duration_ms'), event_name = 'auth_attempt_completed') AS auth_duration_ms
  FROM events GROUP BY attempt_id
)
SELECT toDate(started) AS day, component, control,
  countIf(requested) AS attempts, countIf(viewed) AS prompts,
  countIf(signed_up) AS new_accounts, countIf(signed_in) AS logins,
  countIf(outcome IN ('closed', 'superseded')) AS closed,
  countIf(outcome = '' AND started < now() - INTERVAL 24 HOUR) AS unresolved_after_24h,
  avgIf(auth_duration_ms, outcome != '') AS mean_observed_auth_duration_ms
FROM attempts GROUP BY day, component, control ORDER BY day, component, control;
