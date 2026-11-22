'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import {
  type ClaimSummaryModel,
  type EntityActionCallbacks,
  type NewsStorySourceModel,
  type NewsStoryTemplateModel,
  formatPercentInt,
} from '../models';
import {
  AddClaimPopover,
  AddEntityItemPopover,
  ArrowUpRightIcon,
  EntityContextTogglePill,
  EntityFlagsSection,
  EntityInlineContext,
  EntityOverflowMenu,
  GraphConnectionsStrip,
  RelatedListSection,
  TEMPLATE_CARD_SURFACE,
  TemplateBadge,
  TemplateShell,
  VoteBox,
} from '../primitives';

export interface NewsStoryTemplateProps {
  model: NewsStoryTemplateModel;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  actionCallbacks?: EntityActionCallbacks;
  compact?: boolean;
  className?: string;
}

const INITIAL_VISIBLE_SOURCES = 5;

/**
 * Pure, data-driven News Story page template.
 *
 * Hybrid of Geo News's scannable news-aggregator layout (cover, summary, ordered narrative
 * claim sections / bulleted claims, expandable source articles) and Geo Genesis's crisp graph
 * styling (clickable Claim entities, subtle inline agreement pills, Context relation pills,
 * Flags, and inline `+` popovers).
 */
export function NewsStoryTemplate({
  model,
  headerActions,
  footer,
  actionCallbacks,
  compact = false,
  className,
}: NewsStoryTemplateProps) {
  const [addedClaimsByGroup, setAddedClaimsByGroup] = React.useState<Record<string, ClaimSummaryModel[]>>({});
  const [addedSources, setAddedSources] = React.useState<NewsStorySourceModel[]>([]);
  const [sourcesExpanded, setSourcesExpanded] = React.useState(false);

  const hasClaimGroups = Boolean(model.claimGroups && model.claimGroups.length > 0);
  const flatClaims = [...(addedClaimsByGroup['flat'] ?? []), ...model.reportedClaims];
  const allSources = [...addedSources, ...(model.sources ?? [])];
  const visibleSources = sourcesExpanded ? allSources : allSources.slice(0, INITIAL_VISIBLE_SOURCES);
  const hiddenSourceCount = Math.max(0, allSources.length - INITIAL_VISIBLE_SOURCES);

  const metaParts = [
    model.date,
    allSources.length > 0 ? `${allSources.length} ${allSources.length === 1 ? 'source' : 'sources'}` : undefined,
    model.authors && model.authors.length > 0 ? model.authors.join(', ') : undefined,
  ].filter(Boolean);

  return (
    <TemplateShell
      maxWidth={860}
      breadcrumbs={model.breadcrumbs}
      coverUrl={model.coverUrl}
      coverAlt={model.headline}
      compact={compact}
      contextByEntityId={model.contextByEntityId}
      actionCallbacks={actionCallbacks}
      className={className}
    >
      {/* Editorial header: title first, type/metadata strip below */}
      <header className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 text-entityTitle text-pretty text-text">{model.headline}</h1>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            <EntityContextTogglePill />
            {headerActions ?? (
              <EntityOverflowMenu
                target={{ id: model.id, kind: 'News story', title: model.headline }}
                isPageRoot
                size="md"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <TemplateBadge tone="story">News story</TemplateBadge>

          {model.outlet && (
            <div className="flex items-center gap-2">
              {model.outletInitials && (
                <span
                  aria-hidden
                  className="inline-grid size-6 shrink-0 place-items-center rounded text-[11px] font-semibold tracking-tight text-white"
                  style={{ backgroundColor: model.outletColor ?? '#202020' }}
                >
                  {model.outletInitials}
                </span>
              )}
              <span className="text-[15px] font-semibold text-text">{model.outlet}</span>
            </div>
          )}

          {metaParts.length > 0 && <span className="text-[14.5px] text-grey-04">{metaParts.join(' · ')}</span>}

          {model.associatedTimelines &&
            model.associatedTimelines.map(tl =>
              tl.href ? (
                <Link
                  key={tl.id}
                  href={tl.href}
                  className="inline-flex h-7 items-center rounded-md border border-divider bg-grey-01 px-2.5 text-[13.5px] font-medium text-text no-underline transition-colors hover:border-text hover:text-[#4c1fd4]"
                >
                  {tl.title}
                </Link>
              ) : (
                <TemplateBadge key={tl.id} tone="neutral">
                  {tl.title}
                </TemplateBadge>
              )
            )}
        </div>

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
                <span>{model.outlet ? `Read on ${model.outlet}` : 'Read original article'}</span>
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

      {/* Narrative summary (Geo News briefing prose) */}
      {model.summary && (
        <section aria-label="Summary" className="flex flex-col gap-2">
          <p className="m-0 text-[16.5px] leading-[27px] text-text/90">{model.summary}</p>
        </section>
      )}

      {/* Grouped narrative claims (Blocks / Perspectives) — scannable Geo News bulleted reading flow */}
      {hasClaimGroups ? (
        <div className="flex flex-col gap-8">
          {model.claimGroups!.map(group => {
            const claims = [...(addedClaimsByGroup[group.id] ?? []), ...group.claims];
            return (
              <section key={group.id} aria-label={group.title} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-mediumTitle font-semibold text-text">{group.title}</h2>
                    {group.description && (
                      <p className="m-0 text-[15px] leading-[22px] text-grey-04">{group.description}</p>
                    )}
                  </div>
                  <AddClaimPopover
                    label={`Add claim to ${group.title}`}
                    onSubmit={draft => {
                      actionCallbacks?.onAddClaim?.(draft);
                      setAddedClaimsByGroup(prev => ({
                        ...prev,
                        [group.id]: [
                          {
                            id: `story-claim-${Date.now()}`,
                            title: draft.title,
                            kind: draft.kind,
                            split: { rows: [], isSplit: false },
                          },
                          ...(prev[group.id] ?? []),
                        ],
                      }));
                    }}
                  />
                </div>
                <NewsClaimBulletList claims={claims} />
              </section>
            );
          })}
        </div>
      ) : flatClaims.length > 0 ? (
        <section aria-label="Claims" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">Claims</h2>
            <AddClaimPopover
              label="Add claim"
              onSubmit={draft => {
                actionCallbacks?.onAddClaim?.(draft);
                setAddedClaimsByGroup(prev => ({
                  ...prev,
                  flat: [
                    {
                      id: `story-claim-${Date.now()}`,
                      title: draft.title,
                      kind: draft.kind,
                      split: { rows: [], isSplit: false },
                    },
                    ...(prev.flat ?? []),
                  ],
                }));
              }}
            />
          </div>
          <NewsClaimBulletList claims={flatClaims} />
        </section>
      ) : null}

      {/* Aggregated Sources (Geo News expandable source cards in Geo Genesis surface style) */}
      {allSources.length > 0 && (
        <section aria-label="Sources" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-mediumTitle font-semibold text-text">Sources</h2>
            <AddEntityItemPopover
              label="Add source"
              primaryLabel="Source title"
              primaryPlaceholder="e.g. Reuters report or official statement"
              secondaryLabel="Publication (optional)"
              secondaryPlaceholder="e.g. Reuters"
              tertiaryLabel="Source URL (optional)"
              tertiaryPlaceholder="https://..."
              onSubmit={draft => {
                actionCallbacks?.onAddTriple?.(model.id, 'Sources', [draft.primary]);
                setAddedSources(prev => [
                  {
                    id: `story-src-${Date.now()}`,
                    title: draft.primary,
                    publication: draft.secondary,
                    url: draft.tertiary,
                  },
                  ...prev,
                ]);
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            {visibleSources.map(source => (
              <NewsSourceCard key={source.id} source={source} />
            ))}
          </div>

          {hiddenSourceCount > 0 && (
            <button
              type="button"
              onClick={() => setSourcesExpanded(prev => !prev)}
              className="cursor-pointer self-start border-0 bg-transparent p-0 text-[14.5px] font-medium text-grey-04 transition-colors hover:text-text"
            >
              {sourcesExpanded
                ? `Hide ${hiddenSourceCount} ${hiddenSourceCount === 1 ? 'source' : 'sources'}`
                : `Show ${hiddenSourceCount} more ${hiddenSourceCount === 1 ? 'source' : 'sources'}`}
            </button>
          )}
        </section>
      )}

      {model.accuracyRating && (
        <VoteBox
          prompt={model.accuracyRating.prompt}
          split={model.accuracyRating.split}
          control={model.accuracyRating.voteBox}
        />
      )}

      <GraphConnectionsStrip
        groups={model.graphConnections ?? []}
        target={{ id: model.id, kind: 'News story', title: model.headline }}
      />

      <EntityFlagsSection target={{ id: model.id, kind: 'News story', title: model.headline }} />

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

/**
 * Geo News-style editorial bulleted claims list, enhanced with Geo Genesis graph links,
 * subtle inline vote agreement indicators when voted, and inline Context / Flags overflow.
 */
function NewsClaimBulletList({ claims }: { claims: readonly ClaimSummaryModel[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {claims.map(claim => {
        const hasAgreement = claim.overallPercent !== undefined && (claim.split.totalVotes ?? 0) > 0;
        return (
          <li key={claim.id} className="group/claim-bullet flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-[9px] inline-block size-[5px] shrink-0 rounded-[1px] bg-text" />
              <div className="min-w-0 flex-1 text-[16px] leading-[25px] text-text">
                {claim.href ? (
                  <Link href={claim.href} className="text-text no-underline transition-colors hover:text-[#4c1fd4]">
                    {claim.title}
                  </Link>
                ) : claim.onSelect ? (
                  <button
                    type="button"
                    onClick={claim.onSelect}
                    className="cursor-pointer border-0 bg-transparent p-0 text-left text-[16px] leading-[25px] text-text transition-colors hover:text-[#4c1fd4]"
                  >
                    {claim.title}
                  </button>
                ) : (
                  <span>{claim.title}</span>
                )}

                {hasAgreement && (
                  <span className="ml-2 inline-flex items-center rounded-md border border-divider bg-grey-01 px-1.5 py-0.5 align-middle text-[12px] leading-none font-medium text-grey-04 tabular-nums">
                    {formatPercentInt(claim.overallPercent!)} agree
                  </span>
                )}
              </div>

              <div className="shrink-0 opacity-60 transition-opacity group-focus-within/claim-bullet:opacity-100 group-hover/claim-bullet:opacity-100">
                <EntityOverflowMenu target={{ id: claim.id, kind: 'Claim', title: claim.title }} />
              </div>
            </div>

            <EntityInlineContext
              targetId={claim.id}
              targetTitle={claim.title}
              targetKind="Claim"
              className="pl-[17px]"
            />
          </li>
        );
      })}
    </ul>
  );
}

function NewsSourceCard({ source }: { source: NewsStorySourceModel }) {
  const byline = [source.publication, source.date].filter(Boolean).join(' · ');

  return (
    <article className={cx('flex flex-col gap-2 px-5 py-4', TEMPLATE_CARD_SURFACE)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {byline && <span className="text-[13px] font-medium text-grey-04">{byline}</span>}

          {source.href ? (
            <Link
              href={source.href}
              className="text-[16.5px] leading-[23px] font-semibold text-text no-underline transition-colors hover:text-[#4c1fd4]"
            >
              {source.title}
            </Link>
          ) : source.onSelect ? (
            <button
              type="button"
              onClick={source.onSelect}
              className="cursor-pointer border-0 bg-transparent p-0 text-left text-[16.5px] leading-[23px] font-semibold text-text transition-colors hover:text-[#4c1fd4]"
            >
              {source.title}
            </button>
          ) : (
            <h3 className="m-0 text-[16.5px] leading-[23px] font-semibold text-text">{source.title}</h3>
          )}
        </div>

        <EntityOverflowMenu target={{ id: source.id, kind: 'Source', title: source.title }} className="shrink-0" />
      </div>

      {source.url && (
        <div className="flex justify-end pt-0.5">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-grey-04 no-underline transition-colors hover:text-text"
          >
            <span>View source article</span>
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      )}

      <EntityInlineContext targetId={source.id} targetTitle={source.title} targetKind="Source" />
    </article>
  );
}
