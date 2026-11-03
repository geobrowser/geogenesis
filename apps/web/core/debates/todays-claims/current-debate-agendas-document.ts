import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * gaia's `currentDebateAgendas` (GEO-3503): one row per agenda item, already in Geo's order. With no
 * `spaceIds` it covers every space whose current agenda is from this week.
 *
 * `first` is required in practice: the API stops at 100 rows without it (max 1000).
 */
const CURRENT_DEBATE_AGENDAS_SOURCE = /* GraphQL */ `
  query CurrentDebateAgendas($earlierDays: Int, $first: Int) {
    currentDebateAgendas(earlierDays: $earlierDays, first: $first) {
      spaceId
      agendaId
      listedOn
      listedAt
      isCurrent
      source
      sectionId
      sectionName
      entityId
    }
  }
`;

export const currentDebateAgendasDocument = parse(CURRENT_DEBATE_AGENDAS_SOURCE) as TypedDocumentNode<any, any>;
