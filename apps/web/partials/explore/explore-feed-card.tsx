'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { useRecordingSources } from '~/core/community-calls/use-recording-sources';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { PublishedRecordingPlayer } from '~/partials/community-calls/published-recording-player';
import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { ClaimExploreFeedCard } from './claim-explore-feed-card';
import { DebateExploreFeedCard } from './debate-explore-feed-card';
import { ExploreCommentsIcon } from './explore-comments-icon';
import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { RankingCardBody } from './explore-ranking-card-body';
import { MetaDot } from './meta-dot';

type ExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row. Useful when the card is rendered inside the space it references (e.g. the activity tab). */
  hideSpaceLink?: boolean;
  /** Hide the Join button next to the space name. */
  hideJoinButton?: boolean;
};

function SpaceThumb({ image, name }: { image: string | null; name: string }) {
  if (!image) {
    const initial = name.trim().slice(0, 1).toUpperCase() || '?';
    return (
      <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-[4px] bg-grey-01 text-[8px] font-medium text-grey-04">
        {initial}
      </span>
    );
  }
  return (
    <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-[4px] bg-grey-01">
      <FallbackImage value={image} sizes="24px" className="object-cover" />
    </span>
  );
}

function ExploreFeedCommentLink({ href, count }: { href: string; count: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 transition-colors hover:text-grey-04">
      <ExploreCommentsIcon className="text-grey-03" />
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}

const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();
const COMMUNITY_CALL_EVENT_TYPE = normalizeId(EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE);
const DEBATE_TYPE = normalizeId(DEBATE_TYPE_ID);
const CLAIM_TYPE = normalizeId(CLAIM_TYPE_ID);
const RANKING_BLOCK_TYPE = normalizeId(RANKING_BLOCK_TYPE_ID);

function CardTitle({ item }: { item: ExploreFeedItem }) {
  return (
    <Link href={NavUtils.toEntity(item.spaceId, item.entityId)}>
      <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline">
        {item.title}
      </h2>
    </Link>
  );
}

type CardBodyProps = {
  item: ExploreFeedItem;
  /** The vote / comment row, owned by the shell so bodies render it identically. Not every body takes it. */
  actions: React.ReactNode;
};

/** The default body: thumbnail on the left, title and description beside it. */
function DefaultCardBody({ item, actions }: CardBodyProps) {
  return (
    <div className="flex items-start gap-4">
      {item.imageUrl ? (
        <Link
          href={NavUtils.toEntity(item.spaceId, item.entityId)}
          className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-grey-01"
        >
          <FallbackImage value={item.imageUrl} sizes="120px" className="object-cover" />
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <CardTitle item={item} />
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-[16px]! leading-[20px]! font-normal! tracking-[-0.03em] text-grey-04">
              {item.description}
            </p>
          ) : null}
        </div>

        {actions}
      </div>
    </div>
  );
}

/** A Community call event's body */
function CommunityCallCardBody({ item, actions }: CardBodyProps) {
  const sources = useRecordingSources({
    entityId: item.entityId,
    spaceId: item.spaceId,
    serverRecordingUrls: item.recordingUrls,
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CardTitle item={item} />
      {sources.length > 0 ? (
        <div className="w-full max-w-[773px]">
          <PublishedRecordingPlayer
            sources={sources}
            spaceId={item.spaceId}
            videoClassName="aspect-[773/435] rounded-xl object-contain"
          />
        </div>
      ) : null}
      {actions}
    </div>
  );
}

/**
 * Debates get the same custom rendition they have on the full-screen `/debates` feed — the two
 * debater videos with winner voting — from `DebateExploreFeedCard` (added in #2129), which
 * viewport-gates its geo-chat lookups (the feed pre-mounts cards ~8000px below the fold, so an
 * ungated debate would start fetching video on mount) and falls back to the generic card whenever
 * the debate can't actually be watched. Everything else renders one of the bodies below.
 */
export function ExploreFeedCard(props: ExploreFeedCardProps) {
  const isDebate = props.item.types.some(type => normalizeId(type.id) === DEBATE_TYPE);
  if (isDebate) {
    return (
      <DebateExploreFeedCard
        item={props.item}
        hideSpaceLink={props.hideSpaceLink}
        hideJoinButton={props.hideJoinButton}
        fallback={<BaseExploreFeedCard {...props} />}
      />
    );
  }

  // Claims get the card built for them — labelled position pills, an evidence-scaled verdict, and
  // no thumbnail well they have no image to fill. Narrowly gated on purpose: every other type keeps
  // the generic card exactly as it was, so this changes what a Claim looks like and nothing else.
  const isClaim = props.item.types.some(type => normalizeId(type.id) === CLAIM_TYPE);
  if (isClaim) {
    return (
      <ClaimExploreFeedCard
        item={props.item}
        hideSpaceLink={props.hideSpaceLink}
        hideJoinButton={props.hideJoinButton}
      />
    );
  }

  return <BaseExploreFeedCard {...props} />;
}

function BaseExploreFeedCard({ item, hideSpaceLink = false, hideJoinButton = false }: ExploreFeedCardProps) {
  const isCommunityCall = item.types.some(type => normalizeId(type.id) === COMMUNITY_CALL_EVENT_TYPE);
  const isRanking = item.types.some(type => normalizeId(type.id) === RANKING_BLOCK_TYPE);
  const uniqueTypes = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const t of item.types) {
      if (!t.name) continue;
      const key = t.id.replace(/-/g, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const name = key === RANKING_BLOCK_TYPE ? 'Ranking' : t.name;
      out.push({ id: t.id, name });
    }
    return out;
  }, [item.types]);
  const timeAgo = formatExploreRelativeTime(item.createdAtSec);

  const entityHref = `${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`;
  const showJoin = !hideJoinButton && !item.isMemberOrEditor;
  const showSpace = !hideSpaceLink;

  const dottedSegments: React.ReactNode[] = [];

  if (showJoin) {
    dottedSegments.push(
      <ExploreJoinSpaceButton
        key="join"
        spaceId={item.spaceId}
        hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
        variant="compact"
        label="Join"
      />
    );
  }

  if (uniqueTypes.length > 0) {
    dottedSegments.push(
      <span
        key="types"
        className="inline-flex min-w-0 flex-wrap items-center text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04"
      >
        {uniqueTypes.map((t, index) => (
          <React.Fragment key={t.id}>
            {index > 0 ? <MetaDot /> : null}
            <span className="truncate">{t.name}</span>
          </React.Fragment>
        ))}
      </span>
    );
  }

  if (timeAgo) {
    dottedSegments.push(
      <span key="time" className="shrink-0 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04">
        {timeAgo}
      </span>
    );
  }

  const cardActions = (
    <EntityRowActions entityId={item.entityId} spaceId={item.spaceId} className="mt-1">
      <ExploreFeedCommentLink href={entityHref} count={item.commentCount} />
    </EntityRowActions>
  );

  return (
    <article className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      {showSpace || dottedSegments.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-y-2">
          {showSpace ? (
            <Link
              href={NavUtils.toSpace(item.spaceId)}
              className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline"
            >
              <SpaceThumb image={item.spaceImage} name={item.spaceName} />
              <span className="min-w-0 truncate">{item.spaceName}</span>
            </Link>
          ) : null}
          {showSpace && dottedSegments.length > 0 ? <span className="w-1.5 shrink-0" /> : null}
          {dottedSegments.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <MetaDot /> : null}
              {segment}
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {isCommunityCall ? (
        <CommunityCallCardBody item={item} actions={cardActions} />
      ) : isRanking ? (
        <RankingCardBody item={item} actions={cardActions} />
      ) : (
        <DefaultCardBody item={item} actions={cardActions} />
      )}
    </article>
  );
}
