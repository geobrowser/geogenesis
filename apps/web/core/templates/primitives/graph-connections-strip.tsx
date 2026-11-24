'use client';

import * as React from 'react';

import cx from 'classnames';

import type { GraphConnectionGroupModel } from '../models';
import { TEMPLATE_ACTIONS } from '../template-actions';
import {
  AddContextPopover,
  type EntityActionTarget,
  EntityFlagsSection,
  InlinePagination,
  TemplateAddRelationPillPopover,
  TemplateRelationPill,
  useEntityActionContext,
} from './entity-overflow-menu';
import { TEMPLATE_CARD_SURFACE, TemplateEmptyState } from './template-shell';

const GROUPS_PER_PAGE = 5;
const PILLS_COLLAPSE_CAP = 6;

export interface GraphConnectionsStripProps {
  groups?: readonly GraphConnectionGroupModel[];
  /** Entity owning this context strip; enables right-aligned `+`, per-row pill `+`, and Relation pane inspection. */
  target?: EntityActionTarget;
  className?: string;
}

/**
 * Typed key–value relation strip surfacing context (actors, events, sources, debates,
 * subclaims) using Geo Genesis relation pills with hover relation/delete actions, inline `+`
 * pill adding per relation type, and pagination. Always renders when `target` is provided.
 */
export function GraphConnectionsStrip({ groups = [], target, className }: GraphConnectionsStripProps) {
  const ctx = useEntityActionContext();
  const [deletedIds, setDeletedIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [page, setPage] = React.useState(1);
  const [expandedPredicates, setExpandedPredicates] = React.useState<ReadonlySet<string>>(() => new Set());

  const visibleGroups = React.useMemo(() => {
    const addedTriples = target && ctx ? ctx.getAddedTriplesForTarget(target.id) : [];
    const merged: GraphConnectionGroupModel[] = [
      ...groups,
      ...addedTriples.map(triple => ({
        predicate: triple.predicate,
        items: triple.values.map(val => ({
          id: val.id,
          label: val.label,
          kind: 'entity' as const,
          href: val.href,
          onSelect: val.onSelect,
        })),
      })),
    ];

    const byPredicate = new Map<string, GraphConnectionGroupModel['items'][number][]>();
    for (const group of merged) {
      const remaining = group.items.filter(item => !deletedIds.has(item.id));
      if (remaining.length === 0) continue;
      const existing = byPredicate.get(group.predicate) ?? [];
      byPredicate.set(group.predicate, [...existing, ...remaining]);
    }
    return Array.from(byPredicate.entries()).map(([predicate, items]) => ({ predicate, items }));
  }, [ctx, deletedIds, groups, target]);

  React.useEffect(() => {
    setPage(1);
  }, [target?.id]);

  // Nothing to read and (with Add context off, GEO-3819) nothing to add: no section.
  if (visibleGroups.length === 0 && (!target || !TEMPLATE_ACTIONS.addContext)) return null;

  const totalPages = Math.max(1, Math.ceil(visibleGroups.length / GROUPS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = visibleGroups.slice((safePage - 1) * GROUPS_PER_PAGE, safePage * GROUPS_PER_PAGE);

  return (
    <section aria-label="Context" className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">Context</h2>

        {target && ctx && <AddContextPopover onSubmit={(pred, vals) => ctx.addTriple(target.id, pred, vals)} />}
      </div>

      {pagedGroups.length > 0 ? (
        <div className={cx('@container flex flex-col gap-3 px-5 py-4', TEMPLATE_CARD_SURFACE)}>
          <dl className="m-0 flex flex-col divide-y divide-divider/80">
            {pagedGroups.map(group => {
              const isExpanded = expandedPredicates.has(group.predicate);
              const hasOverflow = group.items.length > PILLS_COLLAPSE_CAP;
              const visibleItems = isExpanded || !hasOverflow ? group.items : group.items.slice(0, PILLS_COLLAPSE_CAP);
              const hiddenCount = group.items.length - visibleItems.length;

              return (
                <div
                  key={group.predicate}
                  className="group/rel-row grid grid-cols-1 items-baseline gap-x-3 gap-y-1.5 py-2.5 first:pt-0.5 last:pb-0 @[360px]:grid-cols-[110px_minmax(0,1fr)]"
                >
                  <dt className="text-[13.5px] font-medium text-grey-04">{group.predicate}</dt>
                  <dd className="m-0 flex min-w-0 flex-wrap items-center gap-1.5">
                    {visibleItems.map(item => {
                      const pillValue = {
                        id: item.id,
                        label: item.label,
                        kind: item.kind,
                        href: item.href,
                        onSelect: item.onSelect,
                        relationHref: item.relationHref,
                      };
                      return (
                        <TemplateRelationPill
                          key={item.id}
                          predicate={group.predicate}
                          value={pillValue}
                          onOpenRelation={
                            target && ctx
                              ? () => ctx.inspectRelation(target, group.predicate, pillValue, { returnToViewer: false })
                              : undefined
                          }
                          onDelete={() => {
                            if (target && ctx) {
                              ctx.deleteTripleValue(target.id, item.id);
                            }
                            setDeletedIds(prev => {
                              const next = new Set(prev);
                              next.add(item.id);
                              return next;
                            });
                          }}
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

                    {target && ctx && TEMPLATE_ACTIONS.addContext && (
                      <TemplateAddRelationPillPopover
                        predicate={group.predicate}
                        existingLabels={group.items.map(i => i.label)}
                        onAdd={label => ctx.addTripleValue(target.id, group.predicate, label)}
                      />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Context pages" />
        </div>
      ) : (
        <TemplateEmptyState>No context added yet.</TemplateEmptyState>
      )}
    </section>
  );
}

/**
 * Shared 2-column footer row placing `Context` and `Disputes` side-by-side on desktop
 * (stacking cleanly on narrow viewports or compact side panels).
 */
export function EntityContextAndDisputes({
  groups,
  target,
  className,
}: {
  groups?: readonly GraphConnectionGroupModel[];
  target: EntityActionTarget;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'grid grid-cols-1 items-start gap-8 empty:hidden @[720px]:auto-cols-fr @[720px]:grid-flow-col',
        className
      )}
    >
      <GraphConnectionsStrip groups={groups ?? []} target={target} />
      <EntityFlagsSection target={target} />
    </div>
  );
}
