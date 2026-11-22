'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { RelationSmall } from '~/design-system/icons/relation-small';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';

import {
  type ClaimKind,
  type ContextPeekItemModel,
  type EntityFlagModel,
  type SubClaimModel,
  formatClaimKindLabel,
} from '../models';
import {
  AddClaimPopover,
  AddContextPopover,
  AddFlagPopover,
  InlinePagination,
  TemplateAddRelationPillPopover,
  TemplatePopoverPortalProvider,
  TemplateRelationPill,
} from './entity-overflow-menu';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArticleIcon,
  CloseIcon,
  DatasetIcon,
  DocumentIcon,
  FlagIcon,
  NetworkIcon,
  PlayIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  TweetIcon,
} from './icons';
import { SourceChipList } from './source-chip-list';
import { SplitBars } from './split-bars';
import { TemplateBadge, type TemplateBadgeTone } from './template-shell';

const PEEK_CLAIM_KIND_TONE: Record<ClaimKind, TemplateBadgeTone> = {
  fact: 'fact',
  judgment: 'judgment',
  'value-judgment': 'value',
};

export interface ContextPeekDrawerProps {
  item: ContextPeekItemModel | null;
  canGoBack?: boolean;
  backLabel?: string;
  onBack?: () => void;
  onClose: () => void;
}

function PeekMediaIcon({ type }: { type?: ContextPeekItemModel['mediaType'] }) {
  switch (type) {
    case 'video':
      return <PlayIcon className="size-4 text-purple" />;
    case 'tweet':
      return <TweetIcon className="size-4 text-text" />;
    case 'dataset':
      return <DatasetIcon className="size-4 text-ctaPrimary" />;
    case 'article':
      return <ArticleIcon className="size-4 text-ctaPrimary" />;
    case 'document':
      return <DocumentIcon className="size-4 text-grey-04" />;
    default:
      return null;
  }
}

interface PeekRelationEntry {
  id: string;
  fromTitle: string;
  predicate: string;
  toTitle: string;
  onSelectTo?: () => void;
}

/**
 * Unified right-hand slide-over Entity Side Panel.
 *
 * Lets readers verify a cited source, inspect an actor/entity's graph relations, check an
 * event/story, or drill directly into a `From → To` Relation entity pane without losing scroll
 * position on the active page.
 */
export function ContextPeekDrawer({ item, canGoBack, backLabel, onBack, onClose }: ContextPeekDrawerProps) {
  const [activeRelation, setActiveRelation] = React.useState<PeekRelationEntry | null>(null);

  React.useEffect(() => {
    setActiveRelation(null);
  }, [item?.id]);

  React.useEffect(() => {
    if (!item) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeRelation) {
          setActiveRelation(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRelation, item, onClose]);

  if (!item) return null;

  if (activeRelation) {
    return (
      <TemplatePopoverPortalProvider>
        <aside
          role="dialog"
          aria-label={`Relation: ${activeRelation.fromTitle} → ${activeRelation.toTitle}`}
          className="fixed top-11 right-0 bottom-0 z-[120] flex w-full max-w-[480px] flex-col border-l border-black/[0.06] bg-white shadow-[-16px_0_48px_rgba(0,0,0,0.08)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
            <button
              type="button"
              onClick={() => setActiveRelation(null)}
              className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] font-medium text-grey-04 transition-colors hover:text-[#4c1fd4]"
            >
              <ArrowLeftIcon className="size-3.5" />
              <span>Back to {activeRelation.fromTitle}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 cursor-pointer place-items-center rounded-full border border-transparent bg-grey-01 text-text transition-colors hover:bg-divider"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-[21px] leading-[27px] font-semibold text-pretty text-text">
                <span>{activeRelation.fromTitle}</span>
                <span className="mx-1.5 font-normal text-grey-04">→</span>
                <span>{activeRelation.toTitle}</span>
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-6 items-center gap-1 rounded-md border border-divider bg-grey-01 px-2 text-[12.5px] font-medium text-grey-05">
                  <RelationSmall />
                  <span>Relation</span>
                </span>
                <span className="inline-flex h-6 items-center rounded-md border border-divider bg-white px-2 text-[12.5px] font-medium text-text">
                  {activeRelation.predicate}
                </span>
              </div>
            </div>

            <section aria-label="Relation endpoints" className="flex flex-col gap-2.5">
              <h4 className="m-0 text-[17px] leading-[22px] font-semibold text-text">Statement</h4>
              <div className="flex flex-col divide-y divide-divider rounded-xl border border-black/[0.06] bg-white text-[14px]">
                <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="shrink-0 text-[12.5px] text-grey-04">From</span>
                  <button
                    type="button"
                    onClick={() => setActiveRelation(null)}
                    className="cursor-pointer border-0 bg-transparent p-0 text-right font-medium text-text transition-colors hover:text-[#4c1fd4]"
                  >
                    {activeRelation.fromTitle}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 bg-grey-01/60 px-4 py-2.5">
                  <span className="shrink-0 text-[12.5px] text-grey-04">Relation type</span>
                  <span className="inline-flex items-center gap-2 font-medium text-text">
                    <span>{activeRelation.predicate}</span>
                    <RightArrowLong color="grey-04" />
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="shrink-0 text-[12.5px] text-grey-04">To</span>
                  {activeRelation.onSelectTo ? (
                    <button
                      type="button"
                      onClick={() => {
                        const cb = activeRelation.onSelectTo;
                        setActiveRelation(null);
                        cb?.();
                      }}
                      className="cursor-pointer border-0 bg-transparent p-0 text-right font-medium text-text transition-colors hover:text-[#4c1fd4]"
                    >
                      {activeRelation.toTitle}
                    </button>
                  ) : (
                    <span className="text-right font-medium text-text">{activeRelation.toTitle}</span>
                  )}
                </div>
              </div>
            </section>

            <PeekAddedContextRelations
              key={`rel-ctx-${activeRelation.id}`}
              fromTitle={activeRelation.toTitle}
              relations={[]}
            />
            <PeekFlagsSection key={`rel-flg-${activeRelation.id}`} initialFlags={[]} />
          </div>
        </aside>
      </TemplatePopoverPortalProvider>
    );
  }

  return (
    <TemplatePopoverPortalProvider>
      <aside
        role="dialog"
        aria-label={item.title}
        className="fixed top-11 right-0 bottom-0 z-[120] flex w-full max-w-[480px] flex-col border-l border-black/[0.06] bg-white shadow-[-16px_0_48px_rgba(0,0,0,0.08)]"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
          <div className="flex items-center gap-2.5">
            {canGoBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <ArrowLeftIcon className="size-3.5" />
                <span>{backLabel ? `Back to ${backLabel}` : 'Back'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-transparent bg-grey-01 text-text transition-colors hover:bg-divider"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-2.5">
            {item.subtitle && (
              <span className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-grey-04">
                <PeekMediaIcon type={item.mediaType} />
                <span>{item.subtitle}</span>
              </span>
            )}
            <h2 className="m-0 text-[24px] leading-[30px] font-semibold text-pretty text-text">{item.title}</h2>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <TemplateBadge tone="neutral">{item.kindLabel}</TemplateBadge>
              {item.tags?.map(tag => (
                <TemplateBadge key={tag} tone="neutral">
                  {tag}
                </TemplateBadge>
              ))}
            </div>
          </div>

          {item.summary && <p className="m-0 text-[15px] leading-[23px] text-text/85">{item.summary}</p>}

          {item.quotes && item.quotes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {item.quotes.map(quote => {
                const attribution = [quote.speaker, quote.location].filter(Boolean).join(', ');
                return (
                  <blockquote
                    key={quote.id}
                    className="m-0 rounded-xl bg-grey-01/75 px-4 py-3 text-[14.5px] leading-[21px] text-text/90"
                  >
                    <p className="m-0">“{quote.text}”</p>
                    {attribution && <footer className="mt-1.5 text-[13px] text-grey-04">— {attribution}</footer>}
                  </blockquote>
                );
              })}
            </div>
          )}

          {item.settlingSources && item.settlingSources.length > 0 && <SourceChipList sources={item.settlingSources} />}

          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-text bg-text px-5 text-[15px] font-medium text-white no-underline transition-opacity hover:opacity-90"
            >
              <span>{item.externalLabel ?? 'Open source'}</span>
              <ArrowUpRightIcon className="size-4" />
            </a>
          )}

          {item.split && item.split.rows.length > 0 && (
            <div className="flex flex-col gap-3.5 rounded-xl bg-grey-01/70 p-4">
              <SplitBars rows={item.split.rows} density="compact" />

              {item.voteBox && (
                <div className="flex flex-col gap-2 border-t border-divider pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={item.voteBox.disabled}
                      aria-pressed={item.voteBox.userVote === 'agree'}
                      onClick={() => item.voteBox?.onVote('agree')}
                      className={cx(
                        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors',
                        item.voteBox.userVote === 'agree'
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-text'
                      )}
                    >
                      <ThumbUpIcon className="size-3.5" />
                      <span>Agree</span>
                    </button>
                    <button
                      type="button"
                      disabled={item.voteBox.disabled}
                      aria-pressed={item.voteBox.userVote === 'disagree'}
                      onClick={() => item.voteBox?.onVote('disagree')}
                      className={cx(
                        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium transition-colors',
                        item.voteBox.userVote === 'disagree'
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-text'
                      )}
                    >
                      <ThumbDownIcon className="size-3.5" />
                      <span>Disagree</span>
                    </button>
                    {item.voteBox.userVote && item.voteBox.onClear && (
                      <button
                        type="button"
                        onClick={item.voteBox.onClear}
                        className="cursor-pointer border-0 bg-transparent px-1 text-[13.5px] font-medium text-ctaPrimary hover:text-ctaHover"
                      >
                        Change
                      </button>
                    )}
                    {item.voteBox.countSummary && (
                      <span className="ml-auto text-[13.5px] whitespace-nowrap text-grey-04 tabular-nums">
                        {item.voteBox.countSummary}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {item.subClaims && item.subClaims.length > 0 && <PeekGroupedSubClaims subClaims={item.subClaims} />}

          {item.metadata && item.metadata.length > 0 && (
            <dl className="m-0 grid grid-cols-2 gap-4 border-y border-divider py-4">
              {item.metadata.map(entry => (
                <div key={entry.label} className="flex flex-col gap-0.5">
                  <dt className="text-[13px] text-grey-04">{entry.label}</dt>
                  <dd className="m-0 text-[15px] font-semibold text-text">{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <PeekAddedContextRelations
            key={`ctx-${item.id}`}
            fromTitle={item.title}
            relations={item.relations ?? []}
            onInspectRelation={setActiveRelation}
          />

          <PeekFlagsSection key={`flg-${item.id}`} initialFlags={item.flags ?? []} />

          {item.claims && item.claims.length > 0 && (
            <section className="flex flex-col gap-3">
              <h4 className="m-0 text-[17px] leading-[22px] font-semibold text-text">Linked claims</h4>
              <div className="flex flex-col gap-2.5">
                {item.claims.map(claim => (
                  <div key={claim.id} className="flex flex-col gap-2 rounded-xl bg-grey-01/65 p-3.5">
                    {claim.href ? (
                      <Link
                        href={claim.href}
                        onClick={onClose}
                        className="text-[15px] leading-[21px] font-semibold text-text no-underline hover:text-[#4c1fd4]"
                      >
                        {claim.title}
                      </Link>
                    ) : claim.onSelect ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          claim.onSelect?.();
                        }}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] leading-[21px] font-semibold text-text hover:text-[#4c1fd4]"
                      >
                        {claim.title}
                      </button>
                    ) : (
                      <span className="text-[15px] leading-[21px] font-semibold text-text">{claim.title}</span>
                    )}
                    <SplitBars rows={claim.split.rows} density="compact" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky footer CTA */}
        {(item.fullHref || item.onOpenFull) && (
          <div className="flex items-center justify-end border-t border-divider bg-white px-6 py-3.5">
            {item.fullHref ? (
              <Link
                href={item.fullHref}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>{item.openFullLabel ?? 'Open full page'}</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  item.onOpenFull?.();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <span>{item.openFullLabel ?? 'Open full page'}</span>
                <ArrowRightIcon className="size-4" />
              </button>
            )}
          </div>
        )}
      </aside>
    </TemplatePopoverPortalProvider>
  );
}

const PEEK_ROWS_PER_PAGE = 4;
const PEEK_PILLS_CAP = 6;
const PEEK_FLAGS_PER_PAGE = 3;

function PeekGroupedSubClaims({ subClaims }: { subClaims: readonly SubClaimModel[] }) {
  const [added, setAdded] = React.useState<SubClaimModel[]>([]);
  const combined = [...subClaims, ...added];

  const groups = [
    {
      label: 'Supporting claims',
      addLabel: 'Add supporting claim',
      stance: 'supports' as const,
      items: combined.filter(c => c.stance === 'supports'),
    },
    {
      label: 'Opposing claims',
      addLabel: 'Add opposing claim',
      stance: 'opposes' as const,
      items: combined.filter(c => c.stance === 'opposes'),
    },
    {
      label: 'Related claims',
      addLabel: 'Add related claim',
      stance: 'addresses' as const,
      items: combined.filter(c => c.stance !== 'supports' && c.stance !== 'opposes'),
    },
  ].filter(group => group.items.length > 0);

  return (
    <>
      {groups.map(group => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="m-0 text-[17px] leading-[22px] font-semibold text-text">{group.label}</h4>
            <AddClaimPopover
              label={group.addLabel}
              onSubmit={draft =>
                setAdded(prev => [
                  ...prev,
                  {
                    id: `peek-sub-${Date.now()}`,
                    title: draft.title,
                    kind: draft.kind,
                    stance: group.stance,
                    stat: draft.note,
                    split: { rows: [], isSplit: false },
                    sources: [],
                  },
                ])
              }
            />
          </div>
          <div className="flex flex-col gap-3">
            {group.items.map(subClaim => (
              <div
                key={subClaim.id}
                className="flex flex-col gap-2 rounded-xl border border-black/[0.05] bg-white p-3.5"
              >
                <span className="text-[15px] leading-[21px] font-semibold text-text">{subClaim.title}</span>
                {subClaim.kind && (
                  <div>
                    <TemplateBadge tone={PEEK_CLAIM_KIND_TONE[subClaim.kind]} className="!h-6 !px-2 !text-[12px]">
                      {formatClaimKindLabel(subClaim.kind)}
                    </TemplateBadge>
                  </div>
                )}
                {subClaim.stat && <span className="text-[13.5px] leading-[19px] text-grey-04">{subClaim.stat}</span>}
                <SplitBars rows={subClaim.split.rows} density="compact" />
                {subClaim.sources.length > 0 && <SourceChipList sources={subClaim.sources} />}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function PeekAddedContextRelations({
  fromTitle,
  relations,
  onInspectRelation,
}: {
  fromTitle: string;
  relations: NonNullable<ContextPeekItemModel['relations']>;
  onInspectRelation?: (entry: PeekRelationEntry) => void;
}) {
  const [deletedKeys, setDeletedKeys] = React.useState<ReadonlySet<string>>(() => new Set());
  const [added, setAdded] = React.useState<NonNullable<ContextPeekItemModel['relations']>[number][]>([]);
  const [page, setPage] = React.useState(1);
  const [expandedPredicates, setExpandedPredicates] = React.useState<ReadonlySet<string>>(() => new Set());

  const grouped = React.useMemo(() => {
    const map = new Map<string, NonNullable<ContextPeekItemModel['relations']>[number][]>();
    for (const rel of [...relations, ...added]) {
      const key = `${rel.id}-${rel.predicate}`;
      if (deletedKeys.has(key)) continue;
      const list = map.get(rel.predicate) ?? [];
      list.push(rel);
      map.set(rel.predicate, list);
    }
    return Array.from(map.entries()).map(([predicate, items]) => ({ predicate, items }));
  }, [added, deletedKeys, relations]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / PEEK_ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = grouped.slice((safePage - 1) * PEEK_ROWS_PER_PAGE, safePage * PEEK_ROWS_PER_PAGE);

  return (
    <section aria-label="Context" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 inline-flex items-center gap-2 text-[17px] leading-[22px] font-semibold text-text">
          <NetworkIcon className="size-4 text-grey-04" />
          <span>Context</span>
        </h4>
        <AddContextPopover
          onSubmit={(predicate, values) =>
            setAdded(prev => [
              ...prev,
              ...values.map((targetName, idx) => ({
                id: `peek-added-${Date.now()}-${idx}`,
                predicate,
                targetName,
              })),
            ])
          }
        />
      </div>

      {pagedGroups.length > 0 ? (
        <>
          <dl className="m-0 flex flex-col divide-y divide-divider/80 rounded-xl border border-black/[0.05] bg-grey-01/55 px-4 py-1.5">
            {pagedGroups.map(group => {
              const isExpanded = expandedPredicates.has(group.predicate);
              const hasOverflow = group.items.length > PEEK_PILLS_CAP;
              const visibleItems = isExpanded || !hasOverflow ? group.items : group.items.slice(0, PEEK_PILLS_CAP);
              const hiddenCount = group.items.length - visibleItems.length;

              return (
                <div
                  key={group.predicate}
                  className="group/rel-row grid grid-cols-1 items-baseline gap-x-3 gap-y-1.5 py-2.5 @[400px]:grid-cols-[120px_minmax(0,1fr)]"
                >
                  <dt className="text-[13px] font-medium text-grey-04">{group.predicate}</dt>
                  <dd className="m-0 flex min-w-0 flex-wrap items-center gap-1.5">
                    {visibleItems.map(rel => {
                      const key = `${rel.id}-${rel.predicate}`;
                      return (
                        <TemplateRelationPill
                          key={key}
                          predicate={group.predicate}
                          value={{
                            id: key,
                            label: rel.targetName,
                            onSelect: rel.onSelect,
                          }}
                          onOpenRelation={
                            onInspectRelation
                              ? () =>
                                  onInspectRelation({
                                    id: key,
                                    fromTitle,
                                    predicate: group.predicate,
                                    toTitle: rel.targetName,
                                    onSelectTo: rel.onSelect,
                                  })
                              : undefined
                          }
                          onDelete={() =>
                            setDeletedKeys(prev => {
                              const next = new Set(prev);
                              next.add(key);
                              return next;
                            })
                          }
                        />
                      );
                    })}

                    {hasOverflow && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPredicates(prev => {
                            const next = new Set(prev);
                            if (next.has(group.predicate)) {
                              next.delete(group.predicate);
                            } else {
                              next.add(group.predicate);
                            }
                            return next;
                          })
                        }
                        className="inline-flex h-6 cursor-pointer items-center rounded border border-grey-02 bg-white px-1.5 text-[12px] font-medium text-grey-04 tabular-nums transition-colors hover:border-text hover:text-text"
                      >
                        {isExpanded ? 'Show less' : `+${hiddenCount}`}
                      </button>
                    )}

                    <TemplateAddRelationPillPopover
                      predicate={group.predicate}
                      existingLabels={group.items.map(i => i.targetName)}
                      onAdd={targetName =>
                        setAdded(prev => [
                          ...prev,
                          { id: `peek-pill-${Date.now()}`, predicate: group.predicate, targetName },
                        ])
                      }
                    />
                  </dd>
                </div>
              );
            })}
          </dl>

          <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Context pages" />
        </>
      ) : (
        <p className="m-0 text-[14px] text-grey-04">No context added yet.</p>
      )}
    </section>
  );
}

function PeekFlagsSection({ initialFlags }: { initialFlags: readonly EntityFlagModel[] }) {
  const [addedFlags, setAddedFlags] = React.useState<EntityFlagModel[]>([]);
  const [votes, setVotes] = React.useState<Record<string, 'agree' | 'disagree' | null>>({});
  const [page, setPage] = React.useState(1);

  const allFlags = [...addedFlags, ...initialFlags];
  const totalPages = Math.max(1, Math.ceil(allFlags.length / PEEK_FLAGS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleFlags = allFlags.slice((safePage - 1) * PEEK_FLAGS_PER_PAGE, safePage * PEEK_FLAGS_PER_PAGE);

  return (
    <section aria-label="Disputes" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 inline-flex items-center gap-2 text-[17px] leading-[22px] font-semibold text-text">
          <FlagIcon className="size-4 text-grey-04" />
          <span>Disputes</span>
        </h4>
        <AddFlagPopover
          onSubmit={draft => {
            setAddedFlags(prev => [{ id: `peek-flg-${Date.now()}`, ...draft }, ...prev]);
            setPage(1);
          }}
        />
      </div>

      {visibleFlags.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {visibleFlags.map(flag => {
            const vote = votes[flag.id] ?? null;
            return (
              <article
                key={flag.id}
                className="flex flex-col gap-2 rounded-xl border border-black/[0.05] bg-grey-01/55 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
                    <FlagIcon className="size-3.5 text-grey-04" />
                    <span>{flag.reason ?? 'Disputed'}</span>
                  </span>
                  {flag.helpfulPercent !== undefined && (
                    <span className="text-[12px] text-grey-04 tabular-nums">{flag.helpfulPercent}% agree</span>
                  )}
                </div>
                <p className="m-0 text-[14px] leading-[20px] text-text/90">{flag.body}</p>
                <div className="flex items-center gap-1.5 pt-0.5" role="group" aria-label="Vote on dispute">
                  <button
                    type="button"
                    aria-pressed={vote === 'agree'}
                    onClick={() =>
                      setVotes(prev => ({ ...prev, [flag.id]: prev[flag.id] === 'agree' ? null : 'agree' }))
                    }
                    className={cx(
                      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                      vote === 'agree'
                        ? 'border-text bg-text text-white'
                        : 'border-grey-02 bg-white text-text hover:border-text'
                    )}
                  >
                    <ThumbUpIcon className="size-3" />
                    <span>Agree</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={vote === 'disagree'}
                    onClick={() =>
                      setVotes(prev => ({ ...prev, [flag.id]: prev[flag.id] === 'disagree' ? null : 'disagree' }))
                    }
                    className={cx(
                      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                      vote === 'disagree'
                        ? 'border-text bg-text text-white'
                        : 'border-grey-02 bg-white text-text hover:border-text'
                    )}
                  >
                    <ThumbDownIcon className="size-3" />
                    <span>Disagree</span>
                  </button>
                </div>
              </article>
            );
          })}
          <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Disputes pages" />
        </div>
      ) : (
        <p className="m-0 text-[14px] text-grey-04">No disputes</p>
      )}
    </section>
  );
}
