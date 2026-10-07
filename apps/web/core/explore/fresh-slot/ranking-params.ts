import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import * as Effect from 'effect/Effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';

/**
 * Best's stored-score parameters, read-only (GEO-3221 phase 1): gaia's `entity_ranking_config`
 * single row and `entity_type_weights`, both already exposed by the public API. Editing them
 * changes the stored score and needs a re-score, so it is a later phase.
 */
export type RankingParams = {
  config: Record<string, string | null> | null;
  typeWeights: { typeId: string; weight: string; note: string | null }[];
};

type RankingParamsResponse = {
  entityRankingConfigs?: Record<string, string | null>[] | null;
  entityTypeWeights?: { typeId: string; weight: string; note: string | null }[] | null;
};

export const rankingParamsDocument: TypedDocumentNode<RankingParamsResponse, Record<string, never>> = parse(
  /* GraphQL */ `
    query RankingLabParams {
      entityRankingConfigs {
        tauSeconds
        participationWeight
        participationCap
        commentWeight
        commentCap
        priorPositive
        priorNegative
        wilsonZ
        qualityFloor
        intrinsicCap
        topicInterestedWeight
        topicDebateWeight
        topicCap
        updatedAt
      }
      entityTypeWeights {
        typeId
        weight
        note
      }
    }
  `
);

export async function fetchRankingParams(): Promise<RankingParams> {
  return Effect.runPromise(
    graphql({
      query: rankingParamsDocument,
      decoder: (data: RankingParamsResponse): RankingParams => ({
        config: data.entityRankingConfigs?.[0] ?? null,
        typeWeights: data.entityTypeWeights ?? [],
      }),
      variables: {},
    })
  );
}
