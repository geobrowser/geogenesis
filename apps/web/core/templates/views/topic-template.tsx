'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicTemplateModel, TopicTimelineHighlightModel } from '../models';
import {
  ArrowRightIcon,
  ChevronRightIcon,
  ClaimExplorer,
  EntityOverflowMenu,
  RecentDebatesGallery,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
} from '../primitives';

export interface TopicTemplateProps {
  model: TopicTemplateModel;
  /** Optional header actions slot (e.g. Follow button, overflow menu on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Optional footer slot (e.g. edit-mode property sheet & backlinks). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Pure, data-driven Topic page template.
 *
 * Clean, spacious white/black Geo layout sized to Calibre typography with restrained blue/purple touches.
 */
export function TopicTemplate({ model, headerActions, footer, className }: TopicTemplateProps) {
  const contested = model.contestedClaims ?? [];
  const agreed = model.agreedClaims ?? [];

  const communities = model.communities ?? [];
  const activeCommunityId = model.activeCommunityId ?? 'all';

  const inlineStats = model.stats?.filter(stat => Boolean(stat.value)) ?? [];

  return (
    <TemplateShell maxWidth={1120} breadcrumbs={model.breadcrumbs} className={className}>
      {/* Hero header */}
      <header className="flex flex-col gap-5">
        {model.coverUrl && (
          <div className={cx('overflow-hidden', TEMPLATE_CARD_SURFACE)}>
            <img src={model.coverUrl} alt={model.title} className="max-h-[280px] w-full object-cover" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <TemplateBadge tone="neutral">Topic</TemplateBadge>
            {model.tags?.map(tag => (
              <TemplateBadge key={tag} tone="neutral">
                {tag}
              </TemplateBadge>
            ))}
            {inlineStats.length > 0 && (
              <span className="text-[14px] text-grey-04">
                {inlineStats.map(stat => `${stat.value} ${stat.label.toLowerCase()}`).join(' · ')}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <EntityOverflowMenu target={{ id: model.id, kind: 'Topic', title: model.title }} size="md" />
          </div>
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>

        {model.lede && <p className="m-0 max-w-[780px] text-[16.5px] leading-[25px] text-text/85">{model.lede}</p>}
      </header>

      {/* Community perspective filter bar */}
      {communities.length > 0 && (
        <section aria-label="Community view" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={activeCommunityId === 'all'}
            onClick={() => model.onSelectCommunity?.('all')}
            className={cx(
              'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors',
              activeCommunityId === 'all'
                ? 'border-text bg-text text-white'
                : 'border-grey-02 bg-white text-text hover:border-text'
            )}
          >
            <span>Everyone</span>
          </button>

          {communities.map(community => {
            const isSelected = activeCommunityId === community.id;
            return (
              <button
                key={community.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => model.onSelectCommunity?.(community.id)}
                className={cx(
                  'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors',
                  isSelected ? 'border-text bg-text text-white' : 'border-grey-02 bg-white text-text hover:border-text'
                )}
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: community.color }}
                />
                <span>{community.name}</span>
                {community.memberCount !== undefined && (
                  <span className={cx('text-[14px] tabular-nums', isSelected ? 'text-grey-03' : 'text-grey-04')}>
                    {community.memberCount.toLocaleString('en-US')}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}

      {/* Calm single-column Claims list with 2-tab switch (Where they split | Common ground) */}
      {(contested.length > 0 || agreed.length > 0) && (
        <ClaimExplorer contestedClaims={contested} agreedClaims={agreed} title="Claims" />
      )}

      {/* Recent debates gallery (horizontal snap-scroll cards matching Genesis's debate gallery) */}
      {model.recentDebates && model.recentDebates.length > 0 && <RecentDebatesGallery debates={model.recentDebates} />}

      {/* Timeline (rendered open directly on the page) */}
      {model.timelineHighlights && model.timelineHighlights.length > 0 && (
        <section id="timeline" aria-label="Timeline" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">Timeline</h2>
            {model.timelineHref ? (
              <Link
                href={model.timelineHref}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>Full timeline</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : model.onOpenTimeline ? (
              <button
                type="button"
                onClick={model.onOpenTimeline}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <span>Full timeline</span>
                <ArrowRightIcon className="size-4" />
              </button>
            ) : null}
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {model.timelineHighlights.map((turn, idx) => (
              <TimelineHighlightRow
                key={turn.id}
                turn={turn}
                isFirst={idx === 0}
                isLast={idx === (model.timelineHighlights?.length ?? 0) - 1}
              />
            ))}
          </ol>
        </section>
      )}

      {/* Sources & evidence (and additional structured sections) */}
      {model.sections && model.sections.length > 0 && (
        <div id="sources-section" className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {footer}
    </TemplateShell>
  );
}

function TimelineHighlightRow({
  turn,
  isFirst,
  isLast,
}: {
  turn: TopicTimelineHighlightModel;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isInteractive = Boolean(turn.href || turn.onSelect);

  const body = (
    <span className="flex min-w-0 flex-1 items-start justify-between gap-4">
      <span className="flex max-w-[740px] min-w-0 flex-col gap-1">
        <span
          className={cx(
            'text-[17px] leading-[23px] font-semibold text-pretty text-text transition-colors',
            isInteractive && 'group-hover:text-ctaPrimary'
          )}
        >
          {turn.title}
        </span>
        {turn.summary && <span className="text-[15px] leading-[22px] text-grey-04">{turn.summary}</span>}
      </span>

      {isInteractive && (
        <ChevronRightIcon className="mt-1 size-4 shrink-0 text-grey-03 transition-transform group-hover:translate-x-0.5 group-hover:text-ctaPrimary" />
      )}
    </span>
  );

  return (
    <li className="grid grid-cols-1 gap-2 @[680px]:grid-cols-[118px_28px_minmax(0,1fr)] @[680px]:gap-4">
      {/* Left date */}
      <div className="pt-4 text-[14px] font-semibold text-grey-04 @[680px]:pt-5 @[680px]:text-right">{turn.when}</div>

      {/* Continuous vertical timeline spine directly on page */}
      <div className="relative hidden justify-center @[680px]:flex">
        {!isFirst && <span aria-hidden className="absolute top-0 h-[26px] w-[2px] bg-grey-02/80" />}
        {!isLast && <span aria-hidden className="absolute top-[26px] bottom-0 w-[2px] bg-grey-02/80" />}
        <span
          aria-hidden
          className="relative z-10 mt-[21px] inline-block size-3 shrink-0 rounded-full bg-text ring-4 ring-white"
        />
      </div>

      {/* Right: event milestone headline + concise summary + overflow menu */}
      <div
        className={cx(
          'flex min-w-0 items-start justify-between gap-3 py-4 @[680px]:py-5',
          !isLast && 'border-b border-divider/90'
        )}
      >
        {turn.href ? (
          <Link href={turn.href} className="group flex min-w-0 flex-1 text-left text-text no-underline">
            {body}
          </Link>
        ) : turn.onSelect ? (
          <button
            type="button"
            onClick={turn.onSelect}
            className="group flex min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-text"
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1">{body}</div>
        )}

        <EntityOverflowMenu target={{ id: turn.id, kind: 'Event', title: turn.title }} className="mt-0.5" />
      </div>
    </li>
  );
}
