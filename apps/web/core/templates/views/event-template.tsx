'use client';

import * as React from 'react';

import Link from 'next/link';

import type { EntityActionCallbacks, EventTemplateModel } from '../models';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClaimSummaryCard,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RelatedListSection,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
} from '../primitives';

export interface EventTemplateProps {
  model: EventTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  className?: string;
}

/**
 * Pure, data-driven Event page template (e.g. News Event / Timeline turn).
 */
export function EventTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  className,
}: EventTemplateProps) {
  return (
    <TemplateShell
      maxWidth={860}
      breadcrumbs={model.breadcrumbs}
      coverUrl={model.coverUrl}
      coverAlt={model.title}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      <header className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            <EntityContextTogglePill />
            {headerActions ?? (
              <EntityOverflowMenu target={{ id: model.id, kind: 'Event', title: model.title }} isPageRoot size="md" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TemplateBadge tone="event">Event</TemplateBadge>
          {model.when && <TemplateBadge tone="neutral">{model.when}</TemplateBadge>}
          {model.storyCountLabel && <TemplateBadge tone="neutral">{model.storyCountLabel}</TemplateBadge>}
        </div>

        {model.summary && <p className="m-0 mt-0.5 text-[16.5px] leading-[25px] text-text/85">{model.summary}</p>}
        <EntityInlineContext targetId={model.id} targetTitle={model.title} targetKind="Event" />
      </header>

      <GraphConnectionsStrip
        groups={model.graphConnections ?? []}
        target={{ id: model.id, kind: 'Event', title: model.title }}
      />

      <EntityFlagsSection target={{ id: model.id, kind: 'Event', title: model.title }} />

      {model.claims.length > 0 && (
        <section aria-label="Agreed and split claims" className="flex flex-col gap-4">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">Agreed and split claims</h2>
          <div className="grid grid-cols-1 gap-4 @[620px]:grid-cols-2">
            {model.claims.map(claim => (
              <ClaimSummaryCard key={claim.id} claim={claim} variant={claim.split.isSplit ? 'default' : 'agreed'} />
            ))}
          </div>
        </section>
      )}

      {model.sections.length > 0 && (
        <div className="flex flex-col gap-8">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {(model.previousEvent || model.nextEvent) && (
        <nav
          aria-label="Timeline navigation"
          className="grid grid-cols-1 gap-3.5 border-t border-divider pt-6 @[560px]:grid-cols-2"
        >
          {model.previousEvent ? <EventNeighborButton direction="Earlier" event={model.previousEvent} /> : <div />}
          {model.nextEvent && <EventNeighborButton direction="Later" event={model.nextEvent} align="right" />}
        </nav>
      )}

      {footer}
    </TemplateShell>
  );
}

function EventNeighborButton({
  direction,
  event,
  align = 'left',
}: {
  direction: 'Earlier' | 'Later';
  event: NonNullable<EventTemplateModel['previousEvent']>;
  align?: 'left' | 'right';
}) {
  const classes = `flex flex-col gap-1 px-5 py-4 text-text no-underline ${TEMPLATE_INTERACTIVE_CARD_SURFACE} ${
    align === 'right' ? 'items-end text-right' : 'items-start text-left'
  }`;

  const inner = (
    <>
      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-grey-04">
        {direction === 'Earlier' && <ArrowLeftIcon className="size-3.5" />}
        <span>{direction === 'Earlier' ? `${direction} · ${event.when}` : `${event.when} · ${direction}`}</span>
        {direction === 'Later' && <ArrowRightIcon className="size-3.5" />}
      </span>
      <span className="text-[16px] leading-[22px] font-semibold text-text">{event.title}</span>
    </>
  );

  if (event.href) {
    return (
      <Link href={event.href} className={classes}>
        {inner}
      </Link>
    );
  }

  if (event.onSelect) {
    return (
      <button type="button" onClick={event.onSelect} className={`${classes} cursor-pointer`}>
        {inner}
      </button>
    );
  }

  return <div className={classes}>{inner}</div>;
}
