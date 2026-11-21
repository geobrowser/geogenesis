'use client';

import * as React from 'react';

import cx from 'classnames';

import { CloseIcon, FlagIcon, MessagePlusIcon, MoreHorizontalIcon } from './icons';

export type EntityActionKind = 'challenge' | 'add-context';

export interface EntityActionTarget {
  id: string;
  kind: string;
  title: string;
}

export interface EntitySubmittedAction {
  id: string;
  targetId: string;
  action: EntityActionKind;
  reason?: string;
  body: string;
  sourceUrl?: string;
}

interface EntityActionContextValue {
  openAction: (action: EntityActionKind, target: EntityActionTarget) => void;
  getCountForTarget: (targetId: string) => { challenges: number; contexts: number };
}

const EntityActionContext = React.createContext<EntityActionContextValue | null>(null);

const CHALLENGE_REASONS = ['Disputed fact', 'Missing framing', 'Outdated', 'Unreliable source'] as const;

/**
 * Provides lightweight interactive Challenge and Add context dialogs for any `EntityOverflowMenu`
 * rendered within a template page.
 */
export function EntityActionProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<{ action: EntityActionKind; target: EntityActionTarget } | null>(null);
  const [submitted, setSubmitted] = React.useState<readonly EntitySubmittedAction[]>([]);
  const [reason, setReason] = React.useState<string>(CHALLENGE_REASONS[0]);
  const [body, setBody] = React.useState('');
  const [sourceUrl, setSourceUrl] = React.useState('');

  const openAction = React.useCallback((action: EntityActionKind, target: EntityActionTarget) => {
    setActive({ action, target });
    setReason(CHALLENGE_REASONS[0]);
    setBody('');
    setSourceUrl('');
  }, []);

  const close = React.useCallback(() => setActive(null), []);

  React.useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, close]);

  const countsByTarget = React.useMemo(() => {
    const map = new Map<string, { challenges: number; contexts: number }>();
    for (const entry of submitted) {
      const current = map.get(entry.targetId) ?? { challenges: 0, contexts: 0 };
      if (entry.action === 'challenge') current.challenges += 1;
      else current.contexts += 1;
      map.set(entry.targetId, current);
    }
    return map;
  }, [submitted]);

  const getCountForTarget = React.useCallback(
    (targetId: string) => countsByTarget.get(targetId) ?? { challenges: 0, contexts: 0 },
    [countsByTarget]
  );

  const contextValue = React.useMemo(() => ({ openAction, getCountForTarget }), [openAction, getCountForTarget]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || body.trim().length < 5) return;
    setSubmitted(prev => [
      ...prev,
      {
        id: `act-${Date.now()}`,
        targetId: active.target.id,
        action: active.action,
        reason: active.action === 'challenge' ? reason : undefined,
        body: body.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
      },
    ]);
    close();
  };

  return (
    <EntityActionContext.Provider value={contextValue}>
      {children}

      {active && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div aria-hidden onClick={close} className="fixed inset-0 bg-black/25 backdrop-blur-[1px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              active.action === 'challenge'
                ? `Challenge ${active.target.title}`
                : `Add context to ${active.target.title}`
            }
            className="rounded-2xl relative z-10 flex w-full max-w-[480px] flex-col gap-4 border border-black/[0.06] bg-white p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                  {active.action === 'challenge' ? (
                    <>
                      <FlagIcon className="size-3.5 text-purple" />
                      <span>Challenge {active.target.kind}</span>
                    </>
                  ) : (
                    <>
                      <MessagePlusIcon className="size-3.5 text-ctaPrimary" />
                      <span>Add context · {active.target.kind}</span>
                    </>
                  )}
                </span>
                <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-pretty text-text">
                  {active.target.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {active.action === 'challenge' && (
                <div className="flex flex-wrap gap-1.5">
                  {CHALLENGE_REASONS.map(option => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={reason === option}
                      onClick={() => setReason(option)}
                      className={cx(
                        'cursor-pointer rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                        reason === option
                          ? 'border-text bg-text text-white'
                          : 'border-grey-02 bg-white text-text hover:border-text'
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[13.5px] font-medium text-text">
                  {active.action === 'challenge' ? 'What should be challenged?' : 'Context for readers'}
                </span>
                <textarea
                  rows={3}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={
                    active.action === 'challenge'
                      ? 'Explain what is inaccurate, disputed, or missing...'
                      : 'Add clarifying context that helps readers across communities...'
                  }
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

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-4 text-[14px] font-medium text-text hover:border-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={body.trim().length < 5}
                  className="inline-flex h-9 cursor-pointer items-center rounded-full border border-text bg-text px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {active.action === 'challenge' ? 'Submit challenge' : 'Add context'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </EntityActionContext.Provider>
  );
}

export interface EntityOverflowMenuProps {
  target: EntityActionTarget;
  onChallenge?: (target: EntityActionTarget) => void;
  onAddContext?: (target: EntityActionTarget) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Quiet `...` overflow menu offering `Challenge` and `Add context` on claims, sources,
 * timeline milestones, debates, and entity headers.
 */
export function EntityOverflowMenu({
  target,
  onChallenge,
  onAddContext,
  size = 'sm',
  className,
}: EntityOverflowMenuProps) {
  const ctx = React.useContext(EntityActionContext);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const counts = ctx?.getCountForTarget(target.id) ?? { challenges: 0, contexts: 0 };
  const totalAdded = counts.challenges + counts.contexts;

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
    if (action === 'challenge' && onChallenge) {
      onChallenge(target);
      return;
    }
    if (action === 'add-context' && onAddContext) {
      onAddContext(target);
      return;
    }
    ctx?.openAction(action, target);
  };

  return (
    <div
      ref={containerRef}
      className={cx('relative inline-flex shrink-0 items-center gap-1.5', className)}
      onClick={e => e.stopPropagation()}
    >
      {totalAdded > 0 && (
        <span className="rounded-full bg-ctaTertiary px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-ctaPrimary tabular-nums">
          {counts.challenges > 0 && counts.contexts > 0
            ? `${totalAdded} notes`
            : counts.challenges > 0
              ? 'Challenged'
              : `${counts.contexts} context`}
        </span>
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
          className="absolute top-full right-0 z-50 mt-1 flex w-[176px] flex-col rounded-xl border border-black/[0.06] bg-white p-1.5 shadow-[0_14px_38px_-6px_rgba(0,0,0,0.12),0_3px_10px_-2px_rgba(0,0,0,0.05)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => triggerAction('challenge')}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
          >
            <FlagIcon className="size-4 text-grey-04" />
            <span>Challenge</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => triggerAction('add-context')}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[14px] font-medium text-text transition-colors hover:bg-grey-01"
          >
            <MessagePlusIcon className="size-4 text-grey-04" />
            <span>Add context</span>
          </button>
        </div>
      )}
    </div>
  );
}
