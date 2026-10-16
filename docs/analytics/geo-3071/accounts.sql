-- New accounts by entry, acted-on entity and known origin. Explode sources only
-- for the source report: one account may legitimately appear under several origins.
WITH accounts AS (
  SELECT coalesce(privy_user_id, user_id, '') AS account_id,
    min(event_time) AS created, argMin(properties_json, event_time) AS props
  FROM analytics.events_canonical
  WHERE app = 'genesis' AND environment = 'production' AND event_name = 'signed_up'
    AND event_time >= now() - INTERVAL 30 DAY
    AND JSONExtractString(properties_json, 'auth_attribution_version') = 'v1'
    AND NOT JSONExtractBool(properties_json, 'is_internal')
    AND NOT JSONExtractBool(properties_json, 'is_test')
    AND NOT JSONExtractBool(properties_json, 'is_automated')
    AND coalesce(privy_user_id, user_id, '') NOT IN (
      SELECT coalesce(privy_user_id, user_id, '') FROM analytics.privy_account_labels
      WHERE active AND exclude_from_metrics
    )
  GROUP BY account_id
)
SELECT toDate(created) AS day, JSONExtractString(props, 'component') AS component,
  JSONExtractString(props, 'auth_control') AS control,
  JSONExtractString(props, 'target_id') AS target_id,
  JSONExtractString(props, 'target_type') AS target_type,
  JSONExtractString(props, 'debate_id') AS playback_debate_id,
  JSONExtract(props, 'origin_entity_ids', 'Array(String)') AS origin_entity_ids,
  count() AS new_accounts
FROM accounts GROUP BY day, component, control, target_id, target_type, playback_debate_id, origin_entity_ids
ORDER BY day, new_accounts DESC;
