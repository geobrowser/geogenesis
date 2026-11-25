'use client';

import * as React from 'react';

import cx from 'classnames';

import { NavUtils } from '~/core/utils/utils';

import type { ClaimSummaryModel, EntityActionCallbacks, SourceQuoteModel, SourceTemplateModel } from '../models';
import {
  AddClaimPopover,
  AddEntityItemPopover,
  ArrowUpRightIcon,
  ClaimExplorer,
  EntityContextAndDisputes,
  EntityContextTogglePill,
  EntityInlineContext,
  EntityOverflowMenu,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TEMPLATE_CLAIM_LIST_SURFACE,
  TemplateBadge,
  TemplateEmptyState,
  TemplateShell,
  TemplateTitleRow,
  TopicImagePills,
} from '../primitives';
import { PUBLISHING_LABEL, usePendingAdds } from '../primitives/use-pending-adds';

export interface SourceTemplateProps {
  model: SourceTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  /** True briefly during initial client hydration so sections reveal calmly instead of popping in one by one. */
  isLoadingSections?: boolean;
  className?: string;
}

/**
 * Pure, data-driven Source page template (Reports, Official documents, Datasets, Papers, Articles).
 */
export function SourceTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  isLoadingSections = false,
  className,
}: SourceTemplateProps) {
  const ctaLabel = (model.externalLabel ?? 'Open source').replace(/\s*↗\s*$/, '');
  const listedQuoteIds = React.useMemo(() => (model.quotes ?? []).map(quote => quote.id), [model.quotes]);
  const { rows: addedQuotes, add: addQuote } = usePendingAdds<SourceQuoteModel>(listedQuoteIds);
  const listedClaimIds = React.useMemo(() => model.supportedClaims.map(claim => claim.id), [model.supportedClaims]);
  const { rows: addedClaims, add: addClaim } = usePendingAdds<ClaimSummaryModel>(listedClaimIds);
  const allQuotes = [...addedQuotes, ...(model.quotes ?? [])];
  const allClaims = React.useMemo(
    () => [...addedClaims, ...model.supportedClaims],
    [addedClaims, model.supportedClaims]
  );
  const contestedClaims = React.useMemo(() => allClaims.filter(c => c.split.isSplit), [allClaims]);
  const agreedClaims = React.useMemo(() => allClaims.filter(c => !c.split.isSplit), [allClaims]);

  return (
    <TemplateShell
      maxWidth={920}
      breadcrumbs={model.breadcrumbs}
      coverUrl={model.coverUrl}
      coverAlt={model.title}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      <header className="flex flex-col gap-3.5">
        <TemplateTitleRow
          meta={
            <>
              <TemplateBadge tone="source">Source</TemplateBadge>
              {model.sourceType && <TemplateBadge tone="neutral">{model.sourceType}</TemplateBadge>}
              {model.tags?.map(tag => (
                <TemplateBadge key={tag} tone="fact">
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
                  target={{ id: model.id, kind: model.sourceType ?? 'Source', title: model.title }}
                  isPageRoot
                  size="md"
                />
              )}
            </>
          }
        >
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.title}</h1>
        </TemplateTitleRow>

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

      {isLoadingSections ? (
        <div aria-busy="true" aria-label="Loading article sections" className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <div className="h-5 w-28 animate-pulse rounded bg-grey-01" />
            <div className={`flex flex-col divide-y divide-divider overflow-hidden ${TEMPLATE_CLAIM_LIST_SURFACE}`}>
              <div className="h-[76px] animate-pulse bg-white" />
              <div className="h-[76px] animate-pulse bg-white" />
              <div className="h-[76px] animate-pulse bg-white" />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="h-5 w-24 animate-pulse rounded bg-grey-01" />
            <div className="flex flex-wrap gap-2">
              <div className="h-9 w-28 animate-pulse rounded-full bg-grey-01" />
              <div className="h-9 w-36 animate-pulse rounded-full bg-grey-01" />
              <div className="h-9 w-32 animate-pulse rounded-full bg-grey-01" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex animate-fade-in flex-col gap-8">
          {allClaims.length > 0 ? (
            <ClaimExplorer contestedClaims={contestedClaims} agreedClaims={agreedClaims} title="Claims" />
          ) : (
            <section aria-label="Claims" className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-mediumTitle font-semibold text-text">Claims</h2>
                <AddClaimPopover
                  label="Add claim"
                  holdDraft={actionCallbacks?.holdAddDraft}
                  onSubmit={draft => {
                    addClaim(
                      state => ({
                        pending: state.status === 'pending',
                        title: draft.title,
                        kind: draft.kind,
                        meta: state.status === 'pending' ? [PUBLISHING_LABEL] : draft.note ? [draft.note] : undefined,
                        split: { rows: [], isSplit: true, totalVotes: 0 },
                        href: state.status === 'published' ? NavUtils.toEntity(state.spaceId, state.id) : undefined,
                      }),
                      actionCallbacks?.onAddClaim?.(draft)
                    );
                  }}
                />
              </div>
              <TemplateEmptyState>No claims linked yet.</TemplateEmptyState>
            </section>
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
                holdDraft={actionCallbacks?.holdAddDraft}
                onSubmit={draft => {
                  addQuote(
                    state => ({
                      pending: state.status === 'pending',
                      text: draft.primary,
                      speaker: draft.secondary,
                      location: state.status === 'pending' ? PUBLISHING_LABEL : draft.tertiary,
                    }),
                    actionCallbacks?.onAddQuote?.({
                      text: draft.primary,
                      speaker: draft.secondary,
                      location: draft.tertiary,
                    })
                  );
                }}
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
                      {/* A pending row's id isn't an entity yet; the menu keeps its space but can't be used. */}
                      <EntityOverflowMenu
                        target={{ id: quote.id, kind: 'Quote', title: quote.text.slice(0, 80) }}
                        className={quote.pending ? 'invisible' : undefined}
                      />
                    </blockquote>
                  );
                })}
              </div>
            ) : (
              <TemplateEmptyState>No quotes extracted yet.</TemplateEmptyState>
            )}
          </section>

          {model.topics && model.topics.length > 0 && <TopicImagePills topics={model.topics} />}

          {model.sections.length > 0 && (
            <div className="flex flex-col gap-8">
              {model.sections.map(section => (
                <RelatedListSection key={section.id} section={section} />
              ))}
            </div>
          )}

          <EntityContextAndDisputes
            groups={model.graphConnections}
            target={{ id: model.id, kind: model.sourceType ?? 'Source', title: model.title }}
          />
        </div>
      )}

      {footer}
    </TemplateShell>
  );
}
