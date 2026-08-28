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
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

/**
 * Where a claim came from.
 *
 * A claim lifted from somewhere else carries a `Sources` relation pointing at it, which is the
 * cheap half of this. That source is not always a debate — an article can carry claims too — so
 * the sentence names it by its own type rather than asserting one.
 *
 * The speaker is the expensive half, and only debates have one: attribution rides the *text
 * block's* `Authors` relation rather than the claim's, so it takes a second hop back through
 * whichever block quoted the claim. Without a speaker the row still names the source.
 *
 * Renders nothing for a claim authored directly in a space — there is nothing to point at, and a
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

  // Only asked for once we know there is a source to attribute the claim to, and constrained to
  // blocks belonging to *that* source. A claim can be quoted by more than one transcript — the same
  // sentence surfacing in a later debate is the ordinary case, not an edge one — and a lookup keyed
  // on the claim alone would take whichever block came back first and hang someone else's name on
  // it. Both clauses have to hold: relations given as an array are AND-ed.
  const { entities: blocks } = useQueryEntities({
    where: {
      types: [{ id: { equals: TEXT_BLOCK_TYPE_ID } }],
      relations: [
        { typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: claimId } } },
        { typeOf: { id: { equals: SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: source?.id ?? '' } } },
      ],
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

  // `Sources` points wherever the claim came from, which is not always a debate — a claim pulled
  // from an article carries that article. The relation only gives an id and a name, so the type
  // has to be read off the entity itself to name the source in the sentence below.
  const { entity: sourceEntity } = useQueryEntity({ id: source?.id ?? '', enabled: source !== null });
  const sourceKind = sourceEntity?.types.find(type => type.name)?.name?.toLowerCase() ?? 'source';

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
      {/* Two lines rather than one sentence. Debate names are built from both debaters and the
          claim, so they run long — inlined, the attribution and the title wrapped into a single
          run-on block where "Preston Mantel in Preston Mantel vs. …" read as a stutter. Splitting
          them puts the person on one line and what they said it in on the next. */}
      <div className="flex min-w-0 flex-col">
        <Text as="span" variant="metadata" color="grey-04">
          {speaker?.name ? (
            <>
              First stated by{' '}
              {/* Linked when the profile resolves to one. `profileLink` is nullable — a speaker
                  whose personal space has no front-page entity has nowhere to go, and a link to
                  nothing is worse than plain text. `whitespace-nowrap` keeps a two-word name from
                  breaking across lines. */}
              {speaker.profileLink ? (
                <Link href={speaker.profileLink} className="whitespace-nowrap text-text hover:underline">
                  {speaker.name}
                </Link>
              ) : (
                <span className="whitespace-nowrap text-text">{speaker.name}</span>
              )}
            </>
          ) : (
            `From the ${sourceKind}`
          )}
        </Text>
        <Link href={NavUtils.toEntity(spaceId, source.id)} className="truncate text-metadata text-text hover:underline">
          {source.name ?? `this ${sourceKind}`}
        </Link>
      </div>
    </section>
  );
}
