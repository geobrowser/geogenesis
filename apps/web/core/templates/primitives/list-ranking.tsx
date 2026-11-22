'use client';

import * as React from 'react';

import cx from 'classnames';
import { createPortal } from 'react-dom';

import { OrderDots } from '~/design-system/icons/order-dots';
import { RankingChart } from '~/design-system/icons/ranking-chart';

import {
  RANKING_DROP_ROW_ATTRIBUTE,
  RANKING_ENTITY_DRAG_TYPE,
  dropIndexFromPointer,
  isRankingEntityDrag,
  rankingEntityDragProps,
} from '~/partials/blocks/table/ranking-entity-drag';
import { RankingMyRankingDndList } from '~/partials/blocks/table/ranking-my-ranking-dnd';

import { ArrowLeftIcon, CloseIcon, PlusIcon, SearchIcon } from './icons';
import { TEMPLATE_CARD_SURFACE, TemplateBadge, type TemplateBadgeTone } from './template-shell';

export interface RankableListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: TemplateBadgeTone;
  meta?: string;
  imageUrl?: string | null;
}

export type ListRankingViewMode = 'global' | 'mine';

const STORAGE_PREFIX = 'geo:template-ranking:v1:';

function readStoredOrder(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function writeStoredOrder(storageKey: string, ids: readonly string[]) {
  if (typeof window === 'undefined') return;
  try {
    if (ids.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(ids));
    }
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

/**
 * Manages personal ranking state (`My ranking` vs `Global` view) for any template list section.
 * Hydrates from `localStorage` inside `useEffect` so SSR and initial client hydration always match.
 */
export function useListRanking<T extends { id: string }>({ listKey, items }: { listKey: string; items: readonly T[] }) {
  const storageKey = `${STORAGE_PREFIX}${listKey}`;
  const [myOrder, setMyOrder] = React.useState<string[]>([]);
  const [viewMode, setViewMode] = React.useState<ListRankingViewMode>('global');
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const stored = readStoredOrder(storageKey);
    setMyOrder(stored);
    setViewMode('global');
  }, [storageKey]);

  const itemIdSet = React.useMemo(() => new Set(items.map(item => item.id)), [items]);

  const validMyOrder = React.useMemo(() => myOrder.filter(id => itemIdSet.has(id)), [itemIdSet, myOrder]);

  const hasMyRanking = validMyOrder.length > 0;

  const orderedItems = React.useMemo<readonly T[]>(() => {
    if (viewMode !== 'mine' || validMyOrder.length === 0) return items;
    const byId = new Map(items.map(item => [item.id, item]));
    const ranked: T[] = [];
    const seen = new Set<string>();
    for (const id of validMyOrder) {
      const found = byId.get(id);
      if (!found || seen.has(id)) continue;
      seen.add(id);
      ranked.push(found);
    }
    for (const item of items) {
      if (!seen.has(item.id)) ranked.push(item);
    }
    return ranked;
  }, [items, validMyOrder, viewMode]);

  const publish = React.useCallback(
    (nextOrder: readonly string[]) => {
      const deduped = Array.from(new Set(nextOrder.filter(id => itemIdSet.has(id))));
      setMyOrder(deduped);
      writeStoredOrder(storageKey, deduped);
      setViewMode(deduped.length > 0 ? 'mine' : 'global');
      setIsOpen(false);
    },
    [itemIdSet, storageKey]
  );

  const clear = React.useCallback(() => {
    setMyOrder([]);
    writeStoredOrder(storageKey, []);
    setViewMode('global');
  }, [storageKey]);

  return {
    orderedItems,
    myOrder: validMyOrder,
    hasMyRanking,
    viewMode: hasMyRanking ? viewMode : ('global' as ListRankingViewMode),
    setViewMode,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    publish,
    clear,
  };
}

/**
 * Header controls placed immediately next to `+` on ranked list sections:
 * - At rest: a single borderless Geo `RankingChart` icon button matching `+`.
 * - Once the user has published a ranking: adds a quiet `Global | My ranking` pill switcher
 *   beside the active `RankingChart` button so they can toggle views or re-open the editor.
 */
export function ListRankingHeaderControl({
  title,
  hasMyRanking,
  viewMode,
  onViewModeChange,
  onOpen,
  disabled = false,
}: {
  title: string;
  hasMyRanking: boolean;
  viewMode: ListRankingViewMode;
  onViewModeChange: (mode: ListRankingViewMode) => void;
  onOpen: () => void;
  disabled?: boolean;
}) {
  if (disabled) return null;

  const buttonLabel = hasMyRanking ? `Edit my ranking for ${title}` : `Rank ${title}`;

  return (
    <div className="inline-flex items-center gap-1.5">
      {hasMyRanking && (
        <div
          role="group"
          aria-label={`${title} ranking order`}
          className="inline-flex items-center rounded-full bg-grey-01 p-0.5 text-[12px]"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'global'}
            onClick={() => onViewModeChange('global')}
            className={cx(
              'h-6 cursor-pointer rounded-full border-0 px-2.5 font-medium transition-colors',
              viewMode === 'global'
                ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'bg-transparent text-grey-04 hover:text-text'
            )}
          >
            Global
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'mine'}
            onClick={() => onViewModeChange('mine')}
            className={cx(
              'h-6 cursor-pointer rounded-full border-0 px-2.5 font-medium transition-colors',
              viewMode === 'mine'
                ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'bg-transparent text-grey-04 hover:text-text'
            )}
          >
            My ranking
          </button>
        </div>
      )}

      <button
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={event => {
          event.stopPropagation();
          onOpen();
        }}
        className={cx(
          'relative inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent transition-colors hover:text-text',
          hasMyRanking ? 'text-text' : 'text-grey-04'
        )}
      >
        <RankingChart />
        {hasMyRanking && (
          <span aria-hidden className="absolute top-1 right-0.5 size-1.5 rounded-full bg-text ring-2 ring-white" />
        )}
      </button>
    </div>
  );
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Full-bleed ranking composer overlay integrated with Geo's `RankingComposeScreen` mental model
 * (`Global ranking` on the left, draggable `My ranking` on the right via `RankingMyRankingDndList`,
 * mobile segmented tabs, search filter, click-to-add & drag-to-add, and `Publish ranking`),
 * styled in the calm v2 editorial aesthetic (pure white canvas, soft card surfaces, `#202020` ink).
 */
export function ListRankingWorkspace({
  open,
  title,
  subtitle,
  items,
  initialOrder,
  onClose,
  onPublish,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  items: readonly RankableListItem[];
  initialOrder: readonly string[];
  onClose: () => void;
  onPublish: (orderedIds: string[]) => void;
}) {
  const [draftIds, setDraftIds] = React.useState<string[]>([...initialOrder]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [mobileTab, setMobileTab] = React.useState<'global' | 'mine'>('global');
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const myListRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraftIds([...initialOrder]);
    setSearchQuery('');
    setMobileTab(initialOrder.length > 0 ? 'mine' : 'global');
    setDropIndex(null);
  }, [initialOrder, open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  const itemsById = React.useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const draftRankById = React.useMemo(() => {
    const map = new Map<string, number>();
    draftIds.forEach((id, idx) => map.set(id, idx + 1));
    return map;
  }, [draftIds]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredGlobal = React.useMemo(() => {
    return items
      .map((item, idx) => ({ item, globalRank: idx + 1 }))
      .filter(({ item }) => {
        if (!normalizedQuery) return true;
        const haystack = `${item.title} ${item.subtitle ?? ''} ${item.badge ?? ''} ${item.meta ?? ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [items, normalizedQuery]);

  const addItem = React.useCallback((id: string, atIndex?: number) => {
    setDraftIds(prev => {
      if (prev.includes(id)) return prev;
      if (atIndex === undefined || atIndex >= prev.length) return [...prev, id];
      const clamped = Math.max(0, atIndex);
      return [...prev.slice(0, clamped), id, ...prev.slice(clamped)];
    });
  }, []);

  const removeItem = React.useCallback((id: string) => {
    setDraftIds(prev => prev.filter(item => item !== id));
  }, []);

  const moveItem = React.useCallback((id: string, delta: -1 | 1) => {
    setDraftIds(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      if (moved) copy.splice(nextIdx, 0, moved);
      return copy;
    });
  }, []);

  const startFromGlobal = React.useCallback(() => {
    setDraftIds(items.map(item => item.id));
    setMobileTab('mine');
  }, [items]);

  const indexAtPointer = (clientY: number) => {
    const rows = myListRef.current?.querySelectorAll<HTMLElement>(`[${RANKING_DROP_ROW_ATTRIBUTE}]`) ?? [];
    const middles = Array.from(rows, row => {
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    return dropIndexFromPointer(middles, clientY);
  };

  const hasChanges = !sameOrder(draftIds, initialOrder);
  const canPublish = draftIds.length > 0 ? hasChanges || initialOrder.length === 0 : initialOrder.length > 0;
  const publishLabel =
    draftIds.length === 0 && initialOrder.length > 0
      ? 'Clear ranking'
      : initialOrder.length > 0
        ? 'Update ranking'
        : 'Publish ranking';

  if (!open || typeof document === 'undefined') return null;

  const globalColumn = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 border-b border-divider pb-3">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-[16px] font-semibold text-text">Global ranking</h2>
          <span className="text-[13px] text-grey-04 tabular-nums">{items.length}</span>
        </div>
        {draftIds.length === 0 && items.length > 0 && (
          <button
            type="button"
            onClick={startFromGlobal}
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ctaPrimary transition-colors hover:text-ctaHover"
          >
            Start from global order
          </button>
        )}
      </div>

      <label className="relative flex w-full shrink-0 items-center">
        <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-grey-04" />
        <input
          type="search"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          aria-label={`Search ${title}`}
          className="h-9 w-full rounded-full border border-grey-02 bg-grey-01/50 pr-8 pl-8.5 text-[14px] text-text placeholder:text-grey-04 focus:border-text focus:bg-white focus:outline-hidden"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 hover:text-text"
          >
            <CloseIcon className="size-3.5" />
          </button>
        )}
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filteredGlobal.length === 0 ? (
          <p className="m-0 py-8 text-center text-[14px] text-grey-04">No items match “{searchQuery.trim()}”.</p>
        ) : (
          <div className={cx('divide-y divide-divider overflow-hidden', TEMPLATE_CARD_SURFACE)}>
            {filteredGlobal.map(({ item, globalRank }) => {
              const myRank = draftRankById.get(item.id) ?? null;
              const isAdded = myRank !== null;

              return (
                <div
                  key={item.id}
                  {...(!isAdded ? rankingEntityDragProps(item.id) : {})}
                  onClick={() => {
                    if (!isAdded) addItem(item.id);
                  }}
                  className={cx(
                    'group flex items-center gap-3 px-4 py-3 transition-colors',
                    isAdded ? 'bg-grey-01/40 opacity-65' : 'cursor-pointer hover:bg-grey-01/60'
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-[13.5px] font-medium text-grey-04 tabular-nums">
                    {globalRank}
                  </span>

                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      aria-hidden
                      className="size-9 shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]"
                    />
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="line-clamp-2 text-[14.5px] leading-[20px] font-medium text-text">
                      {item.title}
                    </span>
                    {(item.badge || item.meta || item.subtitle) && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-grey-04">
                        {item.badge && (
                          <TemplateBadge tone={item.badgeTone ?? 'neutral'} className="h-5 px-1.5 text-[11.5px]">
                            {item.badge}
                          </TemplateBadge>
                        )}
                        {item.meta && <span className="tabular-nums">{item.meta}</span>}
                        {!item.meta && item.subtitle && <span className="truncate">{item.subtitle}</span>}
                      </div>
                    )}
                  </div>

                  {isAdded ? (
                    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-grey-01 px-2.5 text-[12px] font-medium text-grey-05 tabular-nums">
                      You: #{myRank}
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Add ${item.title} to my ranking`}
                      onClick={event => {
                        event.stopPropagation();
                        addItem(item.id);
                      }}
                      className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-grey-02 bg-white px-2.5 text-[12.5px] font-medium text-text transition-colors group-hover:border-text hover:bg-text hover:text-white"
                    >
                      <PlusIcon className="size-3" />
                      <span>Add</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const myColumn = (
    <div
      ref={myListRef}
      onDragOver={event => {
        if (!isRankingEntityDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropIndex(indexAtPointer(event.clientY));
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(null);
      }}
      onDrop={event => {
        const droppedId = event.dataTransfer.getData(RANKING_ENTITY_DRAG_TYPE);
        setDropIndex(null);
        if (!droppedId) return;
        event.preventDefault();
        addItem(droppedId, indexAtPointer(event.clientY));
      }}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2 border-b border-divider pb-3">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-[16px] font-semibold text-text">My ranking</h2>
          {draftIds.length > 0 && <span className="text-[13px] text-grey-04 tabular-nums">{draftIds.length}</span>}
        </div>

        <div className="flex items-center gap-2">
          {draftIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDraftIds([])}
              className="cursor-pointer border-0 bg-transparent px-2 py-1 text-[13px] font-medium text-grey-04 transition-colors hover:text-text"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={!canPublish}
            onClick={() => onPublish(draftIds)}
            className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13.5px] font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-divider disabled:text-grey-03"
          >
            {publishLabel}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {draftIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3.5 rounded-xl border border-dashed border-grey-02 bg-grey-01/40 px-6 py-12 text-center">
            <span className="inline-grid size-10 place-items-center rounded-full bg-white text-grey-04 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
              <RankingChart />
            </span>
            <div className="flex max-w-[300px] flex-col gap-1">
              <p className="m-0 text-[15px] font-medium text-text">Build your ranking</p>
              <p className="m-0 text-[13.5px] leading-[19px] text-grey-04">
                Click or drag items from Global ranking to set your order, or copy the global list to tweak it.
              </p>
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={startFromGlobal}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13.5px] font-medium text-text transition-colors hover:border-text"
              >
                Start from global ranking
              </button>
            )}
          </div>
        ) : (
          <div className={cx('overflow-hidden', TEMPLATE_CARD_SURFACE)}>
            <RankingMyRankingDndList
              entityIds={draftIds}
              onReorder={setDraftIds}
              className="divide-y divide-divider"
              renderItem={(entityId, index) => {
                const item = itemsById.get(entityId);
                if (!item) return null;
                return (
                  <div
                    {...{ [RANKING_DROP_ROW_ATTRIBUTE]: entityId }}
                    className="relative flex items-center gap-3 py-3 pl-3.5"
                  >
                    {dropIndex === index && (
                      <span className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-text" aria-hidden />
                    )}
                    {dropIndex === draftIds.length && index === draftIds.length - 1 && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-text" aria-hidden />
                    )}
                    <span className="inline-flex shrink-0 items-center text-grey-03" aria-hidden>
                      <OrderDots className="h-3.5 w-2" />
                    </span>
                    <span className="w-5 shrink-0 text-right text-[13.5px] font-semibold text-text tabular-nums">
                      {index + 1}
                    </span>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        aria-hidden
                        className="size-9 shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-[14.5px] leading-[20px] font-medium text-text">
                        {item.title}
                      </span>
                      {(item.badge || item.meta) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-grey-04">
                          {item.badge && (
                            <TemplateBadge tone={item.badgeTone ?? 'neutral'} className="h-5 px-1.5 text-[11.5px]">
                              {item.badge}
                            </TemplateBadge>
                          )}
                          {item.meta && <span className="tabular-nums">{item.meta}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
              renderTrailing={(entityId, index) => {
                const item = itemsById.get(entityId);
                if (!item) return null;
                return (
                  <div className="flex items-center gap-0.5 pr-3">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move ${item.title} up`}
                      title="Move up"
                      onClick={() => moveItem(entityId, -1)}
                      className="inline-grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[12px] text-grey-04 transition-colors hover:bg-grey-01 hover:text-text disabled:cursor-default disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === draftIds.length - 1}
                      aria-label={`Move ${item.title} down`}
                      title="Move down"
                      onClick={() => moveItem(entityId, 1)}
                      className="inline-grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[12px] text-grey-04 transition-colors hover:bg-grey-01 hover:text-text disabled:cursor-default disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.title} from my ranking`}
                      title="Remove"
                      onClick={() => removeItem(entityId)}
                      className="inline-grid size-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
                    >
                      <CloseIcon className="size-3.5" />
                    </button>
                  </div>
                );
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rank ${title}`}
      className="@container fixed inset-x-0 top-11 bottom-0 z-[140] flex flex-col border-t border-divider bg-white"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1160px] flex-col px-5 pt-4 pb-6 @[820px]:px-8">
        {/* Top bar matching Geo RankingComposePinnedToolbar + editorial header */}
        <header className="flex shrink-0 flex-col gap-2.5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Exit ranking editor"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-1 py-1 text-[13.5px] font-medium text-grey-04 transition-colors hover:text-text"
            >
              <ArrowLeftIcon className="size-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close ranking editor"
              className="inline-grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-text @[820px]:text-[34px] @[820px]:leading-[40px]">
              {title}
            </h1>
            <p className="m-0 text-[14.5px] leading-[20px] text-grey-04">
              {subtitle ?? 'Pick items from the global ranking and drag to set your order.'}
            </p>
          </div>
        </header>

        {/* Mobile segmented tabs matching Geo RankingComposeLayout */}
        <div
          role="tablist"
          aria-label="Ranking columns"
          className="mb-4 flex shrink-0 rounded-full bg-grey-01 p-0.5 @[820px]:hidden"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'global'}
            onClick={() => setMobileTab('global')}
            className={cx(
              'grid h-9 flex-1 cursor-pointer place-items-center rounded-full border-0 text-[13.5px] font-medium transition-colors',
              mobileTab === 'global'
                ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                : 'bg-transparent text-grey-04'
            )}
          >
            Global ranking ({items.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'mine'}
            onClick={() => setMobileTab('mine')}
            className={cx(
              'grid h-9 flex-1 cursor-pointer place-items-center rounded-full border-0 text-[13.5px] font-medium transition-colors',
              mobileTab === 'mine'
                ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
                : 'bg-transparent text-grey-04'
            )}
          >
            My ranking ({draftIds.length})
          </button>
        </div>

        {/* Desktop 2-column split (Global left, My right); Mobile tab-switched */}
        <div className="hidden min-h-0 flex-1 grid-cols-2 gap-8 overflow-hidden @[820px]:grid">
          <section aria-label="Global ranking" className="flex min-h-0 flex-col overflow-hidden">
            {globalColumn}
          </section>
          <section aria-label="My ranking" className="flex min-h-0 flex-col overflow-hidden">
            {myColumn}
          </section>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden @[820px]:hidden">
          {mobileTab === 'global' ? globalColumn : myColumn}
        </div>
      </div>
    </div>,
    document.body
  );
}
