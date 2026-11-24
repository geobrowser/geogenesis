'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { EntityActionCallbacks, TopicTemplateModel, TopicTimelineHighlightModel } from '../models';
import {
  AddEntityItemPopover,
  ArrowRightIcon,
  ChevronRightIcon,
  ClaimExplorer,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RecentDebatesGallery,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  TemplateTitleRow,
} from '../primitives';

export interface TopicTemplateProps {
  model: TopicTemplateModel;
  /** Optional header actions slot (e.g. Follow button, overflow menu on live Geo pages). */
  headerActions?: React.ReactNode;
  /** Optional footer slot (e.g. edit-mode property sheet & backlinks). */
  footer?: React.ReactNode;
  /** Live GRC-20 persistence & search callbacks. */
  actionCallbacks?: EntityActionCallbacks;
  /** Compact density when rendered inside the narrow entity side panel. */
  compact?: boolean;
  /** Embedded inside a Topic Space shell: omits duplicate cover, breadcrumbs, H1, and lede. */
  embedded?: boolean;
  /** True briefly during initial client hydration so sections reveal calmly instead of popping in one by one. */
  isLoadingSections?: boolean;
  className?: string;
}

/**
 * Pure, data-driven Topic page template.
 *
 * Clean, spacious white/black Geo layout sized to Calibre typography with restrained blue/purple touches.
 */
export function TopicTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  embedded = false,
  isLoadingSections = false,
  className,
}: TopicTemplateProps) {
  const contested = model.contestedClaims ?? [];
  const agreed = model.agreedClaims ?? [];
  const [addedTimelineTurns, setAddedTimelineTurns] = React.useState<TopicTimelineHighlightModel[]>([]);
  const [subtopicsExpanded, setSubtopicsExpanded] = React.useState(false);
  const timelineHighlights = [...addedTimelineTurns, ...(model.timelineHighlights ?? [])];
  const subtopics = model.subtopics ?? [];
  const visibleSubtopics = subtopicsExpanded ? subtopics : subtopics.slice(0, 10);
  const hiddenSubtopicsCount = Math.max(0, subtopics.length - 10);
  const hasContextOrLive = (model.graphConnections && model.graphConnections.length > 0) || Boolean(actionCallbacks);
  const hasFlagsOrLive = Boolean(model.contextByEntityId?.[model.id]?.flags?.length) || Boolean(actionCallbacks);

  const subtopicsNav =
    subtopics.length > 0 ? (
      <nav aria-label="Subtopics" className={cx('flex flex-wrap items-center gap-1.5', !embedded && 'mt-1')}>
        {visibleSubtopics.map(sub =>
          sub.href ? (
            <Link
              key={sub.id}
              href={sub.href}
              className="inline-flex h-7 items-center rounded-md border border-divider bg-white px-2.5 text-[13.5px] font-medium text-text no-underline transition-colors hover:border-text hover:text-[#4c1fd4]"
            >
              {sub.label}
            </Link>
          ) : sub.onSelect ? (
            <button
              key={sub.id}
              type="button"
              onClick={sub.onSelect}
              className="inline-flex h-7 cursor-pointer items-center rounded-md border border-divider bg-white px-2.5 text-[13.5px] font-medium text-text transition-colors hover:border-text hover:text-[#4c1fd4]"
            >
              {sub.label}
            </button>
          ) : (
            <TemplateBadge key={sub.id} tone="neutral">
              {sub.label}
            </TemplateBadge>
          )
        )}
        {hiddenSubtopicsCount > 0 && (
          <button
            type="button"
            onClick={() => setSubtopicsExpanded(prev => !prev)}
            className="inline-flex h-7 cursor-pointer items-center rounded-md border border-divider bg-grey-01 px-2.5 text-[13px] font-medium text-grey-04 transition-colors hover:border-text hover:text-text"
          >
            {subtopicsExpanded ? 'Show less' : `+${hiddenSubtopicsCount} more`}
          </button>
        )}
      </nav>
    ) : null;

  return (
    <TemplateShell
      maxWidth={1120}
      breadcrumbs={embedded ? undefined : model.breadcrumbs}
      coverUrl={embedded ? null : model.coverUrl}
      coverAlt={model.title}
      compact={compact}
      embedded={embedded}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      {/* Hero header (omitted when embedded inside a Topic Space shell that renders the space header) */}
      {embedded ? (
        subtopicsNav
      ) : (
        <header className="flex flex-col gap-3.5">
          <TemplateTitleRow
            actions={
              <>
                <EntityContextTogglePill />
                {headerActions ?? (
                  <EntityOverflowMenu
                    target={{ id: model.id, kind: 'Topic', title: model.title }}
                    isPageRoot
                    size="md"
                  />
                )}
              </>
            }
          >
            <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
          </TemplateTitleRow>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <TemplateBadge tone="neutral">Topic</TemplateBadge>
            {model.tags?.map(tag => (
              <TemplateBadge key={tag} tone="neutral">
                {tag}
              </TemplateBadge>
            ))}
          </div>

          {model.lede && (
            <p className="m-0 mt-1 max-w-[780px] text-[16.5px] leading-[25px] text-text/85">{model.lede}</p>
          )}

          {subtopicsNav}
        </header>
      )}

      {isLoadingSections ? (
        <div aria-busy="true" aria-label="Loading topic sections" className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <div className="h-6 w-28 animate-pulse rounded-md bg-grey-01" />
            <div className={`flex flex-col divide-y divide-divider overflow-hidden ${TEMPLATE_CARD_SURFACE}`}>
              {Array.from({ length: 5 }, (_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-grey-01" />
                    <div className="h-6 w-48 animate-pulse rounded-full bg-grey-01" />
                  </div>
                  <div className="hidden h-3 w-44 animate-pulse rounded-full bg-grey-01 @[760px]:block" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-6 w-40 animate-pulse rounded-md bg-grey-01" />
            <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-3">
              {Array.from({ length: 3 }, (_, idx) => (
                <div key={idx} className={`h-[320px] animate-pulse ${TEMPLATE_CARD_SURFACE} bg-grey-01/60`} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex animate-fade-in flex-col gap-10">
          {/* Calm single-column Claims list with 2-tab switch (Disputed | Accepted) */}
          {(contested.length > 0 || agreed.length > 0) && (
            <ClaimExplorer contestedClaims={contested} agreedClaims={agreed} title="Claims" />
          )}

          {/* Recent debates gallery (horizontal snap-scroll cards matching Genesis's debate gallery) */}
          {model.recentDebates && model.recentDebates.length > 0 && (
            <RecentDebatesGallery debates={model.recentDebates} />
          )}

          {/* Timeline (rendered open directly on the page) */}
          {timelineHighlights.length > 0 && (
            <section id="timeline" aria-label="Timeline" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-mediumTitle font-semibold text-text">Timeline</h2>
                <div className="flex items-center gap-3">
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

                  <AddEntityItemPopover
                    label="Add event"
                    primaryLabel="Event"
                    primaryPlaceholder="e.g. UN Security Council adopts resolution"
                    secondaryLabel="Date"
                    secondaryPlaceholder="e.g. 18 Nov 2026"
                    tertiaryLabel="Summary (optional)"
                    tertiaryPlaceholder="Brief neutral summary of what happened..."
                    onSubmit={draft => {
                      actionCallbacks?.onAddEvent?.({
                        title: draft.primary,
                        when: draft.secondary,
                        summary: draft.tertiary,
                      });
                      setAddedTimelineTurns(prev => [
                        {
                          id: `user-ev-${Date.now()}`,
                          when: draft.secondary ?? 'Recent',
                          title: draft.primary,
                          summary: draft.tertiary,
                        },
                        ...prev,
                      ]);
                    }}
                  />
                </div>
              </div>
              <ol className="m-0 flex list-none flex-col p-0">
                {timelineHighlights.map((turn, idx) => (
                  <TimelineHighlightRow
                    key={turn.id}
                    turn={turn}
                    isFirst={idx === 0}
                    isLast={idx === timelineHighlights.length - 1}
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

          {/* Context relations & Disputes side-by-side on live Topic pages */}
          {(hasContextOrLive || hasFlagsOrLive) && (
            <div
              // Either section can hide itself when empty (GEO-3819): auto columns let the other take
              // the full width, and `empty:hidden` drops the wrapper (and its gap) when both hide.
              className={
                hasContextOrLive && hasFlagsOrLive
                  ? 'grid grid-cols-1 items-start gap-8 empty:hidden @[720px]:auto-cols-fr @[720px]:grid-flow-col'
                  : 'empty:hidden'
              }
            >
              {hasContextOrLive && (
                <GraphConnectionsStrip
                  groups={model.graphConnections ?? []}
                  target={{ id: model.id, kind: 'Topic', title: model.title }}
                />
              )}
              {hasFlagsOrLive && <EntityFlagsSection target={{ id: model.id, kind: 'Topic', title: model.title }} />}
            </div>
          )}
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
            isInteractive && 'group-hover:text-[#4c1fd4]'
          )}
        >
          {turn.title}
        </span>
        {turn.summary && <span className="line-clamp-2 text-[15px] leading-[22px] text-grey-04">{turn.summary}</span>}
      </span>

      {isInteractive && (
        <ChevronRightIcon className="mt-1 size-4 shrink-0 text-grey-03 transition-transform group-hover:translate-x-0.5 group-hover:text-[#4c1fd4]" />
      )}
    </span>
  );

  return (
    <li className="grid grid-cols-1 gap-2 @[680px]:grid-cols-[118px_28px_minmax(0,1fr)] @[680px]:gap-4">
      {/* Left date */}
      <div className="pt-4 text-[14px] font-semibold text-grey-04 @[680px]:pt-5 @[680px]:text-right">{turn.when}</div>

      {/* Continuous vertical timeline spine directly on page */}
      <div className="relative hidden justify-center @[680px]:flex">
        {!isFirst && <span aria-hidden className="absolute top-0 h-[28px] w-px bg-grey-02" />}
        {!isLast && <span aria-hidden className="absolute top-[28px] bottom-0 w-px bg-grey-02" />}
        <span
          aria-hidden
          className="relative z-10 mt-[19px] inline-grid size-[18px] shrink-0 place-items-center rounded-full border border-grey-02 bg-white"
        >
          <span className="size-2 rounded-full bg-text" />
        </span>
      </div>

      {/* Right: event milestone headline + concise summary + overflow menu */}
      <div className={cx('flex min-w-0 flex-col gap-2.5 py-4 @[680px]:py-5', !isLast && 'border-b border-divider/90')}>
        <div className="flex min-w-0 items-start justify-between gap-3">
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

        <EntityInlineContext targetId={turn.id} targetTitle={turn.title} targetKind="Event" className="max-w-[740px]" />
      </div>
    </li>
  );
}
