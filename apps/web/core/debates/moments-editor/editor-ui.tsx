'use client';

import * as React from 'react';

import cx from 'classnames';

import { tagStyles } from '~/design-system/tag';

import type { ParticipantSlot } from '../api';
import { NO_SPEAKER_CHIP_CLASS, SPEAKER_CHIP_CLASS } from './speaker-classes';

/**
 * The moments editor's small pieces (GEO-3773), drawn as the approved prototype has them: the
 * outlined pill buttons, number chips, the segmented groups, the switch and the icons.
 */

/** The prototype's outlined pill (`.hp`): 28 px, grey outline, white. */
export const PILL_CLASS =
  'inline-flex h-7 flex-none cursor-pointer items-center justify-center gap-1.5 rounded-full border border-grey-02 bg-white px-3 text-metadata whitespace-nowrap text-text transition-colors hover:bg-grey-01 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:cursor-default disabled:opacity-50 disabled:hover:bg-white';
/** The compact pill (`.hpc`): 26 px, breadcrumb type. */
export const PILL_COMPACT_CLASS = '!h-[26px] !px-2.5 !text-breadcrumb font-medium';
/** A pill that is on (`.hpon`): Replace while its picker is open, Advanced while open. */
export const PILL_ON_CLASS = '!border-text !bg-text !text-white';
/** The round icon button (`.ib`). */
export const ICON_BUTTON_CLASS =
  'inline-grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-grey-04 hover:bg-grey-01 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';
/** The menu row (`.mi`). */
export const MENU_ITEM_CLASS =
  'relative flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-white px-3 py-2.5 text-left text-button text-text before:absolute before:inset-1 before:rounded before:content-[""] hover:before:bg-grey-01 [&>span]:relative [&>span]:z-[1]';
/** The light popover surface (`.menu`). */
export const MENU_SURFACE_CLASS = 'z-100 overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg';
/** The primary button (`.bp`). */
export const PRIMARY_CLASS =
  'inline-flex flex-none cursor-pointer items-center justify-center gap-2 rounded border border-transparent bg-ctaPrimary px-3 py-2 text-button whitespace-nowrap text-white hover:bg-ctaHover disabled:pointer-events-none disabled:bg-divider disabled:text-grey-03';
/** A separator between groups of a bar. */
export function BarSeparator() {
  return <span aria-hidden className="mx-0.5 h-[18px] w-px flex-none bg-grey-02" />;
}

/** A clip's number in its speaker's colours. */
export function ClipChip({
  number,
  speaker,
  small = false,
  className,
}: {
  number: number;
  speaker: ParticipantSlot | null;
  small?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-grid flex-none place-items-center rounded-sm font-medium tabular-nums',
        small ? 'h-4 min-w-4 px-[3px] text-[11px] leading-none' : 'h-5 min-w-5 px-1 text-breadcrumb leading-none',
        speaker === 1 || speaker === 2 ? SPEAKER_CHIP_CLASS[speaker] : NO_SPEAKER_CHIP_CLASS,
        className
      )}
    >
      {number}
    </span>
  );
}

/** A segmented group (`.seg`): the Focus switch, the ±s zoom. */
export function SegmentGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <span
      role={label ? 'group' : undefined}
      aria-label={label}
      className="inline-flex h-[26px] flex-none items-stretch overflow-hidden rounded-full border border-grey-02"
    >
      {children}
    </span>
  );
}

export function SegmentButton({
  pressed,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'button'> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      {...props}
      className={cx(
        'cursor-pointer border-0 px-[9px] text-breadcrumb font-medium whitespace-nowrap [&+&]:border-l [&+&]:border-grey-02',
        pressed ? 'bg-text text-white' : 'bg-white text-text hover:bg-grey-01',
        'disabled:cursor-default disabled:opacity-50',
        className
      )}
    />
  );
}

/** The small grey tag: Edited, Live now, Picked, Times approximate. */
export const SMALL_TAG_CLASS = tagStyles('flex-none font-medium');

export function WarnIcon({ size = 16, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('flex-none', className)}
    >
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" />
      <rect x="7.5" y="4" width="1" height="6" rx="0.5" fill="currentColor" />
      <rect x="7.5" y="11.5" width="1" height="1" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon({ size = 12, nudge = false }: { size?: number; nudge?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className={nudge ? 'ml-0.5' : undefined}>
      <path d="M2.5 1.2v9.6c0 .4.4.6.7.4l7.6-4.8a.5.5 0 0 0 0-.8L3.2.8c-.3-.2-.7 0-.7.4z" fill="currentColor" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <rect x="1" y="1" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <rect x="2" y="1" width="3" height="10" rx="1" fill="currentColor" />
      <rect x="7" y="1" width="3" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1.5 10.5L10.5 1.5" stroke="currentColor" />
      <path d="M1.5 1.5L10.5 10.5" stroke="currentColor" />
    </svg>
  );
}

export function ChevronDown({ className }: { className?: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden className={className}>
      <path d="M0.5 2.5L4 6L7.5 2.5" stroke="currentColor" />
    </svg>
  );
}

export function ChevronSide({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d={direction === 'left' ? 'M7.5 2.5L4 6L7.5 9.5' : 'M4.5 2.5L8 6L4.5 9.5'} stroke="currentColor" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <span className="pointer-events-none absolute top-2.5 left-3 text-grey-04">
      <svg width="16" height="17" viewBox="0 0 16 17" fill="none" aria-hidden>
        <rect x="0.5" y="1" width="12" height="12" rx="6" stroke="currentColor" />
        <path d="M15.33 15.83L11 11.5" stroke="currentColor" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="text-grey-04">
      <circle cx="6" cy="6" r="5.5" stroke="currentColor" />
      <path d="M6 2.25V6L8.25 8.25" stroke="currentColor" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-grey-04">
      <path d="M12 4.5C13.933 4.5 15.5 6.067 15.5 8C15.5 9.933 13.933 11.5 12 11.5" stroke="currentColor" />
      <path d="M12 4.5H9" stroke="currentColor" />
      <path d="M12 11.5H9" stroke="currentColor" />
      <path d="M4 11.5C2.067 11.5 0.5 9.933 0.5 8C0.5 6.067 2.067 4.5 4 4.5" stroke="currentColor" />
      <path d="M4 4.5H7" stroke="currentColor" />
      <path d="M4 11.5H7" stroke="currentColor" />
      <path d="M4 8H12" stroke="currentColor" />
    </svg>
  );
}

/** The three bobbing dots: rendering, previewing, loading the next clip. */
export function BusyDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {[0, 150, 300].map(delay => (
        <i
          key={delay}
          className="block h-1 w-1 animate-bounce rounded-full bg-grey-03 motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
