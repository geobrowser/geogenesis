'use client';

import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { ClaimDebateButton } from '~/core/debates/claim-debate-button';
import { ID } from '~/core/id';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ClaimDebates } from './claim-debates';
import { ClaimProvenance } from './claim-provenance';
import { ClaimRelatedClaims } from './claim-related-claims';
import { useClaimResponseSummary } from './claim-response-summary';
import { ClaimVerdict } from './claim-verdict';

/** Topic chips shown inline before the rest collapse into a count. */
const TOPIC_CHIP_CAP = 3;

/**
 * The browse-mode read view for a Claim.
 *
 * One column at every width. The route view, the entity side panel and a phone are three different
 * widths of the same page rather than three layouts — the side panel is narrow on a wide viewport,
 * so a viewport media query would lay it out as though it had the whole screen. What varies with
 * width is spacing, handled through container queries against the wrapper below.
 *
 * Space-scoped throughout. `spaceId` is the space the reader arrived through, and every
 * space-scoped read on the page — the response kind, the counts, geo-chat's claim row, the debates
 * and related claims — is keyed on that one id, so the page can never mix two spaces' data.
 *
 * Modules render only when they have something to say. A claim nobody has responded to, that has
 * never been debated, that carries no topics and was authored by hand shows its text, its space,
 * and the controls to act on it — and nothing else.
 */
export function ClaimPageView({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });

  const responseKind = React.useMemo(() => (entity ? claimResponseKind(entity, spaceId) : 'stance'), [entity, spaceId]);
  const summary = useClaimResponseSummary(entityId, spaceId, responseKind);

  const topics = React.useMemo(() => relationsOfType(entity?.relations, TOPICS_PROPERTY_ID), [entity?.relations]);
  const tags = React.useMemo(() => relationsOfType(entity?.relations, TAG_PROPERTY_ID), [entity?.relations]);
  const topicIds = React.useMemo(() => topics.map(topic => topic.toEntity.id), [topics]);

  if (isLoading && !entity) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 @[560px]:px-5">
        <Skeleton className="h-8 w-3/4 rounded" />
        <Skeleton className="h-[132px] w-full rounded-lg" />
        <Skeleton className="h-[96px] w-full rounded-lg" />
      </div>
    );
  }

  if (!entity) return null;

  const copy = ENTITY_RESPONSE_COPY[responseKind];

  return (
    <div className="@container">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 @[560px]:gap-8 @[560px]:px-5 @[560px]:py-8">
        {/* Hero */}
        <header className="flex flex-col gap-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex max-w-full items-center rounded-sm bg-ctaTertiary px-2 py-0.5 text-metadata font-medium text-ctaPrimary"
                >
                  <span className="truncate">{tag.toEntity.name ?? tag.toEntity.id}</span>
                </span>
              ))}
            </div>
          )}

          <h1 className="text-[1.5rem] leading-[1.3] font-semibold tracking-[-0.4px] text-balance text-text @[560px]:text-[1.75rem]">
            {entity.name ?? entity.id}
          </h1>

          {entity.description && (
            <Text as="p" variant="body" color="grey-04">
              {entity.description}
            </Text>
          )}

          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topics.slice(0, TOPIC_CHIP_CAP).map(topic => (
                <Link
                  key={topic.id}
                  href={NavUtils.toEntity(spaceId, topic.toEntity.id)}
                  className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text transition-colors hover:border-grey-03"
                >
                  <span className="truncate">{topic.toEntity.name ?? topic.toEntity.id}</span>
                </Link>
              ))}
              {topics.length > TOPIC_CHIP_CAP && (
                <span className="inline-flex items-center rounded-md bg-grey-01 px-2 py-1 text-[0.8125rem] text-grey-04 tabular-nums">
                  +{topics.length - TOPIC_CHIP_CAP}
                </span>
              )}
            </div>
          )}
        </header>

        <ClaimVerdict entityId={entityId} spaceId={spaceId} responseKind={responseKind} summary={summary} />

        {/* Your position. The response control and the readiness toggle are stacked rather than
            placed side by side because they are one sequence, not two choices: readiness can only
            be switched on once a side has been taken. */}
        <section aria-label="Your position" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
          <Text as="div" variant="metadataMedium" color="grey-04" className="mb-2">
            Your position
          </Text>
          <EntityVoteButtons entityId={entityId} spaceId={spaceId} />
          <div className="mt-4 border-t border-divider pt-4">
            <ClaimDebateButton entityId={entityId} spaceId={spaceId} />
            <Text as="p" variant="metadata" color="grey-04" className="mt-2">
              {`Stand ready and we'll match you with someone who picked ${copy.negativeAction.toLowerCase()}.`}
            </Text>
          </div>
        </section>

        <ClaimDebates claimId={entityId} spaceId={spaceId} responseKind={responseKind} />

        <ClaimProvenance claimId={entityId} claimRelations={entity.relations} spaceId={spaceId} />

        <ClaimRelatedClaims claimId={entityId} spaceId={spaceId} topicIds={topicIds} />
      </div>
    </div>
  );
}

function relationsOfType(relations: Relation[] | undefined, propertyId: string): Relation[] {
  return (relations ?? []).filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId));
}
