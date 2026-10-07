'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A line under the title. */
  description?: string;
  /** Beside the close button. */
  headerAction?: React.ReactNode;
  /** Analytics attributes for the close button, from the caller's surface. */
  closeButtonProps?: Readonly<Record<`data-${string}`, string>>;
  /** Focus goes back here on close, since the opener is off in the panel behind the overlay. */
  openerRef?: React.RefObject<HTMLElement | null>;
  /** The frame's width on a desktop; a phone always takes the whole screen. */
  widthClassName?: string;
  children: React.ReactNode;
};

/**
 * The frame the scheduling dialogs share: the availability editor (GEO-2936) and admin New match
 * (GEO-2942). Wider than the shared `Dialog` allows, so it drives the Radix primitives directly, as
 * the debate share sheet does.
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  title,
  description,
  headerAction,
  closeButtonProps,
  openerRef,
  widthClassName = 'w-[56rem]',
  children,
}: Props) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        {/* Above the status bar, the toasts and the chat launcher — see `scheduleDialog` in
            `core/z-layers`. Full screen on a phone, those corners sat on top of its footer and
            took the taps meant for Clear all and Save. */}
        <Overlay className={cx('fixed inset-0 bg-text/20', Z_LAYER_CLASS.scheduleDialogBackdrop)} />
        <Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            if (!openerRef?.current) return;
            event.preventDefault();
            openerRef.current.focus();
          }}
          // Centred on a desktop window; on a phone it takes the whole screen, where a week grid
          // has no room to spare for margins.
          className={cx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-hidden md:inset-0 md:translate-x-0 md:translate-y-0',
            Z_LAYER_CLASS.scheduleDialog
          )}
        >
          {/* A column with a hard ceiling: the title stays at the top, the caller's footer at the
              bottom, and what is between them absorbs whatever height is left. Nothing here
              scrolls as a whole — a short window must not carry the footer off the bottom edge.

              `data-no-sheet-drag` because React events cross portals by the component tree, not the
              DOM: on mobile this dialog is rendered inside the debates hub's bottom sheet as far as
              React is concerned, so dragging downwards here dragged the *sheet*, and a long drag
              dismissed it — taking the banner, and with it this dialog, away mid-gesture. */}
          <div
            data-no-sheet-drag
            className={cx(
              'flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden overscroll-none rounded-xl bg-white p-5 shadow-card md:h-dvh md:max-h-dvh md:w-screen md:max-w-none md:gap-3 md:rounded-none md:p-4',
              widthClassName
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <Title asChild>
                  <Text as="h2" variant="smallTitle">
                    {title}
                  </Text>
                </Title>
                {description ? (
                  <Text as="p" variant="footnote" color="grey-04">
                    {description}
                  </Text>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {headerAction}
                <button
                  type="button"
                  aria-label="Close"
                  {...closeButtonProps}
                  onClick={() => onOpenChange(false)}
                  className="grid size-4 shrink-0 place-items-center text-[#151515] transition-opacity hover:opacity-70"
                >
                  <Close />
                </button>
              </div>
            </div>
            {children}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
