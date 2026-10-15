-- Votes signed-out visitors kept on their device (GEO-3214), by day and side. Casts and switches
-- only: a removal has no side. `side` is agree/disagree for a claim, upvote/downvote otherwise.
-- Votes recorded before GEO-3243 carry `vote_direction` but no `response_action`; the fallback
-- derives the same side from it, so the whole history splits.
SELECT
  toDate(event_time) AS day,
  JSONExtractString(properties_json, 'response_kind') AS kind,
  if(
    JSONExtractString(properties_json, 'response_action') != '',
    JSONExtractString(properties_json, 'response_action'),
    multiIf(
      JSONExtractString(properties_json, 'vote_direction') = 'up', if(kind = 'curation', 'upvote', 'agree'),
      JSONExtractString(properties_json, 'vote_direction') = 'down', if(kind = 'curation', 'downvote', 'disagree'),
      'unknown'
    )
  ) AS side,
  count() AS votes,
  uniqExact(anonymous_id) AS visitors
FROM analytics.events_canonical
WHERE app = 'genesis' AND environment = 'production' AND event_name = 'action_completed'
  AND JSONExtractString(properties_json, 'action_kind') = 'local_vote'
  AND JSONExtractString(properties_json, 'vote_action') IN ('cast', 'switch')
  AND NOT JSONExtractBool(properties_json, 'is_internal')
  AND NOT JSONExtractBool(properties_json, 'is_test')
  AND NOT JSONExtractBool(properties_json, 'is_automated')
GROUP BY day, kind, side
ORDER BY day, kind, side;
