import { EntitiesOrderBy } from '~/core/gql/graphql';

type Direction = 'asc' | 'desc';

/**
 * Entity-level server orders shared by every surface that offers them (claims
 * browse, data blocks). Best is the indexer's ranking score, an `EntitiesOrderBy`
 * column rather than a property; unscored rows sort last because the API
 * substitutes a sentinel. The id tiebreak keeps cursor pagination stable across
 * equal scores or timestamps. Both directions live here so they cannot drift.
 */
export const ENTITY_ORDER_BY = {
  best: {
    desc: [EntitiesOrderBy.RankingScoreDesc, EntitiesOrderBy.UpdatedAtDesc, EntitiesOrderBy.IdAsc],
    asc: [EntitiesOrderBy.RankingScoreAsc, EntitiesOrderBy.UpdatedAtAsc, EntitiesOrderBy.IdAsc],
  },
  created_at: {
    desc: [EntitiesOrderBy.CreatedAtDesc, EntitiesOrderBy.IdAsc],
    asc: [EntitiesOrderBy.CreatedAtAsc, EntitiesOrderBy.IdAsc],
  },
} satisfies Record<string, Record<Direction, EntitiesOrderBy[]>>;

export const BEST_ORDER_BY: EntitiesOrderBy[] = ENTITY_ORDER_BY.best.desc;
export const NEWEST_ORDER_BY: EntitiesOrderBy[] = ENTITY_ORDER_BY.created_at.desc;
