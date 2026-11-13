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
  /**
   * `narrow` for one player on its own; `compare` for the compare view (D1); `watch` for the watch
   * dialog's player beside its transcript (GEO-3728), a fixed height whose columns scroll themselves.
   */
  size?: 'narrow' | 'compare' | 'watch';
  /** D1's round close button. */
  roundClose?: boolean;
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
 * The frame every step of placing a Best debate shares (GEO-3678): the compare view and the
 * Placed confirmation. Above the ranking screen (z-50); a phone
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
  roundClose = false,
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
              // Never taller than what's visible (an iPhone SE cut Placed's title off, 12 Nov): the
              // header and footer stay put and the middle scrolls. `vh` first, `dvh`/`svh` where the
              // browser has them, so the toolbar of a mobile browser can't push the top off screen.
              'mt-16 flex max-h-[calc(100vh-5rem)] w-full flex-col gap-4 rounded-xl bg-white p-6 shadow-dropdown focus:outline-hidden supports-[height:100dvh]:max-h-[calc(100dvh-5rem)] md:mt-0 md:p-4',
              phoneSheet
                ? 'md:rounded-t-2xl md:max-h-[calc(100vh-12px)] md:rounded-b-none md:pb-[max(16px,env(safe-area-inset-bottom))] supports-[height:100svh]:md:max-h-[calc(100svh-env(safe-area-inset-top)-12px)]'
                : 'md:h-screen md:max-h-none md:rounded-none supports-[height:100dvh]:md:h-[100dvh] supports-[height:100dvh]:md:max-h-none',
              size === 'compare'
                ? 'w-auto max-w-[min(100%,960px)] min-w-[min(100%,560px)] rounded-[20px] px-[26px] pt-6 pb-[22px] md:w-full md:min-w-0 md:px-3.5 md:pt-[18px]'
                : wide
                  ? 'max-w-[1350px]'
                  : size === 'narrow'
                    ? 'max-w-[560px]'
                    : size === 'watch'
                      ? cx(
                          'h-[min(760px,calc(100vh-5rem))] max-w-[960px] supports-[height:100dvh]:h-[min(760px,calc(100dvh-5rem))]',
                          // A short, wide screen (a phone on its side): the whole height, less a margin,
                          // so the player isn't squeezed by the 64px the dialog usually keeps above it.
                          '[@media(min-width:768px)_and_(max-height:560px)]:mt-4 [@media(min-width:768px)_and_(max-height:560px)]:h-[calc(100dvh-2rem)] [@media(min-width:768px)_and_(max-height:560px)]:max-h-[calc(100dvh-2rem)]'
                        )
                      : 'max-w-[880px]'
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title
                  className={cx('m-0 text-text', size === 'compare' ? 'text-smallTitle' : 'text-smallTitle')}
                >
                  {title}
                </Dialog.Title>
                {subtitle ? (
                  <div
                    className={cx('text-grey-04', size === 'compare' ? 'mt-1.5 text-footnote' : 'mt-1 text-metadata')}
                  >
                    {subtitle}
                  </div>
                ) : null}
              </div>
              <Dialog.Close asChild>
                {roundClose ? (
                  <button
                    type="button"
                    aria-label="Close"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-grey-01 text-text transition-colors hover:bg-grey-02"
                  >
                    <Close />
                  </button>
                ) : (
                  <SquareButton icon={<Close />} aria-label="Close" />
                )}
              </Dialog.Close>
            </div>
            {/* The only part that scrolls. */}
            <div
              className={cx(
                '-mx-6 flex min-h-0 flex-1 flex-col gap-4 px-6 md:-mx-4 md:px-4',
                // The watch dialog's transcript scrolls itself, so the player never scrolls away.
                size === 'watch' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'
              )}
              data-testid="ranking-flow-dialog-body"
            >
              {children}
            </div>
            {footer ? <div className="flex shrink-0 justify-end gap-2 md:flex-col-reverse">{footer}</div> : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
