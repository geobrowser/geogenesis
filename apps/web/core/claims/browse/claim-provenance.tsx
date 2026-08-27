'use client';

import * as React from 'react';

import {
  AUTHORS_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  SOURCES_PROPERTY_ID,
  TEXT_BLOCK_TYPE_ID,
} from '~/core/debates/ontology';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

/**
 * Where a claim came from, when it came from a debate.
 *
 * A claim extracted from a transcript carries a `Sources` relation pointing at the debate that
 * produced it, which is the cheap half of this. The speaker is the expensive half: attribution
 * rides the *text block's* `Authors` relation rather than the claim's, so it takes a second hop
 * back through whichever block quoted the claim.
 *
 * Renders nothing for a claim authored directly in a space — there is no speaker to name, and a
 * row that is empty more often than not is worse than no row.
 */
export function ClaimProvenance({
  claimId,
  claimRelations,
  spaceId,
}: {
  claimId: string;
  claimRelations: Relation[];
  spaceId: string;
}) {
  const source = React.useMemo(() => {
    const relation = claimRelations.find(
      candidate => candidate.isDeleted !== true && ID.equals(candidate.type.id, SOURCES_PROPERTY_ID)
    );
    return relation ? { id: relation.toEntity.id, name: relation.toEntity.name } : null;
  }, [claimRelations]);

  // Only asked for once we know there is a source debate to attribute the claim to.
  const { entities: blocks } = useQueryEntities({
    where: {
      types: [{ id: { equals: TEXT_BLOCK_TYPE_ID } }],
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: claimId } } }],
    },
    first: 1,
    enabled: source !== null,
  });

  const speakerSpaceId = React.useMemo(() => {
    for (const block of blocks) {
      const author = block.relations.find(
        relation => relation.isDeleted !== true && ID.equals(relation.type.id, AUTHORS_PROPERTY_ID)
      );
      if (author) return author.toEntity.id;
    }
    return null;
  }, [blocks]);

  const speakerSpaceIds = React.useMemo(() => (speakerSpaceId ? [speakerSpaceId] : []), [speakerSpaceId]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(speakerSpaceIds, speakerSpaceIds.length > 0);
  const speaker = speakerSpaceId ? profilesBySpaceId.get(speakerSpaceId) : undefined;

  if (!source) return null;

  return (
    <section
      aria-label="Where this claim came from"
      className="flex items-center gap-2.5 rounded-lg border border-dashed border-grey-02 bg-grey-01 px-4 py-3"
    >
      {speakerSpaceId && (
        <span className="block size-6 shrink-0 overflow-hidden rounded-full bg-grey-02">
          <Avatar avatarUrl={speaker?.avatarUrl} value={speakerSpaceId} size={24} />
        </span>
      )}
      <Text as="p" variant="metadata" color="grey-04" className="min-w-0">
        {speaker?.name ? (
          <>
            First stated by <span className="text-text">{speaker.name}</span> in{' '}
          </>
        ) : (
          <>From the debate </>
        )}
        <Link href={NavUtils.toEntity(spaceId, source.id)} className="text-text hover:underline">
          {source.name ?? 'this debate'}
        </Link>
      </Text>
    </section>
  );
}
