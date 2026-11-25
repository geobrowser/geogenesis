'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { NavUtils } from '~/core/utils/utils';

import type { EntityActionCallbacks, TopicTemplateModel, TopicTimelineHighlightModel } from '../models';
import { TEMPLATE_ONTOLOGY, formatOntologyDate } from '../ontology';
import {
  AddEntityItemPopover,
  ArrowRightIcon,
  ChevronRightIcon,
  ClaimExplorer,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  ExpandableLede,
  GraphConnectionsStrip,
  RecentDebatesGallery,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  TemplateTitleRow,
} from '../primitives';
import { PUBLISHING_LABEL, usePendingAdds } from '../primitives/use-pending-adds';

/**
 * The Add event form edits `Event date` with the entity page's date input in its date-only (DATE) mode: no
 * time fields. That mode writes the same midnight-UTC ISO string (`2026-11-18T00:00:00.000Z`) as a DATETIME
 * date with no time, and `buildEventEdits` still stages it as DATETIME, so the property type doesn't change.
 */
const EVENT_DATE_INPUT = { propertyId: TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID, dataType: 'DATE' } as const;

export interface TopicTemplateProps {
  model: TopicTemplateModel;
  /** Optional header actions slot (e.g. Follow button, overflow menu on live Geo pages). */
  headerActions?: React.ReactNode;
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
  actionCallbacks,
  compact = false,
  embedded = false,
  isLoadingSections = false,
  className,
}: TopicTemplateProps) {
  const contested = model.contestedClaims ?? [];
  const agreed = model.agreedClaims ?? [];
  const listedTimelineIds = React.useMemo(
    () => (model.timelineHighlights ?? []).map(turn => turn.id),
    [model.timelineHighlights]
  );
  const addedTimelineTurns = usePendingAdds<TopicTimelineHighlightModel>(listedTimelineIds);
  const [subtopicsExpanded, setSubtopicsExpanded] = React.useState(false);
  // Subtopics show only on request, so the description leads (GEO-3837).
  const [subtopicsOpen, setSubtopicsOpen] = React.useState(false);
  const subtopicsNavId = React.useId();
  const timelineHighlights = [...addedTimelineTurns.rows, ...(model.timelineHighlights ?? [])];
  const subtopics = model.subtopics ?? [];
  const visibleSubtopics = subtopicsExpanded ? subtopics : subtopics.slice(0, 10);
  const hiddenSubtopicsCount = Math.max(0, subtopics.length - 10);
  const hasContextOrLive = (model.graphConnections && model.graphConnections.length > 0) || Boolean(actionCallbacks);
  const hasFlagsOrLive = Boolean(model.contextByEntityId?.[model.id]?.flags?.length) || Boolean(actionCallbacks);

  const subtopicsNav = (collapsible: boolean) =>
    subtopics.length > 0 ? (
      <nav
        id={collapsible ? subtopicsNavId : undefined}
        aria-label="Subtopics"
        className={cx(
          'flex-wrap items-center gap-1.5',
          collapsible && !subtopicsOpen ? 'hidden' : 'flex',
          !embedded && 'mt-1'
        )}
      >
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
        subtopicsNav(false)
      ) : (
        <header className="flex flex-col gap-3.5">
          <TemplateTitleRow
            singleLine
            meta={
              <>
                <TemplateBadge tone="neutral">Topic</TemplateBadge>
                {model.tags?.map(tag => (
                  <TemplateBadge key={tag} tone="neutral">
                    {tag}
                  </TemplateBadge>
                ))}
              </>
            }
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

          {model.lede && <ExpandableLede text={model.lede} className="mt-1" />}

          {subtopics.length > 0 && (
            <button
              type="button"
              aria-expanded={subtopicsOpen}
              aria-controls={subtopicsNavId}
              onClick={() => setSubtopicsOpen(open => !open)}
              className="inline-flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-[14px] font-medium text-grey-04 transition-colors hover:text-text"
            >
              {subtopicsOpen ? 'Hide subtopics' : 'Show subtopics'}
              <ChevronRightIcon className={cx('size-3.5', subtopicsOpen ? '-rotate-90' : 'rotate-90')} />
            </button>
          )}
          {subtopicsNav(true)}
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
            <ClaimExplorer contestedClaims={contested} agreedClaims={agreed} title="Claims" hideKindOnPhone />
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
                    secondaryDate={EVENT_DATE_INPUT}
                    tertiaryLabel="Summary (optional)"
                    tertiaryPlaceholder="Brief neutral summary of what happened..."
                    holdDraft={actionCallbacks?.holdAddDraft}
                    onSubmit={draft => {
                      addedTimelineTurns.add(
                        state => ({
                          pending: state.status === 'pending',
                          when:
                            state.status === 'pending'
                              ? PUBLISHING_LABEL
                              : (formatOntologyDate(draft.secondary) ?? 'Recent'),
                          title: draft.primary,
                          summary: draft.tertiary,
                          href: state.status === 'published' ? NavUtils.toEntity(state.spaceId, state.id) : undefined,
                        }),
                        actionCallbacks?.onAddEvent?.({
                          title: draft.primary,
                          when: draft.secondary,
                          summary: draft.tertiary,
                        })
                      );
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
                    spineInGutter={!compact && !embedded}
                  />
                ))}
              </ol>
            </section>
          )}

          {/* Evidence (and additional structured sections) */}
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
    </TemplateShell>
  );
}

function TimelineHighlightRow({
  turn,
  isFirst,
  isLast,
  spineInGutter,
}: {
  turn: TopicTimelineHighlightModel;
  isFirst: boolean;
  isLast: boolean;
  /**
   * Pull the phone spine into the page margin. Only the full page has a gutter wide enough (37px); the
   * side panel (16px, clipped on x) and the Space home shell would cut the circle off.
   */
  spineInGutter: boolean;
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
        // Desktop only: on phones the name takes this width (GEO-3837).
        <ChevronRightIcon className="mt-1 hidden size-4 shrink-0 text-grey-03 transition-transform group-hover:translate-x-0.5 group-hover:text-[#4c1fd4] @[680px]:block" />
      )}
    </span>
  );

  return (
    // Desktop: date | spine | event. Phones: on the full page the spine sits in the page margin (the
    // negative margin is its 18px column plus the 12px gap), so the date and event line up with the
    // section headers; in narrower shells it stays inside the column. The date sits just above its
    // event's name (GEO-3837, GEO-3854).
    <li
      className={cx(
        'grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 @[680px]:grid-cols-[118px_28px_minmax(0,1fr)] @[680px]:gap-x-4',
        spineInGutter && '-ml-[30px] @[680px]:ml-0'
      )}
    >
      {/* Date */}
      <div className="col-start-2 row-start-1 pt-4 text-[14px] font-semibold text-grey-04 @[680px]:col-start-1 @[680px]:pt-5 @[680px]:text-right">
        {turn.when}
      </div>

      {/* Continuous vertical timeline spine. The same circle on every width; it lines up with the date on
          phones, the name on desktop. */}
      <div className="relative col-start-1 row-span-2 row-start-1 flex justify-center @[680px]:col-start-2 @[680px]:row-span-1">
        {!isFirst && <span aria-hidden className="absolute top-0 h-[26px] w-px bg-grey-02 @[680px]:h-[28px]" />}
        {!isLast && <span aria-hidden className="absolute top-[26px] bottom-0 w-px bg-grey-02 @[680px]:top-[28px]" />}
        <span
          aria-hidden
          className="relative z-10 mt-[17px] inline-grid size-[18px] shrink-0 place-items-center rounded-full border border-grey-02 bg-white @[680px]:mt-[19px]"
        >
          <span className="size-2 rounded-full bg-text" />
        </span>
      </div>

      {/* Right: event milestone headline + concise summary + overflow menu */}
      <div
        className={cx(
          'col-start-2 row-start-2 flex min-w-0 flex-col gap-2.5 pt-1 pb-4 @[680px]:col-start-3 @[680px]:row-start-1 @[680px]:py-5',
          !isLast && 'border-b border-divider/90'
        )}
      >
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

          {/* A pending row's id isn't an entity yet; the menu keeps its space but can't be used. */}
          <EntityOverflowMenu
            target={{ id: turn.id, kind: 'Event', title: turn.title }}
            className={cx('mt-0.5', turn.pending && 'invisible')}
          />
        </div>

        <EntityInlineContext targetId={turn.id} targetTitle={turn.title} targetKind="Event" className="max-w-[740px]" />
      </div>
    </li>
  );
}
