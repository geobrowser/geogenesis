-- One row per attributed account attempt. No action row is not proof of failure.
WITH events AS (
  SELECT *, JSONExtractString(properties_json, 'auth_attempt_id') AS attempt_id
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production'
    AND event_time >= now() - INTERVAL 30 DAY
    AND event_name IN ('signed_up', 'signed_in', 'auth_onboarding_progress', 'auth_action_completed')
    AND attempt_id != ''
), attempts AS (
  SELECT attempt_id,
    argMaxIf(properties_json, event_time, event_name IN ('signed_up', 'signed_in')) AS account_props,
    argMaxIf(coalesce(privy_user_id, user_id, ''), event_time, event_name IN ('signed_up', 'signed_in')) AS account_id,
    argMaxIf(JSONExtractString(properties_json, 'onboarding_step'), event_time, event_name = 'auth_onboarding_progress') AS last_onboarding_step,
    argMaxIf(JSONExtractString(properties_json, 'outcome'), event_time, event_name = 'auth_onboarding_progress') AS onboarding_outcome,
    argMaxIf(JSONExtractString(properties_json, 'outcome'), event_time, event_name = 'auth_action_completed') AS action_outcome,
    argMaxIf(JSONExtractString(properties_json, 'operation_id'), event_time, event_name = 'auth_action_completed') AS operation_id
  FROM events GROUP BY attempt_id
)
SELECT attempt_id, account_id, JSONExtractString(account_props, 'auth_intent') AS intent,
  JSONExtractString(account_props, 'auth_continuation') AS continuation,
  last_onboarding_step, onboarding_outcome, operation_id,
  multiIf(action_outcome != '', action_outcome,
    onboarding_outcome = 'dismissed', 'onboarding_abandoned',
    continuation = 'repeat', 'requires_another_press',
    intent IN ('', 'sign_in'), 'no_gated_action', 'unresolved') AS action_status
FROM attempts
WHERE account_id != ''
  AND NOT JSONExtractBool(account_props, 'is_internal')
  AND NOT JSONExtractBool(account_props, 'is_test')
  AND NOT JSONExtractBool(account_props, 'is_automated')
  AND account_id NOT IN (
    SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
    WHERE active AND exclude_from_metrics
  );
