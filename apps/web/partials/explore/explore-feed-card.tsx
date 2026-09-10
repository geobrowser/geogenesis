'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import { useRecordingSources } from '~/core/community-calls/use-recording-sources';
import { isDebateEntity } from '~/core/debates/is-debate-entity';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { PublishedRecordingPlayer } from '~/partials/community-calls/published-recording-player';
import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { ClaimExploreFeedCard } from './claim-explore-feed-card';
import { DebateExploreFeedCard } from './debate-explore-feed-card';
import { ExploreCardEntityLink } from './explore-card-entity-link';
import { ExploreCommentsIcon } from './explore-comments-icon';
import { ExploreMetaRow } from './explore-meta-row';
import { RankingCardBody } from './explore-ranking-card-body';

type ExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row. Useful when the card is rendered inside the space it references (e.g. the activity tab). */
  hideSpaceLink?: boolean;
  /** Hide the Join button next to the space name. */
  hideJoinButton?: boolean;
  /**
   * Whether clicking the entity name opens it in the side panel rather than navigating (GEO-2757).
   * Explore turns this on; the other surfaces this card serves keep navigating.
   */
  titleOpensSidePanel?: boolean;
};

function ExploreFeedCommentLink({ href, count }: { href: string; count: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 transition-colors hover:text-grey-04">
      <ExploreCommentsIcon className="text-grey-03" />
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}

const COMMUNITY_CALL_EVENT_TYPE = normId(EVENT_SCHEMA.COMMUNITY_CALL_EVENT_TYPE);
const CLAIM_TYPE = normId(CLAIM_TYPE_ID);
const RANKING_BLOCK_TYPE = normId(RANKING_BLOCK_TYPE_ID);

function CardTitle({ item, opensSidePanel }: { item: ExploreFeedItem; opensSidePanel: boolean }) {
  return (
    <ExploreCardEntityLink item={item} opensSidePanel={opensSidePanel}>
      <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline">
        {item.title}
      </h2>
    </ExploreCardEntityLink>
  );
}

type CardBodyProps = {
  item: ExploreFeedItem;
  /** The vote / comment row, owned by the shell so bodies render it identically. Not every body takes it. */
  actions: React.ReactNode;
  /** Threaded to the title only. The thumbnail beside it still navigates — see `BaseExploreFeedCard`. */
  titleOpensSidePanel: boolean;
};

/** The default body: thumbnail on the left, title and description beside it. */
function DefaultCardBody({ item, actions, titleOpensSidePanel }: CardBodyProps) {
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
          <CardTitle item={item} opensSidePanel={titleOpensSidePanel} />
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
function CommunityCallCardBody({ item, actions, titleOpensSidePanel }: CardBodyProps) {
  const sources = useRecordingSources({
    entityId: item.entityId,
    spaceId: item.spaceId,
    serverRecordingUrls: item.recordingUrls,
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CardTitle item={item} opensSidePanel={titleOpensSidePanel} />
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
  const isDebate = isDebateEntity(props.item.types);
  if (isDebate) {
    return (
      <DebateExploreFeedCard
        item={props.item}
        hideSpaceLink={props.hideSpaceLink}
        hideJoinButton={props.hideJoinButton}
        titleOpensSidePanel={props.titleOpensSidePanel}
        fallback={<BaseExploreFeedCard {...props} />}
      />
    );
  }

  // Claims get the card built for them — labelled position pills, the shared verdict, and no
  // thumbnail well they have no image to fill. Narrowly gated on purpose: every other type keeps
  // the generic card exactly as it was, so this changes what a Claim looks like and nothing else.
  const isClaim = props.item.types.some(type => normId(type.id) === CLAIM_TYPE);
  if (isClaim) {
    return (
      <ClaimExploreFeedCard
        item={props.item}
        hideSpaceLink={props.hideSpaceLink}
        hideJoinButton={props.hideJoinButton}
        titleOpensSidePanel={props.titleOpensSidePanel}
      />
    );
  }

  return <BaseExploreFeedCard {...props} />;
}

function BaseExploreFeedCard({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
}: ExploreFeedCardProps) {
  const isCommunityCall = item.types.some(type => normId(type.id) === COMMUNITY_CALL_EVENT_TYPE);
  const isRanking = item.types.some(type => normId(type.id) === RANKING_BLOCK_TYPE);
  const entityHref = `${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`;
  const cardActions = (
    <EntityRowActions entityId={item.entityId} spaceId={item.spaceId} className="mt-1">
      <ExploreFeedCommentLink href={entityHref} count={item.commentCount} />
    </EntityRowActions>
  );

  return (
    <article className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      <ExploreMetaRow item={item} hideSpaceLink={hideSpaceLink} hideJoinButton={hideJoinButton} />

      {isCommunityCall ? (
        <CommunityCallCardBody item={item} actions={cardActions} titleOpensSidePanel={titleOpensSidePanel} />
      ) : isRanking ? (
        <RankingCardBody item={item} actions={cardActions} titleOpensSidePanel={titleOpensSidePanel} />
      ) : (
        <DefaultCardBody item={item} actions={cardActions} titleOpensSidePanel={titleOpensSidePanel} />
      )}
    </article>
  );
}
