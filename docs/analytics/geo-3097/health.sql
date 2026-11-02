-- Alert when stale = 1. An empty generation table must also alert.
SELECT maxOrNull(published_at) AS last_success,
       ifNull(last_success < now() - INTERVAL 24 HOUR, 1) AS stale
FROM analytics.debate_timing_generations;

-- Coverage issues remain visible even when the source requests all succeeded.
SELECT status, count() AS debates, sum(claim_count) AS claims,
       sum(unknown_claim_count) AS claims_without_round
FROM analytics.debate_timing_debates
WHERE generation = (
  SELECT generation FROM analytics.debate_timing_generations
  ORDER BY published_at DESC, generation DESC LIMIT 1
)
GROUP BY status;

SELECT timing_source, count() AS statements, countIf(round = 'unknown') AS without_round,
       min(confidence) AS min_confidence, max(confidence) AS max_confidence
FROM analytics.claim_moments GROUP BY timing_source;
