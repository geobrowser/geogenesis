'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { Menu } from '~/design-system/menu';
import { Tooltip } from '~/design-system/tooltip';

import {
  BusyDots,
  ClockIcon,
  ICON_BUTTON_CLASS,
  MENU_ITEM_CLASS,
  PILL_CLASS,
  PRIMARY_CLASS,
  SMALL_TAG_CLASS,
  WarnIcon,
} from './editor-ui';
import type { ReelJob } from './reel-status';
import { SPEAKER_FILL_CLASS } from './speaker-classes';

export type HeaderPopover = 'menu' | 'publish' | 'unlock';

/** Where the reel stands, never "published" while it is only queued. */
export function statusOf({
  job,
  dirty,
  handPicked,
  noReel,
  handPickedAt,
}: {
  job: ReelJob;
  dirty: boolean;
  handPicked: boolean;
  /** Locked with no reel (geo-chat#352): viewers see none. */
  noReel: boolean;
  handPickedAt: string | null;
}): { label: string; className: string; icon?: 'clock' | 'dots'; tip?: string } {
  const quiet = 'bg-grey-01 text-text';
  if (job.kind === 'queued') {
    return {
      label: job.preview ? 'Preview queued' : noReel ? 'Queued · no reel yet' : 'Queued · live reel unchanged',
      className: quiet,
      icon: 'clock',
    };
  }
  if (job.kind === 'rendering')
    return { label: job.preview ? 'Previewing' : 'Rendering clips', className: quiet, icon: 'dots' };
  if (dirty) return { label: 'Unsaved changes', className: quiet };
  if (noReel) return { label: 'Locked · no reel', className: 'bg-red-02 text-red-01' };
  if (handPicked) {
    return {
      label: 'Hand-picked · locked',
      className: 'bg-text text-white',
      // geo-chat names when a reel was hand-picked only when it knows (GEO-3666).
      ...(handPickedAt && {
        tip: `Hand-picked on ${new Date(handPickedAt).toLocaleString()}. Automatic picks and re-cuts leave it alone.`,
      }),
    };
  }
  return { label: 'Auto-picked', className: 'bg-grey-01 text-grey-04' };
}

const TAG_CLASS =
  'inline-flex h-[22px] items-center gap-1.5 rounded-sm px-1.5 text-breadcrumb font-medium whitespace-nowrap';

/**
 * The editor's header (GEO-3773): the two debaters, the debate's claim, where the reel stands, and
 * what can be done with it. Publish and Return to automatic confirm in popovers under the header,
 * so they never push the editor down.
 */
export function EditorHeader({
  title,
  debaters,
  viewHref,
  status,
  approximate,
  canDiscard,
  onDiscard,
  canUnlock,
  unlockPending,
  popover,
  onPopover,
  warningCount,
  canCheck,
  onCheck,
  onWarnings,
  canPublish,
  publishTip,
  publishConfirm,
  unlockConfirm,
  onPublish,
  onUnlock,
  done = null,
}: {
  title: string;
  debaters: { slot: 1 | 2; name: string }[];
  viewHref: string | null;
  status: ReturnType<typeof statusOf>;
  /**
   * Why the reel's times are approximate, if they are: it is the moments as served, or a re-render
   * carried it over and its clips are still cut on the video from before it.
   */
  approximate: 'served' | 'carried' | null;
  canDiscard: boolean;
  onDiscard: () => void;
  canUnlock: boolean;
  unlockPending: boolean;
  /** The header popover that is open (as shown, never as stored). */
  popover: HeaderPopover | null;
  onPopover: (popover: HeaderPopover | null) => void;
  warningCount: number;
  canCheck: boolean;
  onCheck: () => void;
  onWarnings: () => void;
  canPublish: boolean;
  /** Why Publish is off, when there is something to fix. */
  publishTip: string | null;
  publishConfirm: { body: string; warnings: string | null };
  unlockConfirm: string;
  onPublish: () => void;
  onUnlock: () => void;
  /** Done, in a tab opened from the Best debates popup (GEO-3742): closes the tab. */
  done?: React.ReactNode;
}) {
  const toggle = (which: HeaderPopover) => onPopover(popover === which ? null : which);
  const publishButton = (
    <button type="button" className={PRIMARY_CLASS} disabled={!canPublish} onClick={() => toggle('publish')}>
      Publish
    </button>
  );
  return (
    // One row, as the prototype's `.hdr`: the title takes what the actions leave and ends in an
    // ellipsis, so the actions stay on the title's row, at its right. Stacked windows wrap.
    <header className="relative flex min-h-[59px] flex-none items-end justify-between gap-x-6 gap-y-2 max-[899px]:flex-wrap">
      <div data-header-title className="flex min-w-0 flex-1 flex-col gap-1 max-[899px]:basis-full">
        <div className="flex h-5 min-w-0 items-center gap-3.5">
          <span className="text-breadcrumb text-grey-04">Edit moments</span>
          {debaters.map(debater => (
            <span key={debater.slot} className="inline-flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className={cx(
                  'inline-grid h-5 w-5 flex-none place-items-center rounded-full text-[9px] font-semibold tracking-[0.2px] text-white',
                  SPEAKER_FILL_CLASS[debater.slot]
                )}
              >
                {initials(debater.name)}
              </span>
              <span className="truncate text-breadcrumb">{debater.name}</span>
            </span>
          ))}
        </div>
        <h1 title={title} className="m-0 truncate text-largeTitle max-[899px]:whitespace-normal">
          {title}
        </h1>
      </div>
      <div data-header-actions className="flex flex-none items-center gap-2 pb-1.5 max-[899px]:flex-wrap">
        {viewHref ? (
          <a
            href={viewHref}
            target="_blank"
            rel="noreferrer"
            className="mr-1 inline-flex items-center gap-1 text-breadcrumb whitespace-nowrap text-grey-04 no-underline hover:text-text"
          >
            View debate
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M2.5 7.5L7.5 2.5" stroke="currentColor" />
              <path d="M3.5 2.5H7.5V6.5" stroke="currentColor" />
            </svg>
          </a>
        ) : null}
        <span aria-hidden className="mr-1 h-5 w-px bg-grey-02" />
        <StatusTag status={status} />
        {approximate !== null ? (
          <Tooltip
            variant="light"
            label={
              approximate === 'served'
                ? 'These are the moments as served, so start and end times are approximate. Check them before publishing.'
                : 'Its clips are still cut on the video from before the re-render, so the times and words shown for them are approximate.'
            }
            trigger={
              <span tabIndex={0} className={SMALL_TAG_CLASS}>
                Times approximate
              </span>
            }
          />
        ) : null}
        {canDiscard ? (
          <button type="button" className={PILL_CLASS} onClick={onDiscard}>
            Discard changes
          </button>
        ) : null}
        {canUnlock ? (
          <ConfirmPopover
            open={popover === 'unlock'}
            onOpenChange={open => onPopover(open ? 'unlock' : null)}
            title="Return to automatic?"
            body={unlockConfirm}
            confirmLabel="Unlock and re-pick"
            onConfirm={onUnlock}
            width={340}
            trigger={
              <button
                type="button"
                className={PILL_CLASS}
                disabled={unlockPending}
                aria-expanded={popover === 'unlock'}
              >
                Return to automatic
              </button>
            }
          />
        ) : null}
        <Menu
          open={popover === 'menu'}
          onOpenChange={open => onPopover(open ? 'menu' : null)}
          asChild
          align="end"
          className="!w-[240px]"
          trigger={
            <button
              type="button"
              aria-label="Reel options"
              className={cx(ICON_BUTTON_CLASS, popover === 'menu' && '!bg-grey-01 !text-text')}
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none" aria-hidden>
                <ellipse cx="1.5" cy="1" rx="1" ry="1" fill="currentColor" />
                <ellipse cx="5" cy="1" rx="1" ry="1" fill="currentColor" />
                <ellipse cx="8.5" cy="1" rx="1" ry="1" fill="currentColor" />
              </svg>
            </button>
          }
        >
          <div role="menu" aria-label="Reel options">
            <button type="button" role="menuitem" className={MENU_ITEM_CLASS} disabled={!canCheck} onClick={onCheck}>
              <span className={cx(!canCheck && 'text-grey-03')}>Check before publishing</span>
            </button>
            <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={onWarnings}>
              <span>All warnings</span>
              <span className="font-normal text-grey-04 tabular-nums">{warningCount}</span>
            </button>
          </div>
        </Menu>
        {done}
        {publishTip && !canPublish ? (
          // Off, with something to fix: the reason is reachable by hover and by keyboard (a disabled
          // button takes neither, so the wrapper is the tooltip's trigger).
          <Tooltip
            label={publishTip}
            position="bottom"
            align="end"
            trigger={
              <span className="inline-flex" tabIndex={0}>
                {publishButton}
              </span>
            }
          />
        ) : (
          <ConfirmPopover
            open={popover === 'publish'}
            onOpenChange={open => onPopover(open ? 'publish' : null)}
            title="Publish this reel?"
            body={publishConfirm.body}
            extra={
              publishConfirm.warnings ? (
                <p className="m-0 flex items-start gap-2 text-metadata">
                  <WarnIcon className="mt-0.5 text-grey-04" />
                  <span>{publishConfirm.warnings}</span>
                </p>
              ) : null
            }
            confirmLabel={publishConfirm.warnings ? 'Publish anyway' : 'Publish'}
            onConfirm={onPublish}
            width={380}
            trigger={publishButton}
          />
        )}
      </div>
    </header>
  );
}

function StatusTag({ status }: { status: ReturnType<typeof statusOf> }) {
  const tag = (
    <span
      tabIndex={status.tip ? 0 : -1}
      aria-busy={status.icon === 'dots' || undefined}
      className={cx(TAG_CLASS, status.className)}
    >
      {status.icon === 'clock' ? <ClockIcon /> : status.icon === 'dots' ? <BusyDots /> : null}
      {status.label}
    </span>
  );
  return status.tip ? <Tooltip variant="light" label={status.tip} trigger={tag} align="end" /> : tag;
}

/** A confirm anchored under its button (`admin-debate-calendar.tsx`'s Radix Popover). */
function ConfirmPopover({
  open,
  onOpenChange,
  trigger,
  title,
  body,
  extra = null,
  confirmLabel,
  onConfirm,
  width,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: string;
  body: string;
  extra?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  width: number;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="alertdialog"
          aria-label={title}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          style={{ width }}
          className="z-100 flex max-w-[calc(100vw-32px)] flex-col gap-3 rounded-lg border border-grey-02 bg-white p-4 shadow-card"
        >
          <div className="text-smallTitle">{title}</div>
          <p className="m-0 text-metadata text-grey-05">{body}</p>
          {extra}
          <div className="flex justify-end gap-2">
            <button type="button" className={PILL_CLASS} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="button" className={cx(PRIMARY_CLASS, '!px-3 !py-1')} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join('');
}
