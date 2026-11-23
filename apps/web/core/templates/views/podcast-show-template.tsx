'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { EntityActionCallbacks, PodcastEpisodeSummaryModel, PodcastShowTemplateModel } from '../models';
import {
  EntityContextAndDisputes,
  EntityContextTogglePill,
  EntityInlineContext,
  EntityOverflowMenu,
  ListRankingHeaderControl,
  ListRankingWorkspace,
  type RankableListItem,
  SearchIcon,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  useListRanking,
} from '../primitives';
import {
  PodcastArtwork,
  PodcastExpandableDescription,
  PodcastPeopleSection,
  PodcastPlatformButtons,
  PodcastTopicChips,
} from './podcast-shared';

export interface PodcastShowTemplateProps {
  model: PodcastShowTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  className?: string;
}

/**
 * Pure, data-driven Podcast Show entity template.
 *
 * Adapts Geo Podcasts (`../apps/pod`) show detail pages (square artwork, episode count & years
 * active, topic tags, expandable description, episode cards, host portraits, Apple/Spotify/RSS
 * listen links) into Geo Genesis's crisp light-mode knowledge graph template system.
 */
export function PodcastShowTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  className,
}: PodcastShowTemplateProps) {
  const [episodeFilter, setEpisodeFilter] = React.useState('');

  const ranking = useListRanking({
    listKey: `podcast-episodes:${model.id}`,
    items: model.episodes,
  });

  const rankableEpisodes = React.useMemo<RankableListItem[]>(
    () =>
      model.episodes.map(ep => ({
        id: ep.id,
        title: ep.title,
        meta: [ep.airDate, ep.durationLabel].filter(Boolean).join(' · ') || undefined,
        imageUrl: ep.artworkUrl ?? model.artworkUrl,
      })),
    [model.artworkUrl, model.episodes]
  );

  const normalizedQuery = episodeFilter.trim().toLowerCase();
  const filteredEpisodes = React.useMemo(() => {
    const source = ranking.orderedItems;
    if (!normalizedQuery) return source;
    return source.filter(ep => {
      const hay = `${ep.title} ${ep.description ?? ''}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [normalizedQuery, ranking.orderedItems]);

  // Every loaded episode is shown; "Load more episodes" fetches the next batch from the server. Page
  // numbers on top of that only paged what was already loaded, so the list had two pagers (GEO-3819).
  const visibleEpisodes = filteredEpisodes;

  const metaParts = [
    model.episodeCount > 0
      ? `${model.episodeCount.toLocaleString('en-US')} ${model.episodeCount === 1 ? 'episode' : 'episodes'}`
      : undefined,
    model.dateRange,
  ].filter(Boolean);

  return (
    <TemplateShell
      maxWidth={960}
      breadcrumbs={model.breadcrumbs}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      {/* Split artwork + show identity header */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-5 @[560px]:flex-row @[560px]:items-start">
          <PodcastArtwork
            src={model.artworkUrl}
            alt={model.title}
            className={cx(
              'rounded-2xl shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)]',
              compact ? 'size-24' : 'size-28 @[640px]:size-36'
            )}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <TemplateBadge tone="podcast">Podcast</TemplateBadge>
                  {metaParts.length > 0 && (
                    <span className="text-[14px] text-grey-04 tabular-nums">{metaParts.join(' · ')}</span>
                  )}
                </div>
                <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
              </div>

              <div className="flex shrink-0 items-center gap-2 pt-1">
                <EntityContextTogglePill />
                {headerActions ?? (
                  <EntityOverflowMenu
                    target={{ id: model.id, kind: 'Podcast', title: model.title }}
                    isPageRoot
                    size="md"
                  />
                )}
              </div>
            </div>

            <PodcastTopicChips topics={model.topics} />

            <PodcastPlatformButtons platforms={model.listenOn} rssFeedUrl={model.rssFeedUrl} className="pt-1" />
          </div>
        </div>

        <EntityInlineContext targetId={model.id} targetTitle={model.title} targetKind="Podcast" />
      </header>

      {/* Expandable show description */}
      <PodcastExpandableDescription description={model.description} />

      {/* Episodes list / grid */}
      <section aria-label="Episodes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">Episodes</h2>

          <div className="flex flex-wrap items-center gap-2">
            {model.episodes.length > 6 && (
              <label className="relative flex w-full max-w-[240px] items-center">
                <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-grey-04" />
                <input
                  type="search"
                  value={episodeFilter}
                  onChange={event => setEpisodeFilter(event.target.value)}
                  placeholder="Filter episodes…"
                  aria-label="Filter episodes"
                  className="h-8 w-full rounded-full border border-grey-02 bg-white pr-3 pl-8 text-[13.5px] text-text placeholder:text-grey-04 focus:border-text focus:outline-none"
                />
              </label>
            )}
            <ListRankingHeaderControl
              title="Episodes"
              hasMyRanking={ranking.hasMyRanking}
              viewMode={ranking.viewMode}
              onViewModeChange={ranking.setViewMode}
              onOpen={ranking.open}
              disabled={model.episodes.length < 2}
            />
          </div>
        </div>

        <ListRankingWorkspace
          open={ranking.isOpen}
          title={`${model.title} · Episodes`}
          items={rankableEpisodes}
          initialOrder={ranking.myOrder}
          onClose={ranking.close}
          onPublish={ranking.publish}
        />

        {visibleEpisodes.length === 0 ? (
          <p className="m-0 text-[14.5px] text-grey-04">
            {normalizedQuery ? `No loaded episodes match “${episodeFilter.trim()}”.` : 'No episodes available yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 @[680px]:grid-cols-2">
            {visibleEpisodes.map(episode => (
              <ShowEpisodeCard
                key={episode.id}
                episode={episode}
                fallbackArtworkUrl={model.artworkUrl}
                showName={model.title}
              />
            ))}
          </div>
        )}

        {model.hasMoreEpisodes && model.onLoadMoreEpisodes && (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <button
              type="button"
              disabled={model.isLoadingMoreEpisodes}
              onClick={model.onLoadMoreEpisodes}
              className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-4 text-[13.5px] font-medium text-text transition-colors hover:border-text disabled:cursor-default disabled:opacity-50"
            >
              {model.isLoadingMoreEpisodes ? 'Loading episodes…' : 'Load more episodes'}
            </button>
          </div>
        )}
      </section>

      {/* Hosts */}
      <PodcastPeopleSection title="Hosts" people={model.hosts} />

      {/* Context & Disputes side-by-side */}
      <EntityContextAndDisputes
        groups={model.graphConnections}
        target={{ id: model.id, kind: 'Podcast', title: model.title }}
      />

      {footer}
    </TemplateShell>
  );
}

function ShowEpisodeCard({
  episode,
  fallbackArtworkUrl,
  showName,
}: {
  episode: PodcastEpisodeSummaryModel;
  fallbackArtworkUrl?: string | null;
  showName: string;
}) {
  const metaParts = [
    episode.episodeNumber !== undefined ? `Ep. ${episode.episodeNumber}` : undefined,
    episode.airDate,
    episode.durationLabel,
  ].filter(Boolean);

  const titleEl = (
    <span className="line-clamp-2 text-[15.5px] leading-[21px] font-semibold text-pretty text-text transition-colors group-hover/ep:text-[#4c1fd4]">
      {episode.title}
    </span>
  );

  return (
    <article className={cx('group/ep flex flex-col gap-3 p-4', TEMPLATE_INTERACTIVE_CARD_SURFACE)}>
      <div className="flex items-start gap-3.5">
        <PodcastArtwork
          src={episode.artworkUrl ?? fallbackArtworkUrl}
          alt={episode.title}
          className="size-14 rounded-lg"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            {episode.href ? (
              <Link href={episode.href} className="min-w-0 flex-1 text-text no-underline">
                {titleEl}
              </Link>
            ) : episode.onSelect ? (
              <button
                type="button"
                onClick={episode.onSelect}
                className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-text"
              >
                {titleEl}
              </button>
            ) : (
              titleEl
            )}
            <EntityOverflowMenu target={{ id: episode.id, kind: 'Episode', title: episode.title }} />
          </div>

          <span className="truncate text-[13px] text-grey-04">{episode.showName ?? showName}</span>
        </div>
      </div>

      {episode.description && (
        <p className="m-0 line-clamp-2 text-[14px] leading-[21px] [overflow-wrap:anywhere] text-grey-05">
          {episode.description}
        </p>
      )}

      {metaParts.length > 0 && (
        <div className="mt-auto flex items-center gap-1.5 text-[13px] text-grey-04 tabular-nums">
          <span>{metaParts.join(' · ')}</span>
        </div>
      )}

      <EntityInlineContext targetId={episode.id} targetTitle={episode.title} targetKind="Episode" />
    </article>
  );
}
