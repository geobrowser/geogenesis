'use client';

import * as React from 'react';

import Link from 'next/link';

import type { EventTemplateModel } from '../models';
import { ClaimSummaryCard, RelatedListSection, TemplateBadge, TemplateShell } from '../primitives';

export interface EventTemplateProps {
  model: EventTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Pure, data-driven Event page template (e.g. News Event / Timeline turn).
 */
export function EventTemplate({ model, headerActions, footer, className }: EventTemplateProps) {
  return (
    <TemplateShell maxWidth={840} breadcrumbs={model.breadcrumbs} className={className}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TemplateBadge tone="event">Event</TemplateBadge>
            {model.when && <TemplateBadge tone="neutral">{model.when}</TemplateBadge>}
            {model.storyCountLabel && <TemplateBadge tone="neutral">{model.storyCountLabel}</TemplateBadge>}
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>

        {model.summary && <p className="m-0 text-[16px] leading-[25px] text-text/90">{model.summary}</p>}
      </header>

      {model.coverUrl && (
        <div className="overflow-hidden rounded-xl border border-divider bg-grey-01">
          <img src={model.coverUrl} alt={model.title} className="max-h-[340px] w-full object-cover" />
        </div>
      )}

      {model.claims.length > 0 && (
        <section aria-label="Agreed and split claims" className="flex flex-col gap-3">
          <h2 className="m-0 text-smallTitle text-text">Agreed and split claims</h2>
          <div className="grid grid-cols-1 gap-3 @[620px]:grid-cols-2">
            {model.claims.map(claim => (
              <ClaimSummaryCard key={claim.id} claim={claim} variant={claim.split.isSplit ? 'default' : 'agreed'} />
            ))}
          </div>
        </section>
      )}

      {model.sections.length > 0 && (
        <div className="flex flex-col gap-6">
          {model.sections.map(section => (
            <RelatedListSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {(model.previousEvent || model.nextEvent) && (
        <nav
          aria-label="Timeline navigation"
          className="grid grid-cols-1 gap-3 border-t border-divider pt-5 @[560px]:grid-cols-2"
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
  const classes = `flex flex-col gap-0.5 rounded-xl border border-grey-02/80 bg-white px-4 py-3 text-text no-underline transition-colors hover:border-text ${
    align === 'right' ? 'text-right' : 'text-left'
  }`;

  const inner = (
    <>
      <span className="text-[12px] font-medium text-grey-04">
        {direction === 'Earlier' ? `← ${direction} · ${event.when}` : `${event.when} · ${direction} →`}
      </span>
      <span className="text-[14px] leading-[19px] font-semibold text-text">{event.title}</span>
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
