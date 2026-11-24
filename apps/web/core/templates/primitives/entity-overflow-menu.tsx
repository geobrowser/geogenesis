'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { RelationSmall } from '~/design-system/icons/relation-small';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';

import type {
  ClaimKind,
  EntityActionCallbacks,
  EntityContextDataModel,
  EntityFlagModel,
  EntityTripleModel,
  EntityTripleValueModel,
} from '../models';
import { TEMPLATE_ACTIONS } from '../template-actions';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
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

export interface InspectedRelationState {
  id: string;
  fromTarget: EntityActionTarget;
  predicate: string;
  toValue: EntityTripleValueModel;
  returnToViewer: boolean;
}

interface EntityActionContextValue {
  openComposer: (action: EntityActionKind, target: EntityActionTarget, initialPredicate?: string) => void;
  openViewer: (target: EntityActionTarget) => void;
  getContextForTarget: (targetId: string) => ResolvedEntityContext;
  getAddedTriplesForTarget: (targetId: string) => readonly EntityTripleModel[];
  addTriple: (targetId: string, predicate: string, labels: readonly string[]) => void;
  addTripleValue: (targetId: string, predicate: string, label: string) => void;
  addFlag: (targetId: string, draft: { reason: string; body: string; sourceUrl?: string }) => void;
  deleteTripleValue: (targetId: string, valueId: string) => void;
  inspectRelation: (
    target: EntityActionTarget,
    predicate: string,
    value: EntityTripleValueModel,
    options?: { returnToViewer?: boolean }
  ) => void;
  flagVotes: Readonly<Record<string, 'agree' | 'disagree' | null>>;
  voteOnFlag: (flagId: string, choice: 'agree' | 'disagree') => void;
  callbacks?: EntityActionCallbacks;
  popoverContainer: HTMLDivElement | null;
  showAllContext: boolean;
  toggleShowAllContext: () => void;
  setShowAllContext: (value: boolean) => void;
}

const EntityActionContext = React.createContext<EntityActionContextValue | null>(null);
const TemplatePopoverPortalContext = React.createContext<HTMLDivElement | null>(null);

export function useEntityActionContext(): EntityActionContextValue | null {
  return React.useContext(EntityActionContext);
}

export function TemplatePopoverPortalProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  return (
    <TemplatePopoverPortalContext.Provider value={container}>
      {children}
      <div ref={setContainer} className="pointer-events-none fixed inset-0 z-[160]" />
    </TemplatePopoverPortalContext.Provider>
  );
}

export function useTemplatePopoverContainer(): HTMLDivElement | undefined {
  const ctx = React.useContext(EntityActionContext);
  const localPortal = React.useContext(TemplatePopoverPortalContext);
  return localPortal ?? ctx?.popoverContainer ?? undefined;
}

const FLAG_REASONS = ['Disputed fact', 'Missing methodology', 'Missing framing', 'Outdated'] as const;
const SUGGESTED_PREDICATES = ['Related actors', 'Supporting source', 'Disputed by', 'Method', 'Limitation'] as const;
const SUGGESTED_RELATION_ENTITIES = [
  'International Court of Justice',
  'International Criminal Court',
  'UN Commission of Inquiry',
  'UN OCHA',
  'UNOSAT',
  'Human Rights Watch',
  'Amnesty International',
  'B’Tselem',
  'World Health Organization',
  'Gaza Health Ministry',
  'Israel Defense Forces',
  'Associated Press',
  'Reuters',
  'Haaretz',
] as const;

const ROWS_PER_PAGE_DRAWER = 4;
const PILLS_COLLAPSE_CAP = 6;
const FLAGS_PER_PAGE = 3;

/**
 * Minimal, unobtrusive pagination control that only renders when items span multiple pages.
 */
export function InlinePagination({
  page,
  totalPages,
  onPageChange,
  label = 'Pagination',
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  label?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label}
      className={cx('flex items-center justify-end gap-2 pt-1 text-[13px] text-grey-04', className)}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        aria-label="Previous page"
        className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text disabled:cursor-default disabled:opacity-35"
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <span className="tabular-nums">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        aria-label="Next page"
        className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text disabled:cursor-default disabled:opacity-35"
      >
        <ArrowRightIcon className="size-3.5" />
      </button>
    </nav>
  );
}

/**
 * Geo Genesis-style inline `+` trigger at the end of a relation pill row (mirroring
 * `SelectEntityAsPopover` in `editable-entity-page.tsx`): pops a lightweight search/create
 * popover to append another relation pill to that specific relation type.
 */
export function TemplateAddRelationPillPopover({
  predicate,
  existingLabels = [],
  revealOnRowHover = true,
  onAdd,
}: {
  predicate: string;
  existingLabels?: readonly string[];
  /** When true, hides the `+` at rest and reveals it only when hovering/focusing its own `group/rel-row`. */
  revealOnRowHover?: boolean;
  onAdd: (label: string) => void;
}) {
  const ctx = React.useContext(EntityActionContext);
  const searchEntities = ctx?.callbacks?.searchEntities;
  const popoverContainer = useTemplatePopoverContainer();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [liveResults, setLiveResults] = React.useState<readonly string[]>([]);

  React.useEffect(() => {
    if (!open || !searchEntities) {
      setLiveResults([]);
      return;
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setLiveResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchEntities(trimmedQuery).then(hits => {
        if (!cancelled) {
          setLiveResults(hits.map(hit => hit.name));
        }
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, searchEntities]);

  const existingLower = React.useMemo(() => new Set(existingLabels.map(l => l.toLowerCase())), [existingLabels]);
  const suggestions = React.useMemo(() => {
    if (searchEntities) {
      return liveResults.filter(name => !existingLower.has(name.toLowerCase())).slice(0, 5);
    }
    const q = query.trim().toLowerCase();
    return SUGGESTED_RELATION_ENTITIES.filter(
      name => !existingLower.has(name.toLowerCase()) && (!q || name.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [existingLower, liveResults, query, searchEntities]);

  const trimmed = query.trim();
  const canCreate = Boolean(trimmed) && !existingLower.has(trimmed.toLowerCase());

  const commit = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    onAdd(clean);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Add ${predicate}`}
          title={`Add ${predicate}`}
          onClick={event => event.stopPropagation()}
          className={cx(
            'inline-grid size-6 shrink-0 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors transition-opacity hover:text-text',
            revealOnRowHover &&
              !open &&
              'opacity-0 group-focus-within/rel-row:opacity-100 group-hover/rel-row:opacity-100 focus-visible:opacity-100',
            open && 'text-text opacity-100'
          )}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={popoverContainer}>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="pointer-events-auto z-[160] flex w-[264px] flex-col gap-2 rounded-xl border border-black/[0.08] bg-white p-2.5 shadow-[0_14px_38px_-6px_rgba(0,0,0,0.14),0_3px_10px_-2px_rgba(0,0,0,0.06)]"
          onClick={event => event.stopPropagation()}
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              if (canCreate) commit(trimmed);
            }}
          >
            <input
              type="text"
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={`Find or add ${predicate.toLowerCase()}...`}
              aria-label={`Find or add ${predicate}`}
              className="h-8 w-full rounded-lg border border-grey-02 bg-white px-2.5 text-[13px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
            />
          </form>

          {suggestions.length > 0 && (
            <div className="flex max-h-[172px] flex-col overflow-y-auto">
              {suggestions.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => commit(item)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-text transition-colors hover:bg-grey-01 hover:text-[#4c1fd4]"
                >
                  <span className="truncate">{item}</span>
                  <PlusIcon className="size-3 shrink-0 text-grey-04" />
                </button>
              ))}
            </div>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={() => commit(trimmed)}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-grey-01/80 px-2.5 py-1.5 text-left text-[13px] font-medium text-text transition-colors hover:bg-grey-01 hover:text-[#4c1fd4]"
            >
              <PlusIcon className="size-3.5 shrink-0 text-grey-04" />
              <span className="truncate">Add “{trimmed}”</span>
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Anchored popover attached to a borderless `+` trigger for adding Context triples
 * without opening a full-screen modal.
 */
type AddContextPopoverProps = {
  onSubmit: (predicate: string, values: readonly string[]) => void;
  align?: 'start' | 'center' | 'end';
};

/** Hidden while `TEMPLATE_ACTIONS.addContext` is off (GEO-3819). */
export function AddContextPopover(props: AddContextPopoverProps) {
  if (!TEMPLATE_ACTIONS.addContext) return null;
  return <AddContextPopoverInner {...props} />;
}

function AddContextPopoverInner({ onSubmit, align = 'end' }: AddContextPopoverProps) {
  const popoverContainer = useTemplatePopoverContainer();
  const [open, setOpen] = React.useState(false);
  const [predicate, setPredicate] = React.useState('');
  const [valuesInput, setValuesInput] = React.useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanPred = predicate.trim();
    const values = valuesInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!cleanPred || values.length === 0) return;
    onSubmit(cleanPred, values);
    setPredicate('');
    setValuesInput('');
    setOpen(false);
  };

  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setPredicate('');
          setValuesInput('');
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Add context"
          title="Add context"
          onClick={event => event.stopPropagation()}
          className={cx(
            'inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text',
            open && 'text-text'
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={popoverContainer}>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="pointer-events-auto z-[160] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-xl border border-black/[0.08] bg-white p-4 shadow-[0_18px_48px_-8px_rgba(0,0,0,0.16),0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-text">
              <NetworkIcon className="size-3.5 text-grey-04" />
              <span>Add context</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close add context"
              className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 hover:text-text"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PREDICATES.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPredicate(item)}
                  className={cx(
                    'cursor-pointer rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors',
                    predicate === item
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-grey-05 hover:border-text hover:text-text'
                  )}
                >
                  {item}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">Property (relation key)</span>
              <input
                type="text"
                autoFocus
                value={predicate}
                onChange={e => setPredicate(e.target.value)}
                placeholder="e.g. Legal status, Supporting reports"
                className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">Values (comma-separated)</span>
              <input
                type="text"
                value={valuesInput}
                onChange={e => setValuesInput(e.target.value)}
                placeholder="e.g. ICJ Provisional Order, UN inquiry"
                className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
              />
            </label>

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13px] font-medium text-text hover:border-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!predicate.trim() || !valuesInput.trim()}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                Add context
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Anchored popover attached to a borderless `+` trigger for submitting a Flag
 * without opening a full-screen modal.
 */
type AddFlagPopoverProps = {
  onSubmit: (draft: { reason: string; body: string; sourceUrl?: string }) => void;
  align?: 'start' | 'center' | 'end';
};

/** Hidden while `TEMPLATE_ACTIONS.dispute` is off (GEO-3819). */
export function AddFlagPopover(props: AddFlagPopoverProps) {
  if (!TEMPLATE_ACTIONS.dispute) return null;
  return <AddFlagPopoverInner {...props} />;
}

function AddFlagPopoverInner({ onSubmit, align = 'end' }: AddFlagPopoverProps) {
  const popoverContainer = useTemplatePopoverContainer();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>(FLAG_REASONS[0]);
  const [body, setBody] = React.useState('');
  const [sourceUrl, setSourceUrl] = React.useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (body.trim().length < 5) return;
    onSubmit({ reason, body: body.trim(), sourceUrl: sourceUrl.trim() || undefined });
    setReason(FLAG_REASONS[0]);
    setBody('');
    setSourceUrl('');
    setOpen(false);
  };

  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setReason(FLAG_REASONS[0]);
          setBody('');
          setSourceUrl('');
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Add dispute"
          title="Add dispute"
          onClick={event => event.stopPropagation()}
          className={cx(
            'inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text',
            open && 'text-text'
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={popoverContainer}>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="pointer-events-auto z-[160] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-xl border border-black/[0.08] bg-white p-4 shadow-[0_18px_48px_-8px_rgba(0,0,0,0.16),0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-text">
              <FlagIcon className="size-3.5 text-grey-04" />
              <span>Add dispute</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close add dispute"
              className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 hover:text-text"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {FLAG_REASONS.map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={reason === option}
                  onClick={() => setReason(option)}
                  className={cx(
                    'cursor-pointer rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors',
                    reason === option
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-grey-05 hover:border-text hover:text-text'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">Why are you disputing this?</span>
              <textarea
                rows={3}
                autoFocus
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Describe what is inaccurate, disputed, or missing..."
                className="w-full resize-none rounded-lg border border-grey-02 bg-white px-3 py-2 text-[13.5px] leading-[19px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">Supporting source (optional)</span>
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
              />
            </label>

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13px] font-medium text-text hover:border-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={body.trim().length < 5}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                Submit dispute
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Anchored popover attached to a right-aligned borderless `+` trigger for proposing / adding
 * a new Claim (used on Claims, Supporting claims, Opposing claims, and Related claims headers).
 */
export function AddClaimPopover({
  label = 'Add claim',
  placeholder = 'Write a clear, testable statement...',
  onSubmit,
  align = 'end',
}: {
  label?: string;
  placeholder?: string;
  onSubmit: (draft: { title: string; kind: ClaimKind; note?: string }) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const popoverContainer = useTemplatePopoverContainer();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [kind, setKind] = React.useState<ClaimKind>('fact');
  const [note, setNote] = React.useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 4) return;
    onSubmit({ title: title.trim(), kind, note: note.trim() || undefined });
    setTitle('');
    setKind('fact');
    setNote('');
    setOpen(false);
  };

  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setTitle('');
          setKind('fact');
          setNote('');
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={event => event.stopPropagation()}
          className={cx(
            'inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text',
            open && 'text-text'
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={popoverContainer}>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="pointer-events-auto z-[160] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-xl border border-black/[0.08] bg-white p-4 shadow-[0_18px_48px_-8px_rgba(0,0,0,0.16),0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold text-text">{label}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Close ${label.toLowerCase()}`}
              className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 hover:text-text"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Claim epistemic type">
              {(
                [
                  { id: 'fact', label: 'Factual' },
                  { id: 'judgment', label: 'Judgment' },
                ] as const
              ).map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={kind === option.id}
                  onClick={() => setKind(option.id)}
                  className={cx(
                    'cursor-pointer rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors',
                    kind === option.id
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 bg-white text-grey-05 hover:border-text hover:text-text'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">Claim</span>
              <textarea
                rows={2}
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={placeholder}
                className="w-full resize-none rounded-lg border border-grey-02 bg-white px-3 py-2 text-[13.5px] leading-[19px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">Context note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Key citation or clarification..."
                className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
              />
            </label>

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13px] font-medium text-text hover:border-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={title.trim().length < 4}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                {label}
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Reusable right-aligned borderless `+` anchored popover for adding Sources, Quotes, Events,
 * or linked entity items directly from any section header.
 */
export function AddEntityItemPopover({
  label,
  primaryLabel,
  primaryPlaceholder,
  secondaryLabel,
  secondaryPlaceholder,
  tertiaryLabel,
  tertiaryPlaceholder,
  multilinePrimary = false,
  onSubmit,
  align = 'end',
}: {
  label: string;
  primaryLabel: string;
  primaryPlaceholder: string;
  secondaryLabel?: string;
  secondaryPlaceholder?: string;
  tertiaryLabel?: string;
  tertiaryPlaceholder?: string;
  multilinePrimary?: boolean;
  onSubmit: (draft: { primary: string; secondary?: string; tertiary?: string }) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const popoverContainer = useTemplatePopoverContainer();
  const [open, setOpen] = React.useState(false);
  const [primary, setPrimary] = React.useState('');
  const [secondary, setSecondary] = React.useState('');
  const [tertiary, setTertiary] = React.useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (primary.trim().length < 2) return;
    onSubmit({
      primary: primary.trim(),
      secondary: secondary.trim() || undefined,
      tertiary: tertiary.trim() || undefined,
    });
    setPrimary('');
    setSecondary('');
    setTertiary('');
    setOpen(false);
  };

  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setPrimary('');
          setSecondary('');
          setTertiary('');
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={event => event.stopPropagation()}
          className={cx(
            'inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text',
            open && 'text-text'
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={popoverContainer}>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="pointer-events-auto z-[160] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-xl border border-black/[0.08] bg-white p-4 shadow-[0_18px_48px_-8px_rgba(0,0,0,0.16),0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold text-text">{label}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Close ${label.toLowerCase()}`}
              className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 hover:text-text"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-grey-04">{primaryLabel}</span>
              {multilinePrimary ? (
                <textarea
                  rows={3}
                  autoFocus
                  value={primary}
                  onChange={e => setPrimary(e.target.value)}
                  placeholder={primaryPlaceholder}
                  className="w-full resize-none rounded-lg border border-grey-02 bg-white px-3 py-2 text-[13.5px] leading-[19px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                />
              ) : (
                <input
                  type="text"
                  autoFocus
                  value={primary}
                  onChange={e => setPrimary(e.target.value)}
                  placeholder={primaryPlaceholder}
                  className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                />
              )}
            </label>

            {secondaryLabel && (
              <label className="flex flex-col gap-1">
                <span className="text-[12.5px] font-medium text-grey-04">{secondaryLabel}</span>
                <input
                  type="text"
                  value={secondary}
                  onChange={e => setSecondary(e.target.value)}
                  placeholder={secondaryPlaceholder}
                  className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                />
              </label>
            )}

            {tertiaryLabel && (
              <label className="flex flex-col gap-1">
                <span className="text-[12.5px] font-medium text-grey-04">{tertiaryLabel}</span>
                <input
                  type="text"
                  value={tertiary}
                  onChange={e => setTertiary(e.target.value)}
                  placeholder={tertiaryPlaceholder}
                  className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
                />
              </label>
            )}

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13px] font-medium text-text hover:border-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={primary.trim().length < 2}
                className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                {label}
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

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
export function TemplateRelationPill({
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
  const popoverContainer = useTemplatePopoverContainer();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [isDotsHovered, setIsDotsHovered] = React.useState(false);
  const [isRelationHovered, setIsRelationHovered] = React.useState(false);
  const [isDeleteHovered, setIsDeleteHovered] = React.useState(false);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setIsPopoverOpen(false);
      setIsDotsHovered(false);
    }, 120);
  }, [cancelClose]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  const labelClasses = cx(
    'text-left text-text no-underline transition-colors',
    compact ? 'text-[12.5px] leading-[17px]' : 'text-[13px] leading-[18px]'
  );

  const relationAction = () => {
    cancelClose();
    setIsPopoverOpen(false);
    if (value.onOpenRelation) {
      value.onOpenRelation();
      return;
    }
    if (onOpenRelation) {
      onOpenRelation();
      return;
    }
    if (value.onSelect) {
      value.onSelect();
    }
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

      <Popover.Root
        modal={false}
        open={isPopoverOpen}
        onOpenChange={next => {
          cancelClose();
          setIsPopoverOpen(next);
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Relation actions for ${value.label}`}
            onClick={event => {
              event.stopPropagation();
              cancelClose();
              setIsPopoverOpen(prev => !prev);
            }}
            onMouseEnter={() => {
              cancelClose();
              setIsPopoverOpen(true);
              setIsDotsHovered(true);
            }}
            onMouseLeave={event => {
              setIsDotsHovered(false);
              const next = event.relatedTarget as Node | null;
              if (next && contentRef.current?.contains(next)) return;
              scheduleClose();
            }}
            className={cx(
              'relative flex shrink-0 cursor-pointer items-center border-0 bg-transparent px-2 py-1 text-grey-03 transition-colors group-hover:text-text focus-visible:text-text',
              (isRelationHovered || isDeleteHovered || isPopoverOpen) && 'text-text!'
            )}
          >
            <RelationDots />
          </button>
        </Popover.Trigger>

        <Popover.Portal container={popoverContainer}>
          <Popover.Content
            ref={contentRef}
            side="top"
            align="end"
            sideOffset={-4}
            className="shadow-sm pointer-events-auto z-[160] flex items-center rounded-[7px] border border-grey-04 bg-white"
            onCloseAutoFocus={event => event.preventDefault()}
            onMouseEnter={cancelClose}
            onMouseLeave={event => {
              const next = event.relatedTarget as Node | null;
              if (next && triggerRef.current?.contains(next)) return;
              scheduleClose();
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
 * Renders context triples as crisp key → multi-value Geo relation pill rows, with inline `+`
 * pill creation per relation type, overflow collapse on long pill rows, and pagination when
 * more predicate rows exist than fit cleanly.
 */
function TripleKeyValueList({
  target,
  triples,
  compact = false,
  pageSize = ROWS_PER_PAGE_DRAWER,
  onInspectRelation,
  onAddValue,
  onDeleteValue,
}: {
  target: EntityActionTarget;
  triples: readonly EntityTripleModel[];
  compact?: boolean;
  pageSize?: number;
  onInspectRelation?: (target: EntityActionTarget, predicate: string, value: EntityTripleValueModel) => void;
  onAddValue?: (targetId: string, predicate: string, label: string) => void;
  onDeleteValue?: (targetId: string, valueId: string) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [expandedPredicates, setExpandedPredicates] = React.useState<ReadonlySet<string>>(() => new Set());

  const totalPages = Math.max(1, Math.ceil(triples.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleTriples = triples.slice((safePage - 1) * pageSize, safePage * pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [target.id]);

  if (triples.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <dl
        className={cx(
          'm-0 flex flex-col divide-y divide-divider/80 rounded-xl border border-black/[0.05] bg-grey-01/55',
          compact ? 'px-3 py-1' : 'px-4 py-1.5'
        )}
      >
        {visibleTriples.map(triple => {
          const isExpanded = expandedPredicates.has(triple.predicate);
          const hasOverflow = triple.values.length > PILLS_COLLAPSE_CAP;
          const visibleValues = isExpanded || !hasOverflow ? triple.values : triple.values.slice(0, PILLS_COLLAPSE_CAP);
          const hiddenCount = triple.values.length - visibleValues.length;

          return (
            <div
              key={triple.id}
              className={cx(
                'group/rel-row grid grid-cols-1 items-baseline gap-x-3 gap-y-1.5 @[420px]:grid-cols-[126px_minmax(0,1fr)]',
                compact ? 'py-2' : 'py-2.5'
              )}
            >
              <dt className={cx('font-medium text-grey-04', compact ? 'text-[12.5px]' : 'text-[13px]')}>
                {triple.predicate}
              </dt>
              <dd className="m-0 flex min-w-0 flex-wrap items-center gap-1.5">
                {visibleValues.map(val => (
                  <TemplateRelationPill
                    key={val.id}
                    predicate={triple.predicate}
                    value={val}
                    compact={compact}
                    onOpenRelation={
                      onInspectRelation ? () => onInspectRelation(target, triple.predicate, val) : undefined
                    }
                    onDelete={onDeleteValue ? () => onDeleteValue(target.id, val.id) : undefined}
                  />
                ))}

                {hasOverflow && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPredicates(prev => {
                        const next = new Set(prev);
                        if (next.has(triple.predicate)) {
                          next.delete(triple.predicate);
                        } else {
                          next.add(triple.predicate);
                        }
                        return next;
                      })
                    }
                    className="inline-flex h-6 cursor-pointer items-center rounded border border-grey-02 bg-white px-1.5 text-[12px] font-medium text-grey-04 tabular-nums transition-colors hover:border-text hover:text-text"
                  >
                    {isExpanded ? 'Show less' : `+${hiddenCount}`}
                  </button>
                )}

                {onAddValue && TEMPLATE_ACTIONS.addContext && (
                  <TemplateAddRelationPillPopover
                    predicate={triple.predicate}
                    existingLabels={triple.values.map(v => v.label)}
                    onAdd={label => onAddValue(target.id, triple.predicate, label)}
                  />
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Context pages" />
    </div>
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
  callbacks,
  children,
}: {
  initialContextByTarget?: Readonly<Record<string, EntityContextDataModel>>;
  callbacks?: EntityActionCallbacks;
  children: React.ReactNode;
}) {
  const [composer, setComposer] = React.useState<{ action: EntityActionKind; target: EntityActionTarget } | null>(null);
  const [viewerTarget, setViewerTarget] = React.useState<EntityActionTarget | null>(null);
  const [inspectedRelation, setInspectedRelation] = React.useState<InspectedRelationState | null>(null);
  const [userContextByTarget, setUserContextByTarget] = React.useState<
    Readonly<Record<string, { triples: readonly EntityTripleModel[]; flags: readonly EntityFlagModel[] }>>
  >({});
  const [deletedValueIdsByTarget, setDeletedValueIdsByTarget] = React.useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [flagVotes, setFlagVotes] = React.useState<Readonly<Record<string, 'agree' | 'disagree' | null>>>({});
  const [showAllContext, setShowAllContext] = React.useState(false);
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLDivElement | null>(null);

  // Composer form fields
  const [predicate, setPredicate] = React.useState('');
  const [valuesInput, setValuesInput] = React.useState('');
  const [flagReason, setFlagReason] = React.useState<string>(FLAG_REASONS[0]);
  const [flagBody, setFlagBody] = React.useState('');
  const [sourceUrl, setSourceUrl] = React.useState('');

  const [flagPage, setFlagPage] = React.useState(1);

  const openComposer = React.useCallback(
    (action: EntityActionKind, target: EntityActionTarget, initialPredicate?: string) => {
      setComposer({ action, target });
      setPredicate(initialPredicate ?? '');
      setValuesInput('');
      setFlagReason(FLAG_REASONS[0]);
      setFlagBody('');
      setSourceUrl('');
    },
    []
  );

  const openViewer = React.useCallback((target: EntityActionTarget) => {
    setComposer(null);
    setInspectedRelation(null);
    setFlagPage(1);
    setViewerTarget(target);
  }, []);

  const closeAll = React.useCallback(() => {
    setComposer(null);
    setViewerTarget(null);
    setInspectedRelation(null);
  }, []);

  const closeComposerOnly = React.useCallback(() => {
    setComposer(null);
  }, []);

  React.useEffect(() => {
    if (!composer && !viewerTarget && !inspectedRelation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (composer) {
          setComposer(null);
        } else {
          closeAll();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composer, viewerTarget, inspectedRelation, closeAll]);

  const addTriple = React.useCallback(
    (targetId: string, relPredicate: string, labels: readonly string[]) => {
      const cleanPred = relPredicate.trim();
      const cleanLabels = labels.map(l => l.trim()).filter(Boolean);
      if (!cleanPred || cleanLabels.length === 0) return;
      callbacks?.onAddTriple?.(targetId, cleanPred, cleanLabels);
      const newVals: EntityTripleValueModel[] = cleanLabels.map((label, idx) => ({
        id: `tv-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        label,
      }));
      setUserContextByTarget(prev => {
        const current = prev[targetId] ?? { triples: [], flags: [] };
        const existingIdx = current.triples.findIndex(t => t.predicate.toLowerCase() === cleanPred.toLowerCase());
        if (existingIdx >= 0) {
          const nextTriples = current.triples.map((t, i) =>
            i === existingIdx ? { ...t, values: [...t.values, ...newVals] } : t
          );
          return { ...prev, [targetId]: { ...current, triples: nextTriples } };
        }
        const newTriple: EntityTripleModel = {
          id: `tr-${Date.now()}`,
          predicate: cleanPred,
          values: newVals,
        };
        return { ...prev, [targetId]: { ...current, triples: [...current.triples, newTriple] } };
      });
    },
    [callbacks]
  );

  const addTripleValue = React.useCallback(
    (targetId: string, relPredicate: string, label: string) => {
      addTriple(targetId, relPredicate, [label]);
    },
    [addTriple]
  );

  const addFlag = React.useCallback(
    (targetId: string, draft: { reason: string; body: string; sourceUrl?: string }) => {
      if (draft.body.trim().length < 5) return;
      callbacks?.onAddFlag?.(targetId, draft);
      const newFlag: EntityFlagModel = {
        id: `flg-${Date.now()}`,
        reason: draft.reason,
        body: draft.body.trim(),
        sourceUrl: draft.sourceUrl?.trim() || undefined,
      };
      setUserContextByTarget(prev => {
        const current = prev[targetId] ?? { triples: [], flags: [] };
        return {
          ...prev,
          [targetId]: { ...current, flags: [newFlag, ...current.flags] },
        };
      });
    },
    [callbacks]
  );

  const deleteTripleValue = React.useCallback(
    (targetId: string, valueId: string) => {
      callbacks?.onDeleteTriple?.(targetId, valueId);
      setDeletedValueIdsByTarget(prev => ({
        ...prev,
        [targetId]: [...(prev[targetId] ?? []), valueId],
      }));
    },
    [callbacks]
  );

  const inspectRelation = React.useCallback(
    (
      target: EntityActionTarget,
      relPredicate: string,
      value: EntityTripleValueModel,
      options?: { returnToViewer?: boolean }
    ) => {
      setComposer(null);
      setFlagPage(1);
      const returnToViewer = options?.returnToViewer ?? Boolean(viewerTarget);
      if (returnToViewer) {
        setViewerTarget(target);
      }
      setInspectedRelation({
        id: `rel:${target.id}:${relPredicate}:${value.id}`,
        fromTarget: target,
        predicate: relPredicate,
        toValue: value,
        returnToViewer,
      });
    },
    [viewerTarget]
  );

  const voteOnFlag = React.useCallback((flagId: string, choice: 'agree' | 'disagree') => {
    setFlagVotes(prev => ({
      ...prev,
      [flagId]: prev[flagId] === choice ? null : choice,
    }));
  }, []);

  const getAddedTriplesForTarget = React.useCallback(
    (targetId: string): readonly EntityTripleModel[] => {
      const added = userContextByTarget[targetId]?.triples ?? [];
      const deleted = new Set(deletedValueIdsByTarget[targetId] ?? []);
      return added
        .map(triple => ({
          ...triple,
          values: triple.values.filter(val => !deleted.has(val.id)),
        }))
        .filter(triple => triple.values.length > 0);
    },
    [deletedValueIdsByTarget, userContextByTarget]
  );

  const getContextForTarget = React.useCallback(
    (targetId: string): ResolvedEntityContext => {
      const seeded = initialContextByTarget?.[targetId];
      const added = userContextByTarget[targetId];
      const deleted = new Set(deletedValueIdsByTarget[targetId] ?? []);

      // Merge seeded + user-added triples that share the same predicate into one row
      const byPredicate = new Map<string, EntityTripleModel>();
      for (const triple of [...(seeded?.triples ?? []), ...(added?.triples ?? [])]) {
        const remaining = triple.values.filter(val => !deleted.has(val.id));
        if (remaining.length === 0) continue;
        const key = triple.predicate.toLowerCase();
        const existing = byPredicate.get(key);
        if (existing) {
          byPredicate.set(key, { ...existing, values: [...existing.values, ...remaining] });
        } else {
          byPredicate.set(key, { ...triple, values: remaining });
        }
      }

      return {
        triples: Array.from(byPredicate.values()),
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
      getAddedTriplesForTarget,
      addTriple,
      addTripleValue,
      addFlag,
      deleteTripleValue,
      inspectRelation,
      flagVotes,
      voteOnFlag,
      callbacks,
      popoverContainer,
      showAllContext,
      toggleShowAllContext,
      setShowAllContext,
    }),
    [
      openComposer,
      openViewer,
      getContextForTarget,
      getAddedTriplesForTarget,
      addTriple,
      addTripleValue,
      addFlag,
      deleteTripleValue,
      inspectRelation,
      flagVotes,
      voteOnFlag,
      callbacks,
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

  const activePaneTarget: EntityActionTarget | null = inspectedRelation
    ? {
        id: inspectedRelation.id,
        kind: 'Relation',
        title: `${inspectedRelation.fromTarget.title} → ${inspectedRelation.toValue.label}`,
      }
    : viewerTarget;

  const viewerData = activePaneTarget ? getContextForTarget(activePaneTarget.id) : { triples: [], flags: [] };
  const flagTotalPages = Math.max(1, Math.ceil(viewerData.flags.length / FLAGS_PER_PAGE));
  const safeFlagPage = Math.min(flagPage, flagTotalPages);
  const visibleDrawerFlags = viewerData.flags.slice((safeFlagPage - 1) * FLAGS_PER_PAGE, safeFlagPage * FLAGS_PER_PAGE);

  return (
    <EntityActionContext.Provider value={contextValue}>
      {children}

      {/* Non-blocking right detail pane (Entity Context or Relation Entity) */}
      {activePaneTarget && (
        <aside
          role="dialog"
          aria-label={
            inspectedRelation
              ? `Relation: ${inspectedRelation.fromTarget.title} → ${inspectedRelation.toValue.label}`
              : `Context for ${activePaneTarget.title}`
          }
          className="fixed top-11 right-0 bottom-0 z-[120] flex w-full max-w-[460px] flex-col border-l border-black/[0.06] bg-white shadow-[-12px_0_40px_rgba(0,0,0,0.08)]"
        >
          <header className="flex flex-col gap-2.5 border-b border-divider px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                {inspectedRelation && inspectedRelation.returnToViewer && (
                  <button
                    type="button"
                    onClick={() => setInspectedRelation(null)}
                    className="inline-flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-[13.5px] font-medium text-grey-04 transition-colors hover:text-[#4c1fd4]"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                    <span>Back to {inspectedRelation.fromTarget.title}</span>
                  </button>
                )}

                {inspectedRelation ? (
                  <h3 className="m-0 text-[19px] leading-[25px] font-semibold text-pretty text-text">
                    <span>{inspectedRelation.fromTarget.title}</span>
                    <span className="mx-1.5 font-normal text-grey-04">→</span>
                    <span>{inspectedRelation.toValue.label}</span>
                  </h3>
                ) : (
                  <h3 className="m-0 text-[19px] leading-[25px] font-semibold text-pretty text-text">
                    {activePaneTarget.title}
                  </h3>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {inspectedRelation ? (
                    <>
                      <span className="inline-flex h-6 items-center gap-1 rounded-md border border-divider bg-grey-01 px-2 text-[12.5px] font-medium text-grey-05">
                        <RelationSmall />
                        <span>Relation</span>
                      </span>
                      <span className="inline-flex h-6 items-center rounded-md border border-divider bg-white px-2 text-[12.5px] font-medium text-text">
                        {inspectedRelation.predicate}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex h-6 items-center rounded-md border border-divider bg-grey-01 px-2 text-[12.5px] font-medium text-grey-05">
                      {activePaneTarget.kind}
                    </span>
                  )}
                </div>
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
          </header>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            {inspectedRelation && (
              <section aria-label="Relation endpoints" className="flex flex-col gap-2.5">
                <h4 className="m-0 text-[17px] leading-[22px] font-semibold text-text">Statement</h4>
                <div className="flex flex-col divide-y divide-divider rounded-xl border border-black/[0.06] bg-white text-[14px]">
                  <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="shrink-0 text-[12.5px] text-grey-04">From</span>
                    <button
                      type="button"
                      onClick={() => openViewer(inspectedRelation.fromTarget)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-right font-medium text-text transition-colors hover:text-[#4c1fd4]"
                    >
                      {inspectedRelation.fromTarget.title}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-grey-01/60 px-4 py-2.5">
                    <span className="shrink-0 text-[12.5px] text-grey-04">Relation type</span>
                    <span className="inline-flex items-center gap-2 font-medium text-text">
                      <span>{inspectedRelation.predicate}</span>
                      <RightArrowLong color="grey-04" />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="shrink-0 text-[12.5px] text-grey-04">To</span>
                    {inspectedRelation.toValue.href ? (
                      <Link
                        href={inspectedRelation.toValue.href}
                        className="text-right font-medium text-text no-underline transition-colors hover:text-[#4c1fd4]"
                      >
                        {inspectedRelation.toValue.label}
                      </Link>
                    ) : inspectedRelation.toValue.onSelect ? (
                      <button
                        type="button"
                        onClick={() => {
                          closeAll();
                          inspectedRelation.toValue.onSelect?.();
                        }}
                        className="cursor-pointer border-0 bg-transparent p-0 text-right font-medium text-text transition-colors hover:text-[#4c1fd4]"
                      >
                        {inspectedRelation.toValue.label}
                      </button>
                    ) : (
                      <span className="text-right font-medium text-text">{inspectedRelation.toValue.label}</span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Context section with real section header & right-aligned borderless + anchored popover.
                With Add context off (GEO-3819) it only shows when there is context to read. */}
            {(TEMPLATE_ACTIONS.addContext || viewerData.triples.length > 0) && (
              <section aria-label="Context" className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 inline-flex items-center gap-2 text-[17px] leading-[22px] font-semibold text-text">
                    <NetworkIcon className="size-4 text-grey-04" />
                    <span>Context</span>
                  </h4>
                  <AddContextPopover onSubmit={(pred, vals) => addTriple(activePaneTarget.id, pred, vals)} />
                </div>

                {viewerData.triples.length > 0 ? (
                  <div className="@container">
                    <TripleKeyValueList
                      target={activePaneTarget}
                      triples={viewerData.triples}
                      onInspectRelation={(t, p, v) => inspectRelation(t, p, v, { returnToViewer: true })}
                      onAddValue={addTripleValue}
                      onDeleteValue={deleteTripleValue}
                    />
                  </div>
                ) : (
                  <p className="m-0 text-[14px] text-grey-04">No context added yet.</p>
                )}
              </section>
            )}

            {/* Disputes section with real section header & right-aligned borderless + anchored popover.
                With Dispute off (GEO-3819) it only shows when there are disputes to read. */}
            {(TEMPLATE_ACTIONS.dispute || viewerData.flags.length > 0) && (
              <section aria-label="Disputes" className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 inline-flex items-center gap-2 text-[17px] leading-[22px] font-semibold text-text">
                    <FlagIcon className="size-4 text-grey-04" />
                    <span>Disputes</span>
                  </h4>
                  <AddFlagPopover onSubmit={draft => addFlag(activePaneTarget.id, draft)} />
                </div>

                {visibleDrawerFlags.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {visibleDrawerFlags.map(flag => {
                      const vote = flagVotes[flag.id] ?? null;
                      return (
                        <article
                          key={flag.id}
                          className="flex flex-col gap-2.5 rounded-xl border border-black/[0.05] bg-grey-01/55 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text">
                              <FlagIcon className="size-3.5 text-grey-04" />
                              <span>{flag.reason ?? 'Disputed'}</span>
                            </span>

                            {flag.helpfulPercent !== undefined && (
                              <span className="text-[12.5px] text-grey-04 tabular-nums">
                                {flag.helpfulPercent}% agree
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

                          <div className="flex items-center gap-1.5 pt-1" role="group" aria-label="Vote on dispute">
                            <button
                              type="button"
                              aria-pressed={vote === 'agree'}
                              onClick={() => voteOnFlag(flag.id, 'agree')}
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
                              onClick={() => voteOnFlag(flag.id, 'disagree')}
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
                    <InlinePagination
                      page={safeFlagPage}
                      totalPages={flagTotalPages}
                      onPageChange={setFlagPage}
                      label="Disputes pages"
                    />
                  </div>
                ) : (
                  <p className="m-0 text-[14px] text-grey-04">No disputes</p>
                )}
              </section>
            )}
          </div>
        </aside>
      )}

      {/* Add context (Triple) / Flag composer dialog; never opens for an action that is switched off */}
      {composer && (composer.action === 'flag' ? TEMPLATE_ACTIONS.dispute : TEMPLATE_ACTIONS.addContext) && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div aria-hidden onClick={closeComposerOnly} className="fixed inset-0 bg-black/25 backdrop-blur-[1px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              composer.action === 'flag'
                ? `Dispute ${composer.target.title}`
                : `Add context to ${composer.target.title}`
            }
            className="rounded-2xl relative z-10 flex w-full max-w-[480px] flex-col gap-4 border border-black/[0.06] bg-white p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-grey-04">
                  {composer.action === 'flag' ? (
                    <>
                      <FlagIcon className="size-3.5 text-grey-04" />
                      <span>Dispute · {composer.target.kind}</span>
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
                onClick={closeComposerOnly}
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
                    <span className="text-[13.5px] font-medium text-text">Why are you disputing this?</span>
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
                  onClick={closeComposerOnly}
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
                  {composer.action === 'flag' ? 'Submit dispute' : 'Add context'}
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
          onAddValue={ctx.addTripleValue}
          onDeleteValue={ctx.deleteTripleValue}
        />
      )}

      {flags.map(flag => {
        const vote = ctx.flagVotes[flag.id] ?? null;
        return (
          <div
            key={flag.id}
            className="flex flex-col gap-1.5 rounded-xl border border-black/[0.05] bg-grey-01/55 px-3 py-2.5 text-[13px] leading-[18px]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-text">
                <FlagIcon className="size-3 text-grey-04" />
                <span>{flag.reason ?? 'Disputed'}</span>
              </span>
              {flag.helpfulPercent !== undefined && (
                <span className="text-[12px] text-grey-04 tabular-nums">{flag.helpfulPercent}% agree</span>
              )}
            </div>
            <p className="m-0 text-text/85">{flag.body}</p>
            <div className="flex items-center gap-1.5 pt-0.5" role="group" aria-label="Vote on dispute">
              <button
                type="button"
                aria-pressed={vote === 'agree'}
                onClick={() => ctx.voteOnFlag(flag.id, 'agree')}
                className={cx(
                  'inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2 text-[12px] font-medium transition-colors',
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
                onClick={() => ctx.voteOnFlag(flag.id, 'disagree')}
                className={cx(
                  'inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2 text-[12px] font-medium transition-colors',
                  vote === 'disagree'
                    ? 'border-text bg-text text-white'
                    : 'border-grey-02 bg-white text-text hover:border-text'
                )}
              >
                <ThumbDownIcon className="size-3" />
                <span>Disagree</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Always-rendered Flags section for entity pages (`Claim`, `Source`, `Event`, `News story`).
 * Shows a clean empty state when no flags exist, right-aligned borderless `+` to add a flag,
 * Agree / Disagree voting per flag, and pagination when more flags exist than fit cleanly.
 */
export function EntityFlagsSection({ target, className }: { target: EntityActionTarget; className?: string }) {
  const ctx = React.useContext(EntityActionContext);
  const [page, setPage] = React.useState(1);

  const flags = ctx?.getContextForTarget(target.id).flags ?? [];
  const totalPages = Math.max(1, Math.ceil(flags.length / FLAGS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleFlags = flags.slice((safePage - 1) * FLAGS_PER_PAGE, safePage * FLAGS_PER_PAGE);

  // With Dispute off (GEO-3819) an empty section is only an empty state with nothing to do.
  if (!TEMPLATE_ACTIONS.dispute && flags.length === 0) return null;

  return (
    <section aria-label="Disputes" className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">Disputes</h2>
        {ctx && <AddFlagPopover onSubmit={draft => ctx.addFlag(target.id, draft)} />}
      </div>

      {visibleFlags.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-black/[0.025] bg-white px-5 py-4 shadow-[0_10px_36px_-6px_rgba(0,0,0,0.065),0_2px_10px_-2px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col gap-3">
            {visibleFlags.map(flag => {
              const vote = ctx?.flagVotes[flag.id] ?? null;
              return (
                <article
                  key={flag.id}
                  className="flex flex-col gap-2 rounded-xl border border-black/[0.05] bg-grey-01/55 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text">
                      <FlagIcon className="size-3.5 text-grey-04" />
                      <span>{flag.reason ?? 'Disputed'}</span>
                    </span>
                    {flag.helpfulPercent !== undefined && (
                      <span className="text-[12.5px] text-grey-04 tabular-nums">{flag.helpfulPercent}% agree</span>
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

                  {ctx && (
                    <div className="flex items-center gap-1.5 pt-0.5" role="group" aria-label="Vote on dispute">
                      <button
                        type="button"
                        aria-pressed={vote === 'agree'}
                        onClick={() => ctx.voteOnFlag(flag.id, 'agree')}
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
                        onClick={() => ctx.voteOnFlag(flag.id, 'disagree')}
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
                  )}
                </article>
              );
            })}
            <InlinePagination page={safePage} totalPages={totalPages} onPageChange={setPage} label="Disputes pages" />
          </div>
        </div>
      ) : (
        <div className="border-t border-divider/80 pt-3 text-[14px] text-grey-04">
          <p className="m-0">No disputes</p>
        </div>
      )}
    </section>
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
  const showAddContext = TEMPLATE_ACTIONS.addContext;
  const showDispute = TEMPLATE_ACTIONS.dispute;
  const hasWriteItems = showAddContext || showDispute;
  const hasShowAllContextToggle = isPageRoot && Boolean(ctx);
  const hasShowContextItem = !isPageRoot && hasAny;
  // With Add context and Dispute off (GEO-3819) the menu can be left with nothing in it; then the
  // "..." trigger goes too, rather than opening an empty menu.
  const hasMenuItems = hasWriteItems || hasShowAllContextToggle || hasShowContextItem;

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
          aria-label={`Show ${flagCount} ${flagCount === 1 ? 'dispute' : 'disputes'} for ${target.title}`}
          title={`${flagCount} ${flagCount === 1 ? 'dispute' : 'disputes'}`}
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border-0 bg-grey-01 px-2 text-[12px] font-medium whitespace-nowrap text-grey-05 tabular-nums transition-colors hover:bg-grey-02/70 hover:text-text"
        >
          <FlagIcon className="size-3 text-grey-04" />
          <span>{flagCount}</span>
        </button>
      )}

      {hasMenuItems && (
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
            // The small button's ::after widens its tap target to 32px without changing how it looks.
            size === 'md' ? 'size-8' : 'relative size-7 after:absolute after:-inset-0.5'
          )}
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      )}

      {open && hasMenuItems && (
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
              {hasWriteItems && <div className="my-1 h-px bg-divider" />}
            </>
          )}

          {hasShowContextItem && (
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
              {hasWriteItems && <div className="my-1 h-px bg-divider" />}
            </>
          )}

          {showAddContext && (
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerAction('add-context')}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
            >
              <NetworkIcon className="size-4 text-grey-04" />
              <span>Add context</span>
            </button>
          )}

          {showDispute && (
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerAction('flag')}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
            >
              <FlagIcon className="size-4 text-grey-04" />
              <span>Dispute</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
