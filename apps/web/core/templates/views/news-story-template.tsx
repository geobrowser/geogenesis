'use client';

import * as React from 'react';

import type { NewsStoryTemplateModel } from '../models';
import {
  ArrowUpRightIcon,
  ClaimSummaryCard,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RelatedListSection,
  TemplateBadge,
  TemplateShell,
  VoteBox,
} from '../primitives';

export interface NewsStoryTemplateProps {
  model: NewsStoryTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Pure, data-driven News Story page template.
 */
export function NewsStoryTemplate({ model, headerActions, footer, className }: NewsStoryTemplateProps) {
  return (
    <TemplateShell
      maxWidth={860}
      breadcrumbs={model.breadcrumbs}
      contextByEntityId={model.contextByEntityId}
      className={className}
    >
      <header className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.headline}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            <EntityContextTogglePill />
            {headerActions}
            <EntityOverflowMenu
              target={{ id: model.id, kind: 'News story', title: model.headline }}
              isPageRoot
              size="md"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TemplateBadge tone="story">News story</TemplateBadge>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-grid size-6 shrink-0 place-items-center rounded text-[11px] font-semibold tracking-tight text-white"
              style={{ backgroundColor: model.outletColor }}
            >
              {model.outletInitials}
            </span>
            <span className="text-[15px] font-semibold text-text">{model.outlet}</span>
          </div>
          {(model.date || (model.authors && model.authors.length > 0)) && (
            <span className="text-[14.5px] text-grey-04">
              {[model.date, model.authors && model.authors.length > 0 ? model.authors.join(', ') : undefined]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>

        {model.summary && <p className="m-0 mt-0.5 text-[16.5px] leading-[25px] text-text/85">{model.summary}</p>}
        <EntityInlineContext targetId={model.id} targetTitle={model.headline} targetKind="News story" />

        {(model.externalUrl || model.archiveUrl) && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {model.externalUrl && (
              <a
                href={model.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-text bg-text px-5 text-button text-white no-underline transition-opacity hover:opacity-90"
              >
                <span>Read on {model.outlet}</span>
                <ArrowUpRightIcon className="size-4" />
              </a>
            )}
            {model.archiveUrl && (
              <a
                href={model.archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-grey-02 bg-white px-5 text-button text-text no-underline transition-colors hover:border-text"
              >
                <span>Archived copy</span>
                <ArrowUpRightIcon className="size-4" />
              </a>
            )}
          </div>
        )}
      </header>

      {model.accuracyRating && (
        <VoteBox
          prompt={model.accuracyRating.prompt}
          split={model.accuracyRating.split}
          control={model.accuracyRating.voteBox}
        />
      )}

      <GraphConnectionsStrip groups={[]} target={{ id: model.id, kind: 'News story', title: model.headline }} />

      <EntityFlagsSection target={{ id: model.id, kind: 'News story', title: model.headline }} />

      {model.reportedClaims.length > 0 && (
        <section aria-label="The claim it reports" className="flex flex-col gap-4">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">
            {model.reportedClaims.length === 1 ? 'The claim it reports' : 'Claims it reports'}
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {model.reportedClaims.map(claim => (
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

      {footer}
    </TemplateShell>
  );
}
