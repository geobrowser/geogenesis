'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

/** A way out of the page, not a directory. Long enough to be useful, short enough to stay a footer. */
const MAX_RELATED = 5;

/**
 * Other claims carrying one of this claim's topics.
 *
 * This is where topics finally pay off — as a way out of the page rather than a label on it.
 *
 * Ordered by recency for now. The explore page's "Best" ranking is the order this wants, but the
 * helper that exposes it for a bounded set of claim ids lands with the debate claims panel work;
 * this should adopt it once that is on master rather than growing a second copy of the query.
 */
export function ClaimRelatedClaims({
  claimId,
  spaceId,
  topicIds,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
}) {
  const { entities } = useQueryEntities({
    where: {
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { in: topicIds } } }],
    },
    // One over the cap, so dropping this claim from its own list can't leave a short one.
    first: MAX_RELATED + 1,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: topicIds.length > 0,
  });

  const related = React.useMemo(
    () => entities.filter(entity => !ID.equals(entity.id, claimId) && entity.name).slice(0, MAX_RELATED),
    [claimId, entities]
  );

  if (related.length === 0) return null;

  return (
    <section aria-label="Related claims">
      <Text as="h2" variant="smallTitle" color="text" className="mb-1 block">
        Related claims
      </Text>
      <ul className="m-0 flex list-none flex-col p-0">
        {related.map(entity => (
          <li key={entity.id} className="border-b border-divider last:border-b-0">
            <Link
              href={NavUtils.toEntity(spaceId, entity.id)}
              className="block py-3 text-metadata text-text transition-colors hover:text-grey-04"
            >
              {entity.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
