'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import {
  type ClaimSummaryModel,
  type EntityActionCallbacks,
  type PodcastEpisodeTemplateModel,
  type SourceQuoteModel,
} from '../models';
import {
  AddClaimPopover,
  AddEntityItemPopover,
  ClaimExplorer,
  EntityContextAndDisputes,
  EntityContextTogglePill,
  EntityInlineContext,
  EntityOverflowMenu,
  PlayIcon,
  TEMPLATE_CARD_SURFACE,
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

export interface PodcastEpisodeTemplateProps {
  model: PodcastEpisodeTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  className?: string;
}

const INITIAL_VISIBLE_QUOTES = 4;

/**
 * Pure, data-driven Podcast Episode entity template.
 *
 * Combines Geo Podcasts (`../apps/pod`) episode detail structure (artwork, show link, air date &
 * duration, topic chips, expandable description, Notable Claims, Notable Quotes, Hosts, Guests,
 * Apple/Spotify listen buttons + optional inline audio playback) with Geo Genesis's crisp graph
 * styling (Topic-style ClaimExplorer with inline voting & split bars, Context relation pills,
 * Flags, and `+` popovers).
 */
export function PodcastEpisodeTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  className,
}: PodcastEpisodeTemplateProps) {
  const [showAllQuotes, setShowAllQuotes] = React.useState(false);
  const [addedClaims, setAddedClaims] = React.useState<ClaimSummaryModel[]>([]);
  const [addedQuotes, setAddedQuotes] = React.useState<SourceQuoteModel[]>([]);
  const [playerOpen, setPlayerOpen] = React.useState(false);

  const allClaims = [...addedClaims, ...model.claims];
  const agreedClaims = allClaims.filter(claim => (claim.split.totalVotes ?? 0) >= 2 && !claim.split.isSplit);
  const contestedClaims = allClaims.filter(claim => !((claim.split.totalVotes ?? 0) >= 2 && !claim.split.isSplit));

  const allQuotes = [...addedQuotes, ...model.quotes];
  const visibleQuotes = showAllQuotes ? allQuotes : allQuotes.slice(0, INITIAL_VISIBLE_QUOTES);
  const hiddenQuoteCount = Math.max(0, allQuotes.length - INITIAL_VISIBLE_QUOTES);

  const artworkUrl = model.artworkUrl ?? model.show?.artworkUrl;
  const metaParts = [
    model.episodeNumber !== undefined ? `Ep. ${model.episodeNumber}` : undefined,
    model.airDate,
    model.durationLabel,
  ].filter(Boolean);

  return (
    <TemplateShell
      maxWidth={980}
      breadcrumbs={model.breadcrumbs}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      {/* Split artwork + episode identity header */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-5 @[560px]:flex-row @[560px]:items-start">
          <PodcastArtwork
            src={artworkUrl}
            alt={model.title}
            className={cx(
              'rounded-2xl shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)]',
              compact ? 'size-24' : 'size-28 @[640px]:size-36'
            )}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {/* On a phone the actions sit above the title instead of beside it, or they squeeze the title
                into a column a few words wide (same as the Event header). */}
            <div className="flex flex-col-reverse gap-2 @[560px]:flex-row @[560px]:items-start @[560px]:justify-between @[560px]:gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <TemplateBadge tone="episode">Episode</TemplateBadge>

                  {model.show &&
                    (model.show.href ? (
                      <Link
                        href={model.show.href}
                        className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-text no-underline transition-colors hover:text-[#4c1fd4]"
                      >
                        {model.show.artworkUrl && (
                          <PodcastArtwork
                            src={model.show.artworkUrl}
                            alt={model.show.name}
                            className="size-5 rounded"
                          />
                        )}
                        <span>{model.show.name}</span>
                      </Link>
                    ) : model.show.onSelect ? (
                      <button
                        type="button"
                        onClick={model.show.onSelect}
                        className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[14.5px] font-semibold text-text transition-colors hover:text-[#4c1fd4]"
                      >
                        <span>{model.show.name}</span>
                      </button>
                    ) : (
                      <span className="text-[14.5px] font-semibold text-text">{model.show.name}</span>
                    ))}

                  {metaParts.length > 0 && (
                    <span className="text-[14px] text-grey-04 tabular-nums">{metaParts.join(' · ')}</span>
                  )}
                </div>

                <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-end @[560px]:self-auto @[560px]:pt-1">
                <EntityContextTogglePill />
                {headerActions ?? (
                  <EntityOverflowMenu
                    target={{ id: model.id, kind: 'Episode', title: model.title }}
                    isPageRoot
                    size="md"
                  />
                )}
              </div>
            </div>

            <PodcastTopicChips topics={model.topics} />

            {(model.audioUrl || model.listenOn.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {model.audioUrl && (
                  <button
                    type="button"
                    onClick={() => setPlayerOpen(prev => !prev)}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-text bg-text px-4 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <PlayIcon className="size-3.5" />
                    <span>{playerOpen ? 'Hide audio player' : 'Play episode'}</span>
                  </button>
                )}
                <PodcastPlatformButtons platforms={model.listenOn} />
              </div>
            )}
          </div>
        </div>

        {playerOpen && model.audioUrl && (
          <div className={cx('flex flex-col gap-2 p-3.5', TEMPLATE_CARD_SURFACE)}>
            <audio controls autoPlay preload="metadata" src={model.audioUrl} className="h-10 w-full">
              Your browser does not support embedded audio playback.
            </audio>
          </div>
        )}

        <EntityInlineContext targetId={model.id} targetTitle={model.title} targetKind="Episode" />
      </header>

      {/* Expandable episode description */}
      <PodcastExpandableDescription description={model.description} />

      {/* Notable claims — rendered identically to Topic pages via ClaimExplorer */}
      {allClaims.length > 0 ? (
        <ClaimExplorer contestedClaims={contestedClaims} agreedClaims={agreedClaims} title="Notable claims" />
      ) : (
        <section aria-label="Notable claims" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">Notable claims</h2>
            <AddClaimPopover
              label="Add notable claim"
              onSubmit={draft => {
                actionCallbacks?.onAddClaim?.(draft);
                setAddedClaims(prev => [
                  {
                    id: `ep-claim-${Date.now()}`,
                    title: draft.title,
                    kind: draft.kind,
                    split: { rows: [], isSplit: false },
                  },
                  ...prev,
                ]);
              }}
            />
          </div>
          <p className="m-0 text-[14.5px] text-grey-04">No notable claims extracted yet.</p>
        </section>
      )}

      {/* Notable quotes */}
      {(allQuotes.length > 0 || actionCallbacks?.onAddQuote) && (
        <section aria-label="Notable quotes" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">Notable quotes</h2>
            <AddEntityItemPopover
              label="Add notable quote"
              primaryLabel="Quote"
              primaryPlaceholder="Exact quote from the episode…"
              secondaryLabel="Speaker (optional)"
              secondaryPlaceholder="e.g. Guest or host name"
              onSubmit={({ primary, secondary }) => {
                actionCallbacks?.onAddQuote?.({ text: primary, speaker: secondary || undefined });
                setAddedQuotes(prev => [
                  {
                    id: `ep-quote-${Date.now()}`,
                    text: primary,
                    speaker: secondary || undefined,
                  },
                  ...prev,
                ]);
              }}
            />
          </div>

          {visibleQuotes.length === 0 ? (
            <p className="m-0 text-[14.5px] text-grey-04">No notable quotes added yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleQuotes.map(quote => (
                <blockquote
                  key={quote.id}
                  className={cx(
                    'group/quote m-0 flex items-start justify-between gap-3 border-l-[3px] border-l-text/15 p-4',
                    TEMPLATE_CARD_SURFACE
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="m-0 text-[15.5px] leading-[24px] text-text">“{quote.text}”</p>
                    {(quote.speaker || quote.location) && (
                      <footer className="text-[13px] text-grey-04">
                        {[quote.speaker, quote.location].filter(Boolean).join(' · ')}
                      </footer>
                    )}
                    <EntityInlineContext targetId={quote.id} targetTitle={quote.text} targetKind="Quote" />
                  </div>
                  <EntityOverflowMenu target={{ id: quote.id, kind: 'Quote', title: quote.text }} />
                </blockquote>
              ))}
            </div>
          )}

          {hiddenQuoteCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllQuotes(prev => !prev)}
              className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13.5px] font-medium text-grey-04 transition-colors hover:text-text"
            >
              {showAllQuotes ? 'Show less' : `Show ${hiddenQuoteCount} more quotes`}
            </button>
          )}
        </section>
      )}

      {/* Hosts, Guests & Contributors */}
      <PodcastPeopleSection title="Hosts" people={model.hosts} />
      <PodcastPeopleSection title="Guests" people={model.guests} />
      {model.contributors && model.contributors.length > 0 && (
        <PodcastPeopleSection title="Contributors" people={model.contributors} />
      )}

      {/* Context & Disputes side-by-side */}
      <EntityContextAndDisputes
        groups={model.graphConnections}
        target={{ id: model.id, kind: 'Episode', title: model.title }}
      />

      {footer}
    </TemplateShell>
  );
}
