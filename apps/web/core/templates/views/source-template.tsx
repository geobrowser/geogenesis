'use client';

import * as React from 'react';

import type { SourceTemplateModel } from '../models';
import { ClaimSummaryCard, RelatedListSection, TemplateBadge, TemplateShell } from '../primitives';

export interface SourceTemplateProps {
  model: SourceTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Pure, data-driven Source page template (Reports, Official documents, Datasets, Papers, Articles).
 */
export function SourceTemplate({ model, headerActions, footer, className }: SourceTemplateProps) {
  return (
    <TemplateShell maxWidth={840} breadcrumbs={model.breadcrumbs} className={className}>
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TemplateBadge tone="source">Source</TemplateBadge>
            {model.sourceType && <TemplateBadge tone="neutral">{model.sourceType}</TemplateBadge>}
            {model.tags?.map(tag => (
              <TemplateBadge key={tag} tone="fact">
                {tag}
              </TemplateBadge>
            ))}
          </div>
          {headerActions}
        </div>

        <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>

        {model.summary && <p className="m-0 text-[16px] leading-[25px] text-text/90">{model.summary}</p>}

        {model.externalUrl && (
          <div className="pt-1">
            <a
              href={model.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-full border border-text bg-text px-4 text-button text-white no-underline transition-opacity hover:opacity-90"
            >
              {model.externalLabel ?? 'Open source ↗'}
            </a>
          </div>
        )}
      </header>

      {model.coverUrl && (
        <div className="overflow-hidden rounded-xl border border-divider bg-grey-01">
          <img src={model.coverUrl} alt={model.title} className="max-h-[300px] w-full object-cover" />
        </div>
      )}

      {model.metadata.length > 0 && (
        <dl className="m-0 grid grid-cols-1 gap-3 rounded-xl border border-grey-02/70 bg-grey-01/50 p-4 @[520px]:grid-cols-3">
          {model.metadata.map(entry => (
            <div key={entry.label} className="flex flex-col gap-0.5">
              <dt className="text-[12px] font-medium text-grey-04">{entry.label}</dt>
              <dd className="m-0 text-[14px] font-semibold text-text">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {model.supportedClaims.length > 0 && (
        <section aria-label="Claims it’s evidence for" className="flex flex-col gap-3">
          <h2 className="m-0 text-smallTitle text-text">Claims it’s evidence for</h2>
          <div className="grid grid-cols-1 gap-3 @[620px]:grid-cols-2">
            {model.supportedClaims.map(claim => (
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

      {footer}
    </TemplateShell>
  );
}
