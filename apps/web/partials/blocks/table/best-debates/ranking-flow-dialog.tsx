'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

type Props = {
  open: boolean;
  /** Called for the close button, Escape and a press on the backdrop. */
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** The accessible name when `title` isn't plain text. */
  ariaLabel?: string;
  wide?: boolean;
  /** `narrow` for one player on its own (the watch dialog). */
  size?: 'narrow';
  /**
   * On a phone, a sheet along the bottom that is only as tall as its content (the Rank choice and
   * Placed), rather than a full-screen page with most of it empty.
   */
  phoneSheet?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onKeyDown?: (event: React.KeyboardEvent) => void;
};

/**
 * The frame every step of placing a Best debate shares (GEO-3678): the Rank it / Push it down
 * choice, the compare view and the Placed confirmation. Above the ranking screen (z-50); a phone
 * gets it full width from the top.
 *
 * The card is the Content, inside the Overlay, so a press on the backdrop dismisses it (an inset-0
 * Content would swallow that press).
 */
export function RankingFlowDialog({
  open,
  onClose,
  title,
  subtitle,
  ariaLabel,
  wide = false,
  size,
  phoneSheet = false,
  children,
  footer,
  onKeyDown,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cx(
            'fixed inset-0 z-[201] flex items-start justify-center overflow-y-auto bg-text/20 p-4 md:p-0',
            phoneSheet && 'md:items-end'
          )}
        >
          <Dialog.Content
            aria-describedby={undefined}
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            // The dialog itself takes focus, not its close button: a ring on the close control is
            // the first thing a tap-opened dialog showed on a phone.
            onOpenAutoFocus={event => {
              event.preventDefault();
              (event.currentTarget as HTMLElement | null)?.focus();
            }}
            tabIndex={-1}
            className={cx(
              'mt-16 flex w-full flex-col gap-4 rounded-xl bg-white p-6 shadow-dropdown focus:outline-hidden md:mt-0 md:p-4',
              phoneSheet
                ? 'md:rounded-t-2xl md:rounded-b-none md:pb-[max(16px,env(safe-area-inset-bottom))]'
                : 'md:min-h-full md:rounded-none',
              wide ? 'max-w-[1350px]' : size === 'narrow' ? 'max-w-[560px]' : 'max-w-[880px]'
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title className="m-0 text-[24px] leading-[29px] font-semibold tracking-[-0.3px] text-text md:text-[19px] md:leading-[23px]">
                  {title}
                </Dialog.Title>
                {subtitle ? (
                  <div className="mt-1 text-[16px] leading-[20px] text-grey-04 md:text-metadata">{subtitle}</div>
                ) : null}
              </div>
              <Dialog.Close asChild>
                <SquareButton icon={<Close />} aria-label="Close" />
              </Dialog.Close>
            </div>
            {children}
            {footer ? <div className="flex justify-end gap-2 md:flex-col-reverse">{footer}</div> : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
