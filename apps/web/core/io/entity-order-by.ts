import { EntitiesOrderBy } from '~/core/gql/graphql';

/**
 * Entity-level server orders shared by every surface that offers them (claims
 * browse, data blocks). Best is the indexer's ranking score, an `EntitiesOrderBy`
 * column rather than a property; unscored rows sort last because the API
 * substitutes a sentinel. The id tiebreak keeps cursor pagination stable across
 * equal scores or timestamps.
 */
export const BEST_ORDER_BY: EntitiesOrderBy[] = [
  EntitiesOrderBy.RankingScoreDesc,
  EntitiesOrderBy.UpdatedAtDesc,
  EntitiesOrderBy.IdAsc,
];

export const NEWEST_ORDER_BY: EntitiesOrderBy[] = [EntitiesOrderBy.CreatedAtDesc, EntitiesOrderBy.IdAsc];
