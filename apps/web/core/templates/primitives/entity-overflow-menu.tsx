'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { RelationSmall } from '~/design-system/icons/relation-small';

import type { EntityContextDataModel, EntityFlagModel, EntityTripleModel, EntityTripleValueModel } from '../models';
import {
  ArrowUpRightIcon,
  CloseIcon,
  FlagIcon,
  MoreHorizontalIcon,
  NetworkIcon,
  PlusIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from './icons';

export type EntityActionKind = 'flag' | 'add-context';

export interface EntityActionTarget {
  id: string;
  kind: string;
  title: string;
}

interface ResolvedEntityContext {
  triples: readonly EntityTripleModel[];
  flags: readonly EntityFlagModel[];
}

interface EntityActionContextValue {
  openComposer: (action: EntityActionKind, target: EntityActionTarget) => void;
  openViewer: (target: EntityActionTarget) => void;
  getContextForTarget: (targetId: string) => ResolvedEntityContext;
  deleteTripleValue: (targetId: string, valueId: string) => void;
  inspectRelation: (target: EntityActionTarget, predicate: string, value: EntityTripleValueModel) => void;
  popoverContainer: HTMLDivElement | null;
  showAllContext: boolean;
  toggleShowAllContext: () => void;
  setShowAllContext: (value: boolean) => void;
}

const EntityActionContext = React.createContext<EntityActionContextValue | null>(null);

const FLAG_REASONS = ['Disputed fact', 'Missing methodology', 'Missing framing', 'Outdated'] as const;
const SUGGESTED_PREDICATES = ['Related actors', 'Supporting source', 'Disputed by', 'Method', 'Limitation'] as const;

function countRelations(triples: readonly EntityTripleModel[]): number {
  return triples.reduce((sum, triple) => sum + triple.values.length, 0);
}

/** Matches Geo Genesis `LinkableRelationChip`'s two-dot hover trigger (`design-system/chip.tsx`). */
function RelationDots() {
  return (
    <svg width="2" height="6" viewBox="0 0 2 6" fill="none" aria-hidden>
      <circle cx="1" cy="1" r="1" fill="currentColor" />
      <circle cx="1" cy="5" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Relation pill matching Geo Genesis's `LinkableRelationChip` (`design-system/chip.tsx`):
 * bordered white chip with trailing two-dot handle that pops a top-right action bar on hover/click
 * with `RelationSmall` (go to relation) and `CheckCloseSmall` (delete).
 */
function TemplateRelationPill({
  predicate,
  value,
  compact = false,
  onOpenRelation,
  onDelete,
}: {
  predicate: string;
  value: EntityTripleValueModel;
  compact?: boolean;
  onOpenRelation?: () => void;
  onDelete?: () => void;
}) {
  const ctx = React.useContext(EntityActionContext);
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [isDotsHovered, setIsDotsHovered] = React.useState(false);
  const [isRelationHovered, setIsRelationHovered] = React.useState(false);
  const [isDeleteHovered, setIsDeleteHovered] = React.useState(false);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const labelClasses = cx(
    'text-left text-text no-underline',
    compact ? 'text-[12.5px] leading-[17px]' : 'text-[13px] leading-[18px]'
  );

  const relationAction = () => {
    setIsPopoverOpen(false);
    if (value.onOpenRelation) {
      value.onOpenRelation();
      return;
    }
    if (value.onSelect) {
      value.onSelect();
      return;
    }
    onOpenRelation?.();
  };

  return (
    <div
      className={cx(
        'group inline-flex items-center rounded border bg-white pl-1.5 tabular-nums transition-colors',
        compact ? 'py-px' : 'py-0.5',
        isRelationHovered || isDeleteHovered
          ? 'border-text text-text'
          : isDotsHovered
            ? 'border-grey-02'
            : 'border-grey-02 hover:border-text hover:text-text'
      )}
    >
      {value.href ? (
        <Link href={value.href} className={labelClasses}>
          {value.label}
        </Link>
      ) : value.onSelect ? (
        <button
          type="button"
          onClick={value.onSelect}
          className={cx(labelClasses, 'cursor-pointer border-0 bg-transparent p-0')}
        >
          {value.label}
        </button>
      ) : (
        <span className={labelClasses}>{value.label}</span>
      )}

      <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Relation actions for ${value.label}`}
            onClick={event => {
              event.stopPropagation();
              setIsPopoverOpen(prev => !prev);
            }}
            onMouseEnter={() => {
              setIsPopoverOpen(true);
              setIsDotsHovered(true);
            }}
            onMouseLeave={event => {
              setIsDotsHovered(false);
              const next = event.relatedTarget as Node | null;
              if (next && contentRef.current?.contains(next)) return;
              setIsPopoverOpen(false);
            }}
            className={cx(
              'relative flex shrink-0 cursor-pointer items-center border-0 bg-transparent px-1.5 py-1 text-grey-03 transition-colors group-hover:text-text focus-visible:text-text',
              (isRelationHovered || isDeleteHovered) && 'text-text!'
            )}
          >
            <RelationDots />
          </button>
        </Popover.Trigger>

        <Popover.Portal container={ctx?.popoverContainer ?? undefined}>
          <Popover.Content
            ref={contentRef}
            side="top"
            align="end"
            sideOffset={-4}
            className="shadow-sm pointer-events-auto z-[160] flex items-center rounded-[7px] border border-grey-04 bg-white"
            onCloseAutoFocus={event => event.preventDefault()}
            onMouseLeave={event => {
              const next = event.relatedTarget as Node | null;
              if (next && triggerRef.current?.contains(next)) return;
              setIsPopoverOpen(false);
            }}
          >
            {value.relationHref || value.href ? (
              <Link
                href={value.relationHref ?? value.href ?? '#'}
                aria-label={`Go to relation: ${predicate} → ${value.label}`}
                title="Go to relation"
                onMouseEnter={() => setIsRelationHovered(true)}
                onMouseLeave={() => setIsRelationHovered(false)}
                className={cx(
                  'inline-flex items-center p-1 text-grey-04 transition-colors',
                  isRelationHovered && 'text-text!',
                  isDeleteHovered && 'text-grey-03!'
                )}
              >
                <RelationSmall />
              </Link>
            ) : (
              <button
                type="button"
                aria-label={`Go to relation: ${predicate} → ${value.label}`}
                title="Go to relation"
                onClick={relationAction}
                onMouseEnter={() => setIsRelationHovered(true)}
                onMouseLeave={() => setIsRelationHovered(false)}
                className={cx(
                  'inline-flex cursor-pointer items-center border-0 bg-transparent p-1 text-grey-04 transition-colors',
                  isRelationHovered && 'text-text!',
                  isDeleteHovered && 'text-grey-03!'
                )}
              >
                <RelationSmall />
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                aria-label={`Delete relation: ${value.label}`}
                title="Delete relation"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onDelete();
                }}
                onMouseEnter={() => setIsDeleteHovered(true)}
                onMouseLeave={() => setIsDeleteHovered(false)}
                className={cx(
                  'inline-flex cursor-pointer items-center border-0 bg-transparent p-1 text-grey-04 transition-colors',
                  isRelationHovered && 'text-grey-03!',
                  isDeleteHovered && 'text-text!'
                )}
              >
                <CheckCloseSmall />
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/**
 * Renders added context triples as crisp key → multi-value Geo relation pill rows.
 */
function TripleKeyValueList({
  target,
  triples,
  compact = false,
  onInspectRelation,
  onDeleteValue,
}: {
  target: EntityActionTarget;
  triples: readonly EntityTripleModel[];
  compact?: boolean;
  onInspectRelation?: (target: EntityActionTarget, predicate: string, value: EntityTripleValueModel) => void;
  onDeleteValue?: (targetId: string, valueId: string) => void;
}) {
  if (triples.length === 0) return null;

  return (
    <dl
      className={cx(
        'm-0 flex flex-col divide-y divide-divider/80 rounded-xl border border-black/[0.05] bg-grey-01/55',
        compact ? 'px-3 py-1' : 'px-4 py-1.5'
      )}
    >
      {triples.map(triple => (
        <div
          key={triple.id}
          className={cx(
            'grid grid-cols-1 items-baseline gap-x-3 gap-y-1.5 @[420px]:grid-cols-[126px_minmax(0,1fr)]',
            compact ? 'py-2' : 'py-2.5'
          )}
        >
          <dt className={cx('font-medium text-grey-04', compact ? 'text-[12.5px]' : 'text-[13px]')}>
            {triple.predicate}
          </dt>
          <dd className="m-0 flex min-w-0 flex-wrap items-center gap-1.5">
            {triple.values.map(val => (
              <TemplateRelationPill
                key={val.id}
                predicate={triple.predicate}
                value={val}
                compact={compact}
                onOpenRelation={onInspectRelation ? () => onInspectRelation(target, triple.predicate, val) : undefined}
                onDelete={onDeleteValue ? () => onDeleteValue(target.id, val.id) : undefined}
              />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Provides:
 * - Quiet graph (`NetworkIcon`) & flag (`FlagIcon`) count chips beside `...`
 * - Slide-over Context drawer displaying attached triples (key → multi-value relations) & flags
 * - Interactive `Add context` (triple composer) & `Flag` modal dialogs
 * - Page-level `Show all context` toggle expanding triples & flags inline across the page
 */
export function EntityActionProvider({
  initialContextByTarget,
  children,
}: {
  initialContextByTarget?: Readonly<Record<string, EntityContextDataModel>>;
  children: React.ReactNode;
}) {
  const [composer, setComposer] = React.useState<{ action: EntityActionKind; target: EntityActionTarget } | null>(null);
  const [viewerTarget, setViewerTarget] = React.useState<EntityActionTarget | null>(null);
  const [inspectedRelation, setInspectedRelation] = React.useState<{
    subject: string;
    predicate: string;
    object: string;
  } | null>(null);
  const [userContextByTarget, setUserContextByTarget] = React.useState<
    Readonly<Record<string, { triples: readonly EntityTripleModel[]; flags: readonly EntityFlagModel[] }>>
  >({});
  const [deletedValueIdsByTarget, setDeletedValueIdsByTarget] = React.useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [ratings, setRatings] = React.useState<Readonly<Record<string, 'helpful' | 'not-helpful' | null>>>({});
  const [showAllContext, setShowAllContext] = React.useState(false);
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLDivElement | null>(null);

  // Composer form fields
  const [predicate, setPredicate] = React.useState('');
  const [valuesInput, setValuesInput] = React.useState('');
  const [flagReason, setFlagReason] = React.useState<string>(FLAG_REASONS[0]);
  const [flagBody, setFlagBody] = React.useState('');
  const [sourceUrl, setSourceUrl] = React.useState('');

  const openComposer = React.useCallback((action: EntityActionKind, target: EntityActionTarget) => {
    setViewerTarget(null);
    setInspectedRelation(null);
    setComposer({ action, target });
    setPredicate('');
    setValuesInput('');
    setFlagReason(FLAG_REASONS[0]);
    setFlagBody('');
    setSourceUrl('');
  }, []);

  const openViewer = React.useCallback((target: EntityActionTarget) => {
    setComposer(null);
    setInspectedRelation(null);
    setViewerTarget(target);
  }, []);

  const closeAll = React.useCallback(() => {
    setComposer(null);
    setViewerTarget(null);
    setInspectedRelation(null);
  }, []);

  React.useEffect(() => {
    if (!composer && !viewerTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composer, viewerTarget, closeAll]);

  const deleteTripleValue = React.useCallback((targetId: string, valueId: string) => {
    setDeletedValueIdsByTarget(prev => ({
      ...prev,
      [targetId]: [...(prev[targetId] ?? []), valueId],
    }));
  }, []);

  const inspectRelation = React.useCallback(
    (target: EntityActionTarget, relPredicate: string, value: EntityTripleValueModel) => {
      setComposer(null);
      setViewerTarget(target);
      setInspectedRelation({ subject: target.title, predicate: relPredicate, object: value.label });
    },
    []
  );

  const getContextForTarget = React.useCallback(
    (targetId: string): ResolvedEntityContext => {
      const seeded = initialContextByTarget?.[targetId];
      const added = userContextByTarget[targetId];
      const deleted = new Set(deletedValueIdsByTarget[targetId] ?? []);
      const combinedTriples = [...(seeded?.triples ?? []), ...(added?.triples ?? [])]
        .map(triple => ({
          ...triple,
          values: triple.values.filter(val => !deleted.has(val.id)),
        }))
        .filter(triple => triple.values.length > 0);

      return {
        triples: combinedTriples,
        flags: [...(added?.flags ?? []), ...(seeded?.flags ?? [])],
      };
    },
    [deletedValueIdsByTarget, initialContextByTarget, userContextByTarget]
  );

  const toggleShowAllContext = React.useCallback(() => {
    setShowAllContext(prev => !prev);
  }, []);

  const contextValue = React.useMemo<EntityActionContextValue>(
    () => ({
      openComposer,
      openViewer,
      getContextForTarget,
      deleteTripleValue,
      inspectRelation,
      popoverContainer,
      showAllContext,
      toggleShowAllContext,
      setShowAllContext,
    }),
    [
      openComposer,
      openViewer,
      getContextForTarget,
      deleteTripleValue,
      inspectRelation,
      popoverContainer,
      showAllContext,
      toggleShowAllContext,
    ]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!composer) return;
    const target = composer.target;

    if (composer.action === 'add-context') {
      const cleanPredicate = predicate.trim();
      const parsedValues = valuesInput
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
      if (!cleanPredicate || parsedValues.length === 0) return;

      const newTriple: EntityTripleModel = {
        id: `tr-${Date.now()}`,
        predicate: cleanPredicate,
        values: parsedValues.map((label, idx) => ({ id: `tv-${Date.now()}-${idx}`, label })),
      };
      setUserContextByTarget(prev => {
        const current = prev[target.id] ?? { triples: [], flags: [] };
        return {
          ...prev,
          [target.id]: { ...current, triples: [...current.triples, newTriple] },
        };
      });
      setComposer(null);
      return;
    }

    if (flagBody.trim().length < 5) return;
    const newFlag: EntityFlagModel = {
      id: `flg-${Date.now()}`,
      reason: flagReason,
      body: flagBody.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
    };
    setUserContextByTarget(prev => {
      const current = prev[target.id] ?? { triples: [], flags: [] };
      return {
        ...prev,
        [target.id]: { ...current, flags: [newFlag, ...current.flags] },
      };
    });
    setComposer(null);
  };

  const viewerData = viewerTarget ? getContextForTarget(viewerTarget.id) : { triples: [], flags: [] };

  return (
    <EntityActionContext.Provider value={contextValue}>
      {children}

      {/* Context (Added context & Flags) non-blocking right detail pane */}
      {viewerTarget && (
        <aside
          role="dialog"
          aria-label={`Context for ${viewerTarget.title}`}
          className="fixed top-11 right-0 bottom-0 z-[120] flex w-full max-w-[460px] flex-col border-l border-black/[0.06] bg-white shadow-[-12px_0_40px_rgba(0,0,0,0.08)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-divider px-6 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                <NetworkIcon className="size-3.5 text-grey-04" />
                <span>Context · {viewerTarget.kind}</span>
              </span>
              <h3 className="m-0 text-[17px] leading-[23px] font-semibold text-pretty text-text">
                {viewerTarget.title}
              </h3>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openComposer('add-context', viewerTarget)}
                aria-label="Add context"
                title="Add context"
                className="inline-grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <PlusIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => openComposer('flag', viewerTarget)}
                aria-label="Flag"
                title="Flag"
                className="inline-grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <FlagIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={closeAll}
                aria-label="Close"
                className="inline-grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
            {inspectedRelation && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-ctaPrimary/20 bg-ctaTertiary/45 p-3.5 text-[13.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.04em] text-ctaPrimary uppercase">
                    <RelationSmall />
                    <span>Relation entity</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectedRelation(null)}
                    aria-label="Dismiss relation"
                    className="cursor-pointer border-0 bg-transparent p-0 text-grey-04 hover:text-text"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>
                <p className="m-0 leading-[19px] text-text">
                  <span className="font-medium">{inspectedRelation.subject}</span>{' '}
                  <span className="text-grey-04">→ {inspectedRelation.predicate} →</span>{' '}
                  <span className="font-semibold">{inspectedRelation.object}</span>
                </p>
              </div>
            )}

            {viewerData.triples.length === 0 && viewerData.flags.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-grey-02 px-4 py-5 text-[14.5px] text-grey-04">
                No context or flags added yet. Use + or the flag icon above to contribute.
              </p>
            ) : (
              <>
                {viewerData.triples.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                      <NetworkIcon className="size-3.5" />
                      <span>Added context ({countRelations(viewerData.triples)})</span>
                    </span>
                    <div className="@container">
                      <TripleKeyValueList
                        target={viewerTarget}
                        triples={viewerData.triples}
                        onInspectRelation={inspectRelation}
                        onDeleteValue={deleteTripleValue}
                      />
                    </div>
                  </section>
                )}

                {viewerData.flags.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                      <FlagIcon className="size-3.5 text-grey-04" />
                      <span>Flags ({viewerData.flags.length})</span>
                    </span>

                    <div className="flex flex-col gap-3">
                      {viewerData.flags.map(flag => {
                        const rating = ratings[flag.id] ?? null;
                        return (
                          <article
                            key={flag.id}
                            className="flex flex-col gap-2.5 rounded-xl border border-black/[0.05] bg-grey-01/55 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
                                <FlagIcon className="size-3.5 text-grey-04" />
                                <span>{flag.reason ?? 'Flagged'}</span>
                              </span>

                              {flag.helpfulPercent !== undefined && (
                                <span className="text-[12.5px] text-grey-04 tabular-nums">
                                  {flag.bridging ? 'Helpful across communities · ' : ''}
                                  {flag.helpfulPercent}%
                                </span>
                              )}
                            </div>

                            <p className="m-0 text-[14.5px] leading-[21px] text-text/90">{flag.body}</p>

                            {flag.sourceUrl && (
                              <a
                                href={flag.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
                              >
                                <span>{flag.sourceLabel ?? flag.sourceUrl}</span>
                                <ArrowUpRightIcon className="size-3.5" />
                              </a>
                            )}

                            <div className="flex items-center gap-1.5 pt-1">
                              <span className="mr-1 text-[12.5px] text-grey-04">Helpful?</span>
                              <button
                                type="button"
                                aria-pressed={rating === 'helpful'}
                                onClick={() =>
                                  setRatings(prev => ({
                                    ...prev,
                                    [flag.id]: prev[flag.id] === 'helpful' ? null : 'helpful',
                                  }))
                                }
                                className={cx(
                                  'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                                  rating === 'helpful'
                                    ? 'border-text bg-text text-white'
                                    : 'border-grey-02 bg-white text-text hover:border-text'
                                )}
                              >
                                <ThumbUpIcon className="size-3" />
                                <span>Yes</span>
                              </button>
                              <button
                                type="button"
                                aria-pressed={rating === 'not-helpful'}
                                onClick={() =>
                                  setRatings(prev => ({
                                    ...prev,
                                    [flag.id]: prev[flag.id] === 'not-helpful' ? null : 'not-helpful',
                                  }))
                                }
                                className={cx(
                                  'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                                  rating === 'not-helpful'
                                    ? 'border-text bg-text text-white'
                                    : 'border-grey-02 bg-white text-text hover:border-text'
                                )}
                              >
                                <ThumbDownIcon className="size-3" />
                                <span>No</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </aside>
      )}

      {/* Add context (Triple) / Flag composer dialog */}
      {composer && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div aria-hidden onClick={closeAll} className="fixed inset-0 bg-black/25 backdrop-blur-[1px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              composer.action === 'flag' ? `Flag ${composer.target.title}` : `Add context to ${composer.target.title}`
            }
            className="rounded-2xl relative z-10 flex w-full max-w-[480px] flex-col gap-4 border border-black/[0.06] bg-white p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                  {composer.action === 'flag' ? (
                    <>
                      <FlagIcon className="size-3.5 text-grey-04" />
                      <span>Flag · {composer.target.kind}</span>
                    </>
                  ) : (
                    <>
                      <NetworkIcon className="size-3.5 text-grey-04" />
                      <span>Add context · {composer.target.kind}</span>
                    </>
                  )}
                </span>
                <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-pretty text-text">
                  {composer.target.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeAll}
                aria-label="Close"
                className="inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {composer.action === 'add-context' ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_PREDICATES.map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPredicate(item)}
                        className={cx(
                          'cursor-pointer rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                          predicate === item
                            ? 'border-text bg-text text-white'
                            : 'border-grey-02 bg-white text-grey-05 hover:border-text hover:text-text'
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13.5px] font-medium text-text">Property (relation key)</span>
                    <input
                      type="text"
                      value={predicate}
                      onChange={e => setPredicate(e.target.value)}
                      placeholder="e.g. Legal status, Supporting reports, Related actors"
                      className="h-10 w-full rounded-xl border border-grey-02 bg-white px-3.5 text-[14.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13.5px] font-medium text-text">Values (comma-separated for multiple)</span>
                    <input
                      type="text"
                      value={valuesInput}
                      onChange={e => setValuesInput(e.target.value)}
                      placeholder="e.g. ICJ Provisional Order, UN Commission of Inquiry"
                      className="h-10 w-full rounded-xl border border-grey-02 bg-white px-3.5 text-[14.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {FLAG_REASONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={flagReason === option}
                        onClick={() => setFlagReason(option)}
                        className={cx(
                          'cursor-pointer rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                          flagReason === option
                            ? 'border-text bg-text text-white'
                            : 'border-grey-02 bg-white text-text hover:border-text'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13.5px] font-medium text-text">Why are you flagging this?</span>
                    <textarea
                      rows={3}
                      value={flagBody}
                      onChange={e => setFlagBody(e.target.value)}
                      placeholder="Describe what is inaccurate, disputed, or missing methodology..."
                      className="w-full resize-none rounded-xl border border-grey-02 bg-white px-3.5 py-2.5 text-[14.5px] leading-[21px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13.5px] font-medium text-text">Supporting source (optional)</span>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={e => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="h-10 w-full rounded-xl border border-grey-02 bg-white px-3.5 text-[14.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                    />
                  </label>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeAll}
                  className="inline-flex h-9 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-4 text-[14px] font-medium text-text hover:border-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    composer.action === 'add-context'
                      ? !predicate.trim() || !valuesInput.trim()
                      : flagBody.trim().length < 5
                  }
                  className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {composer.action === 'flag' ? 'Submit flag' : 'Add context'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-z portal container so relation pill popovers always render above the slide-over drawer */}
      <div ref={setPopoverContainer} className="pointer-events-none fixed inset-0 z-[160]" />
    </EntityActionContext.Provider>
  );
}

/**
 * Renders attached key–value triples (and any flags) inline beneath an entity ONLY when the
 * page-level `Show all context` toggle is active. Returns `null` at rest.
 */
export function EntityInlineContext({
  targetId,
  targetTitle,
  targetKind = 'Entity',
  className,
}: {
  targetId: string;
  targetTitle?: string;
  targetKind?: string;
  className?: string;
}) {
  const ctx = React.useContext(EntityActionContext);
  if (!ctx || !ctx.showAllContext) return null;

  const { triples, flags } = ctx.getContextForTarget(targetId);
  if (triples.length === 0 && flags.length === 0) return null;

  const target: EntityActionTarget = { id: targetId, kind: targetKind, title: targetTitle ?? targetId };

  return (
    <div className={cx('@container flex flex-col gap-2', className)}>
      {triples.length > 0 && (
        <TripleKeyValueList
          target={target}
          triples={triples}
          compact
          onInspectRelation={ctx.inspectRelation}
          onDeleteValue={ctx.deleteTripleValue}
        />
      )}

      {flags.map(flag => (
        <div
          key={flag.id}
          className="flex flex-col gap-1 rounded-xl border border-black/[0.05] bg-grey-01/55 px-3 py-2 text-[13px] leading-[18px]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text">
              <FlagIcon className="size-3 text-grey-04" />
              <span>{flag.reason ?? 'Flagged'}</span>
            </span>
            {flag.helpfulPercent !== undefined && (
              <span className="text-[12px] text-grey-04 tabular-nums">{flag.helpfulPercent}% helpful</span>
            )}
          </div>
          <p className="m-0 text-text/85">{flag.body}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Subtle active indicator shown in a page header when `Show all context` is toggled ON.
 */
export function EntityContextTogglePill({ className }: { className?: string }) {
  const ctx = React.useContext(EntityActionContext);
  if (!ctx || !ctx.showAllContext) return null;

  return (
    <button
      type="button"
      onClick={() => ctx.setShowAllContext(false)}
      className={cx(
        'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-ctaPrimary/20 bg-ctaTertiary px-2.5 text-[12.5px] font-medium whitespace-nowrap text-ctaPrimary transition-colors hover:border-ctaPrimary/40',
        className
      )}
    >
      <NetworkIcon className="size-3.5" />
      <span>Showing context</span>
      <CloseIcon className="size-3" />
    </button>
  );
}

export interface EntityOverflowMenuProps {
  target: EntityActionTarget;
  /** When true (e.g. page header), includes the page-wide `Show all context` toggle in the menu. */
  isPageRoot?: boolean;
  onFlag?: (target: EntityActionTarget) => void;
  onAddContext?: (target: EntityActionTarget) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Quiet `...` overflow menu paired with subtle graph (`NetworkIcon`) and flag (`FlagIcon`) count chips
 * whenever triples or flags are attached to the entity.
 */
export function EntityOverflowMenu({
  target,
  isPageRoot = false,
  onFlag,
  onAddContext,
  size = 'sm',
  className,
}: EntityOverflowMenuProps) {
  const ctx = React.useContext(EntityActionContext);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const data = ctx?.getContextForTarget(target.id) ?? { triples: [], flags: [] };
  const relationCount = countRelations(data.triples);
  const flagCount = data.flags.length;
  const hasAny = relationCount > 0 || flagCount > 0;

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const triggerAction = (action: EntityActionKind) => {
    setOpen(false);
    if (action === 'flag' && onFlag) {
      onFlag(target);
      return;
    }
    if (action === 'add-context' && onAddContext) {
      onAddContext(target);
      return;
    }
    ctx?.openComposer(action, target);
  };

  const triggerShowContext = () => {
    setOpen(false);
    ctx?.openViewer(target);
  };

  return (
    <div
      ref={containerRef}
      className={cx('relative inline-flex shrink-0 items-center gap-1', className)}
      onClick={e => e.stopPropagation()}
    >
      {!isPageRoot && relationCount > 0 && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            ctx?.openViewer(target);
          }}
          aria-label={`Show ${relationCount} context relations for ${target.title}`}
          title={`${relationCount} attached relations`}
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border-0 bg-grey-01 px-2 text-[12px] font-medium whitespace-nowrap text-grey-05 tabular-nums transition-colors hover:bg-grey-02/70 hover:text-text"
        >
          <NetworkIcon className="size-3.5 text-grey-04" />
          <span>{relationCount}</span>
        </button>
      )}

      {!isPageRoot && flagCount > 0 && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            ctx?.openViewer(target);
          }}
          aria-label={`Show ${flagCount} ${flagCount === 1 ? 'flag' : 'flags'} for ${target.title}`}
          title={`${flagCount} ${flagCount === 1 ? 'flag' : 'flags'}`}
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border-0 bg-grey-01 px-2 text-[12px] font-medium whitespace-nowrap text-grey-05 tabular-nums transition-colors hover:bg-grey-02/70 hover:text-text"
        >
          <FlagIcon className="size-3 text-grey-04" />
          <span>{flagCount}</span>
        </button>
      )}

      <button
        type="button"
        aria-label={`More actions for ${target.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={event => {
          event.stopPropagation();
          setOpen(prev => !prev);
        }}
        className={cx(
          'inline-grid cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text',
          open && 'bg-grey-01 text-text',
          size === 'md' ? 'size-8' : 'size-7'
        )}
      >
        <MoreHorizontalIcon className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${target.title}`}
          className="absolute top-full right-0 z-50 mt-1 flex w-[204px] flex-col rounded-xl border border-black/[0.06] bg-white p-1.5 shadow-[0_14px_38px_-6px_rgba(0,0,0,0.12),0_3px_10px_-2px_rgba(0,0,0,0.05)]"
        >
          {isPageRoot && ctx && (
            <>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={ctx.showAllContext}
                onClick={() => {
                  ctx.toggleShowAllContext();
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
              >
                <span className="inline-flex items-center gap-2">
                  <NetworkIcon className="size-4 text-grey-04" />
                  <span>Show all context</span>
                </span>
                <span
                  aria-hidden
                  className={cx(
                    'inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
                    ctx.showAllContext ? 'bg-text' : 'bg-grey-02'
                  )}
                >
                  <span
                    className={cx(
                      'size-3 rounded-full bg-white transition-transform',
                      ctx.showAllContext && 'translate-x-3'
                    )}
                  />
                </span>
              </button>
              <div className="my-1 h-px bg-divider" />
            </>
          )}

          {!isPageRoot && hasAny && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={triggerShowContext}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
              >
                <span className="inline-flex items-center gap-2.5">
                  <NetworkIcon className="size-4 text-ctaPrimary" />
                  <span>Show context</span>
                </span>
                <span className="text-[12.5px] text-grey-04 tabular-nums">{relationCount + flagCount}</span>
              </button>
              <div className="my-1 h-px bg-divider" />
            </>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => triggerAction('add-context')}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
          >
            <NetworkIcon className="size-4 text-grey-04" />
            <span>Add context</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => triggerAction('flag')}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
          >
            <FlagIcon className="size-4 text-grey-04" />
            <span>Flag</span>
          </button>
        </div>
      )}
    </div>
  );
}
