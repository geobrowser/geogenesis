'use client';

import * as React from 'react';

import type { NewsStoryTemplateModel } from '../models';
import {
  ArrowUpRightIcon,
  ClaimSummaryCard,
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
    <TemplateShell maxWidth={860} breadcrumbs={model.breadcrumbs} className={className}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="inline-grid size-11 shrink-0 place-items-center rounded-lg text-[14px] font-semibold tracking-tight text-white"
              style={{ backgroundColor: model.outletColor }}
            >
              {model.outletInitials}
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <TemplateBadge tone="story">News story</TemplateBadge>
                <span className="text-[16px] font-semibold text-text">{model.outlet}</span>
              </div>
              <span className="text-[15px] text-grey-04">
                {[model.date, model.authors && model.authors.length > 0 ? model.authors.join(', ') : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.headline}</h1>

        {model.summary && <p className="m-0 text-body text-text/90">{model.summary}</p>}

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
