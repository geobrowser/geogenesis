'use client';

import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { DebateClaim } from '~/core/debates/api';
import { useBackfillReadinessForHeldPosition } from '~/core/debates/backfill-readiness-for-held-position';
import { useDebateClaims } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useRetireConfirmedResponseIndexing } from '~/core/debates/retire-confirmed-response-indexing';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';

import { ClaimDebates } from './claim-debates';
import { ClaimEndSlot } from './claim-end-slot';
import { ClaimProvenance } from './claim-provenance';
import { ClaimRelatedClaims } from './claim-related-claims';
import { ControversialTag } from './claim-summary';
import { ClaimVerdict } from './claim-verdict';
import { type ClaimResponseState, useClaimResponseState } from './use-claim-response-state';

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

  // Hoisted so one lookup answers for the whole page. geo-chat's row and the graph's `Is factual`
  // are two copies of the same fact and can disagree — while an edit to the flag indexes, most
  // obviously. Deriving the kind twice let the verdict count one vote kind while the pills
  // published another, and a response would then never appear in the number above it: the kind is
  // what selects `voteKind` on both the count query and the write.
  //
  // geo-chat's copy wins where it exists, matching every other claim surface; the graph answers for
  // spaces geo-chat does not index, which have no row at all.
  const rowQuery = useDebateClaims(spaceId, [entityId], true);
  const row: DebateClaim | null = rowQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;
  const state = useClaimResponseState({ claimId: entityId, spaceId, row, entity: entity ?? null });
  const { responseKind, summary } = state;

  const topics = React.useMemo(() => relationsOfType(entity?.relations, TOPICS_PROPERTY_ID), [entity?.relations]);
  const tags = React.useMemo(() => relationsOfType(entity?.relations, TAG_PROPERTY_ID), [entity?.relations]);
  const topicIds = React.useMemo(() => topics.map(topic => topic.toEntity.id), [topics]);
  // Named types only: an unnamed one would render as a raw id, which says less than no chip.
  const typeName = entity?.types.find(type => type.name)?.name ?? null;

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

  return (
    <div className="@container">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 @[560px]:gap-8 @[560px]:px-5 @[560px]:py-8">
        {/* Hero */}
        <header className="flex flex-col gap-3">
          {/* `text-pretty`, not `text-balance`. Balancing evens every line to the same length,
              which on a claim — a full sentence running to three or four lines — leaves each one
              breaking well short of the measure and reads as wrapping early. Pretty only avoids a
              stranded last word, so the lines fill. */}
          <h1 className="text-[1.5rem] leading-[1.3] font-semibold tracking-[-0.4px] text-pretty text-text @[560px]:text-[1.75rem]">
            {entity.name ?? entity.id}
          </h1>

          {entity.description && (
            <Text as="p" variant="body" color="grey-04">
              {entity.description}
            </Text>
          )}

          {/* What this is on the left, what it's about on the right. The two answer different
              questions, so pushing them to opposite ends reads faster than one undifferentiated
              run of chips — and `flex-wrap` lets the topics drop to their own line in the side
              panel rather than crushing the type against them. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {typeName && <MetaChip>{typeName}</MetaChip>}
              {tags.map(tag => (
                <MetaChip key={tag.id}>{tag.toEntity.name ?? tag.toEntity.id}</MetaChip>
              ))}
              {/* Among the chips that say what this is, which is what "contested" is — and the same
                  component the cards use, rather than a second span at a size the scale lacks. */}
              {summary.isControversial ? <ControversialTag /> : null}
            </div>

            {topics.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {topics.slice(0, TOPIC_CHIP_CAP).map(topic => (
                  <Link
                    key={topic.id}
                    href={NavUtils.toEntity(spaceId, topic.toEntity.id)}
                    className={`${META_CHIP_CLASS} text-text transition-colors hover:border-text`}
                  >
                    <span className="truncate">{topic.toEntity.name ?? topic.toEntity.id}</span>
                  </Link>
                ))}
                {topics.length > TOPIC_CHIP_CAP && (
                  <span className={`${META_CHIP_CLASS} text-grey-04 tabular-nums`}>
                    +{topics.length - TOPIC_CHIP_CAP}
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        <ClaimVerdict entityId={entityId} spaceId={spaceId} responseKind={responseKind} summary={summary} />

        <ClaimPositionSection entityId={entityId} spaceId={spaceId} state={state} row={row} />

        <ClaimDebates claimId={entityId} spaceId={spaceId} responseKind={responseKind} />

        <ClaimProvenance claimId={entityId} claimRelations={entity.relations} spaceId={spaceId} />

        <ClaimRelatedClaims claimId={entityId} spaceId={spaceId} topicIds={topicIds} />

        {/* Last, and in the same `page` variant a regular entity uses — the entity body renders it
            this way for both the route and the side panel, and only the dedicated comments panel
            asks for the `panel` variant. Unlike the modules above, this one always renders: an
            empty thread is an invitation to start it, not an absence to hide. */}
        <CommentSection entityId={entityId} spaceId={spaceId} />
      </div>
    </div>
  );
}

/**
 * Taking a side, and standing ready to argue it.
 *
 * Both live in one card, with the readiness switch in the header's top right and the side pills
 * beneath — the same arrangement the hub's claim card uses, so the switch is where anyone who has
 * used the panel already looks for it. They belong together because they are a sequence: readiness
 * can only be turned *on* for a claim you have already responded to.
 *
 * The pills and the publishing behind them come from the hub's own control, so a response taken
 * here goes through exactly the path a response taken in the panel does — including the optimistic
 * handling that keeps a just-published side from looking like it was discarded.
 */
function ClaimPositionSection({
  entityId,
  spaceId,
  state,
  row,
}: {
  entityId: string;
  spaceId: string;
  /**
   * The page's one derivation, passed down rather than repeated.
   *
   * Deriving a second kind here is what let the page count one vote kind while publishing another,
   * and the same block written per surface is what made each of that family of bugs a separate fix.
   */
  state: ClaimResponseState;
  /** geo-chat's row, or null — which for a claim nobody has answered is a settled answer. */
  row: DebateClaim | null;
}) {
  const { claim, positions, readiness, isResponseKindResolved, isViewerResponseResolved } = state;

  // A signed-out visitor gets the sign-in prompt rather than two dead pills, the same way the vote
  // arrows on an entity page do — and through the same hook, which also keeps Privy's session
  // restoration from being mistaken for a login somebody asked for.
  const promptSignIn = usePrivySignIn();
  const control = useClaimPositionControl({ claim, positions, readiness, onRequireSignIn: promptSignIn });
  // See claims-page-client: retiring the optimistic snapshot outlived the toggle that used to own
  // it, because `claim-response-summary` on this page reads that snapshot for display.
  useRetireConfirmedResponseIndexing({ debateClaim: row, entityId, spaceId });
  useBackfillReadinessForHeldPosition({ debateClaim: row, entityId, spaceId });

  return (
    <section aria-label="Your position" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
      {/* No readiness switch — the Debate toggle is gone from the product. Master left the header
          row that used to hold it; with nothing on its right there is no row, just a label. */}
      <Text as="div" variant="metadataMedium" color="grey-04" className="mb-2.5 block">
        Your position
      </Text>
      <PositionRow
        positions={control.optimisticPositions}
        responseKind={readiness.response_kind}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
        // The page had neither gate. It reaches the same two lookups as every card, so a fast press
        // on a factual claim could publish a stance response, and a press on a side the viewer
        // already held could republish it rather than clear it.
        disabled={!control.canRespond || !isResponseKindResolved || !isViewerResponseResolved}
        titleFor={control.actionTitle}
      />
      {control.responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}
      {/* Under the pills rather than up in the hero.
       *
       * On a card the offer ends the meta row because the card has no better place for it. A page
       * does: taking a side and being offered a debate on it are one sequence, and the offer only
       * exists because of the side directly above it. Reading it beside the title asked the reader
       * to connect two things a screen apart. */}
      <ClaimEndSlot
        claimId={entityId}
        spaceId={spaceId}
        activeDebate={row?.active_debate}
        variant="block"
        className="mt-2"
      />
    </section>
  );
}

/**
 * The chip a space homepage uses for its types, reused here for the claim's type, its tags and its
 * topics — the same shape in all three places, since they are the same kind of label.
 *
 * `asChild` is not used: the topic variant is a link and needs its own hover state, so the class
 * string is exported and composed rather than the element being wrapped.
 */
const META_CHIP_CLASS = 'flex h-6 max-w-full items-center rounded border border-grey-02 bg-white px-1.5 text-metadata';

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${META_CHIP_CLASS} text-text`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

function relationsOfType(relations: Relation[] | undefined, propertyId: string): Relation[] {
  return (relations ?? []).filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId));
}
