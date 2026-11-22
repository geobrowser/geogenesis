'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { EntityActionCallbacks, PodcastEpisodeSummaryModel, PodcastShowTemplateModel } from '../models';
import {
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  InlinePagination,
  SearchIcon,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
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

const EPISODES_PAGE_SIZE = 10;

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
  const [page, setPage] = React.useState(1);

  const normalizedQuery = episodeFilter.trim().toLowerCase();
  const filteredEpisodes = React.useMemo(() => {
    if (!normalizedQuery) return model.episodes;
    return model.episodes.filter(ep => {
      const hay = `${ep.title} ${ep.description ?? ''}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [model.episodes, normalizedQuery]);

  React.useEffect(() => {
    setPage(1);
  }, [normalizedQuery, model.id]);

  const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / EPISODES_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleEpisodes = filteredEpisodes.slice((safePage - 1) * EPISODES_PAGE_SIZE, safePage * EPISODES_PAGE_SIZE);

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

          {model.episodes.length > 6 && (
            <label className="relative flex w-full max-w-[260px] items-center">
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
        </div>

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

        {(totalPages > 1 || model.hasMoreEpisodes) && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {totalPages > 1 ? (
              <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
            ) : (
              <span />
            )}
            {model.hasMoreEpisodes && model.onLoadMoreEpisodes && (
              <button
                type="button"
                disabled={model.isLoadingMoreEpisodes}
                onClick={model.onLoadMoreEpisodes}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-4 text-[13.5px] font-medium text-text transition-colors hover:border-text disabled:cursor-default disabled:opacity-50"
              >
                {model.isLoadingMoreEpisodes ? 'Loading episodes…' : 'Load more episodes'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Hosts */}
      <PodcastPeopleSection title="Hosts" people={model.hosts} />

      {/* Context & Flags — always present on entity templates */}
      <GraphConnectionsStrip
        groups={model.graphConnections ?? []}
        target={{ id: model.id, kind: 'Podcast', title: model.title }}
      />
      <EntityFlagsSection target={{ id: model.id, kind: 'Podcast', title: model.title }} />

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
