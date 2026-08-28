'use client';

import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { DebateClaim } from '~/core/debates/api';
import { ClaimDebateReadiness } from '~/core/debates/claim-debate-readiness';
import { useDebateActivity, useDebateClaims } from '~/core/debates/hooks';
import { useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from '~/core/debates/matchmaking/hooks';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { ClaimDebates } from './claim-debates';
import { positionSummariesFromCounts } from './claim-position-summaries';
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
                  className="inline-flex max-w-full items-center rounded-sm bg-grey-01 px-2 py-0.5 text-metadata font-medium text-grey-04"
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

        <ClaimPositionSection
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          positive={summary.positive}
          negative={summary.negative}
        />

        <ClaimDebates claimId={entityId} spaceId={spaceId} responseKind={responseKind} />

        <ClaimProvenance claimId={entityId} claimRelations={entity.relations} spaceId={spaceId} />

        <ClaimRelatedClaims claimId={entityId} spaceId={spaceId} topicIds={topicIds} />
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
  responseKind,
  positive,
  negative,
}: {
  entityId: string;
  spaceId: string;
  responseKind: 'stance' | 'veracity';
  positive: number;
  negative: number;
}) {
  // geo-chat's row carries the viewer's server-side response and their readiness. A claim nobody
  // has answered has no row at all, which is a settled answer rather than a missing one.
  const rowQuery = useDebateClaims(spaceId, [entityId], true);
  const row: DebateClaim | null = rowQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;

  const claim = React.useMemo(
    () => ({
      id: row?.id ?? entityId,
      space_id: spaceId,
      claim_entity_id: entityId,
      claim: '',
      description: null,
    }),
    [entityId, row?.id, spaceId]
  );

  const positions = React.useMemo(
    () => positionSummariesFromCounts(positive, negative, responseKind, row),
    [negative, positive, responseKind, row]
  );

  const readiness = React.useMemo(
    () => ({
      response_kind: row?.response_kind ?? responseKind,
      viewer_response: row?.viewer_response ?? null,
      viewer_debate_ready: row?.viewer_debate_ready ?? false,
      readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
    }),
    [responseKind, row]
  );

  const control = useClaimPositionControl({ claim, positions, readiness });

  return (
    <section aria-label="Your position" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
      {/* Label left, readiness switch right — the same header shape the hub's claim card uses, so
          the control sits where someone who has used the panel already expects it. `items-start`
          so the label stays put when the switch stacks an explanation beneath it. */}
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <Text as="div" variant="metadataMedium" color="grey-04">
          Your position
        </Text>
        <ClaimDebateReadiness
          debateClaim={row}
          entityId={entityId}
          spaceId={spaceId}
          canEnable={!row?.active_debate}
          isLoading={rowQuery.isLoading}
          compact
        />
      </div>
      <PositionRow
        positions={control.optimisticPositions}
        responseKind={readiness.response_kind}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
        disabled={!control.canRespond}
        titleFor={control.actionTitle}
      />
      {control.responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}

      <ClaimMatchup claimId={entityId} spaceId={spaceId} />
    </section>
  );
}

/**
 * The live half of the position card: someone holding the opposite side is online and ready, so
 * there is a debate to be had right now.
 *
 * Reads the same matches the hub's Matches tab does, narrowed to this claim. A match needs three
 * things at once — you standing ready, them standing ready, and opposite responses — so this is
 * absent far more often than it is present, and it stays absent rather than explaining itself.
 * The readiness switch above is where someone goes to become matchable; repeating that here would
 * put a second explanation on a card that already carries the control.
 */
function ClaimMatchup({ claimId, spaceId }: { claimId: string; spaceId: string }) {
  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);
  const createRequest = useCreateDebateRequest();

  const match = (matchesQuery.data?.matches ?? []).find(
    candidate => ID.equals(candidate.claim.claim_entity_id, claimId) && ID.equals(candidate.claim.space_id, spaceId)
  );

  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;
  // Only when the server actually says so — a missing field must not block requesting.
  const unavailable = activity?.available_to_debate === false;
  const blockedReason = unavailable
    ? 'Switch yourself to available to send a request.'
    : outbound
      ? 'Withdraw your open request to send another.'
      : undefined;
  const requestError = createRequest.error instanceof Error ? createRequest.error.message : null;

  if (!match) return null;

  return (
    <div className="mt-3 flex flex-col gap-1 border-t border-divider pt-3">
      <HubPillButton
        onClick={() => createRequest.mutate({ space_id: spaceId, claim_entity_id: claimId })}
        disabled={Boolean(blockedReason)}
        pending={createRequest.isPending}
        pendingLabel="Requesting…"
        className="w-full"
      >
        Request debate
      </HubPillButton>
      {/* Shown rather than left to a `title`: native tooltips never appear on touch and are
          unreliable on a disabled button, which is exactly when the explanation matters. */}
      {blockedReason ? (
        <Text as="p" variant="footnote" color="grey-04">
          {blockedReason}
        </Text>
      ) : null}
      {requestError ? (
        <Text as="p" variant="footnote" color="red-01">
          {requestError}
        </Text>
      ) : null}
    </div>
  );
}

function relationsOfType(relations: Relation[] | undefined, propertyId: string): Relation[] {
  return (relations ?? []).filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, propertyId));
}
