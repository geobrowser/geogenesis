'use client';

import * as React from 'react';

import cx from 'classnames';

import type { SourceQuoteModel, SourceTemplateModel } from '../models';
import {
  AddEntityItemPopover,
  ArrowUpRightIcon,
  ClaimSummaryCard,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
} from '../primitives';

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
  const ctaLabel = (model.externalLabel ?? 'Open source').replace(/\s*↗\s*$/, '');
  const [addedQuotes, setAddedQuotes] = React.useState<SourceQuoteModel[]>([]);
  const allQuotes = [...addedQuotes, ...(model.quotes ?? [])];

  return (
    <TemplateShell
      maxWidth={860}
      breadcrumbs={model.breadcrumbs}
      coverUrl={model.coverUrl}
      coverAlt={model.title}
      contextByEntityId={model.contextByEntityId}
      className={className}
    >
      <header className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            <EntityContextTogglePill />
            {headerActions}
            <EntityOverflowMenu
              target={{ id: model.id, kind: model.sourceType ?? 'Source', title: model.title }}
              isPageRoot
              size="md"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TemplateBadge tone="source">Source</TemplateBadge>
          {model.sourceType && <TemplateBadge tone="neutral">{model.sourceType}</TemplateBadge>}
          {model.tags?.map(tag => (
            <TemplateBadge key={tag} tone="fact">
              {tag}
            </TemplateBadge>
          ))}
        </div>

        {model.summary && <p className="m-0 mt-0.5 text-[16.5px] leading-[25px] text-text/85">{model.summary}</p>}

        {model.externalUrl && (
          <div className="pt-1">
            <a
              href={model.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-text bg-text px-5 text-button text-white no-underline transition-opacity hover:opacity-90"
            >
              <span>{ctaLabel}</span>
              <ArrowUpRightIcon className="size-4" />
            </a>
          </div>
        )}
      </header>

      {model.metadata.length > 0 && (
        <dl className="m-0 grid grid-cols-1 gap-4 border-y border-divider py-5 @[520px]:grid-cols-3">
          {model.metadata.map(entry => (
            <div key={entry.label} className="flex flex-col gap-1">
              <dt className="text-[14px] text-grey-04">{entry.label}</dt>
              <dd className="m-0 text-[16px] font-semibold text-text">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section aria-label="Quotes" className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">Quotes</h2>
          <AddEntityItemPopover
            label="Add quote"
            primaryLabel="Quote text"
            primaryPlaceholder="Paste the exact excerpt from this source..."
            secondaryLabel="Speaker or author (optional)"
            secondaryPlaceholder="e.g. International Court of Justice"
            tertiaryLabel="Page or section (optional)"
            tertiaryPlaceholder="e.g. §86(1) or 07:12"
            multilinePrimary
            onSubmit={draft =>
              setAddedQuotes(prev => [
                {
                  id: `user-q-${Date.now()}`,
                  text: draft.primary,
                  speaker: draft.secondary,
                  location: draft.tertiary,
                },
                ...prev,
              ])
            }
          />
        </div>
        {allQuotes.length > 0 ? (
          <div className="flex flex-col gap-3">
            {allQuotes.map(quote => {
              const attribution = [quote.speaker, quote.location].filter(Boolean).join(', ');
              return (
                <blockquote
                  key={quote.id}
                  className={cx('m-0 flex items-start justify-between gap-4 p-5', TEMPLATE_CARD_SURFACE)}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="m-0 text-[16px] leading-[24px] text-text">“{quote.text}”</p>
                    {attribution && <footer className="text-[14px] text-grey-04">— {attribution}</footer>}
                    <EntityInlineContext
                      targetId={quote.id}
                      targetTitle={quote.text.slice(0, 80)}
                      targetKind="Quote"
                      className="mt-1"
                    />
                  </div>
                  <EntityOverflowMenu target={{ id: quote.id, kind: 'Quote', title: quote.text.slice(0, 80) }} />
                </blockquote>
              );
            })}
          </div>
        ) : (
          <div className={cx('px-5 py-4', TEMPLATE_CARD_SURFACE)}>
            <p className="m-0 text-[14px] text-grey-04">No quotes extracted yet.</p>
          </div>
        )}
      </section>

      <GraphConnectionsStrip
        groups={model.graphConnections ?? []}
        target={{ id: model.id, kind: model.sourceType ?? 'Source', title: model.title }}
      />

      <EntityFlagsSection target={{ id: model.id, kind: model.sourceType ?? 'Source', title: model.title }} />

      {model.supportedClaims.length > 0 && (
        <section aria-label="Claims it’s evidence for" className="flex flex-col gap-4">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">Claims it’s evidence for</h2>
          <div className="grid grid-cols-1 gap-4 @[620px]:grid-cols-2">
            {model.supportedClaims.map(claim => (
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
