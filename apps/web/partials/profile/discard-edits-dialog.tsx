'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { Button } from '~/design-system/button';
import { TextButton } from '~/design-system/text-button';

type Props = {
  open: boolean;
  /** Closing without choosing — Escape or the backdrop — goes back to editing. */
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSave: () => void;
  /** False when the edit cannot be published as it stands, e.g. a blank name. */
  canSave: boolean;
  /**
   * Why Save is disabled, shown in the prompt. The modal's own explanation — a
   * "Name is required" under the field — is behind this prompt's overlay, and
   * hidden from assistive technology while it is up.
   */
  saveBlockedReason: string | null;
};

/**
 * Asked before a profile modal closes on edits that were never saved. Wired up
 * through `useDiscardEditsGuard` below rather than directly.
 *
 * Rendered inside the modal it guards, so Radix treats it as a nested layer:
 * Escape dismisses this one only, and the modal underneath stays open with the
 * draft intact — as do Keep editing and a backdrop click. Stacked one step
 * above the modal's own `z-100`/`z-101`.
 */
export function DiscardEditsDialog({ open, onOpenChange, onDiscard, onSave, canSave, saveBlockedReason }: Props) {
  const keepEditingRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-102 bg-text/20" />
        <Content
          // The title is the whole message; there is nothing further to describe.
          aria-describedby={undefined}
          // Radix focuses the first button by default, which is Discard edits —
          // Enter straight after opening would throw the draft away. Start on the
          // one choice that loses nothing.
          onOpenAutoFocus={event => {
            event.preventDefault();
            keepEditingRef.current?.focus();
          }}
          // This container covers the overlay, so Radix never sees an outside
          // click — a press on the backdrop lands here and means "keep editing".
          onClick={event => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          className="fixed inset-0 z-103 flex items-center justify-center px-4 focus:outline-hidden"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-grey-02 bg-white p-5 shadow-dropdown">
            <Title className="text-smallTitle text-text">Exiting without saving will discard edits</Title>
            {!canSave && saveBlockedReason && <p className="text-metadata text-grey-04">{saveBlockedReason}</p>}
            {/* Keep editing sits centred under the pair it is the alternative to. */}
            <div className="flex flex-col items-center gap-3 self-end">
              {/* Wraps rather than overflowing: the pair needs about 236px, and a
                  320px phone leaves the card 248px before any font scaling. */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="secondary" onClick={onDiscard}>
                  Discard edits
                </Button>
                <Button type="button" onClick={onSave} disabled={!canSave}>
                  Save changes
                </Button>
              </div>
              <TextButton ref={keepEditingRef} onClick={() => onOpenChange(false)}>
                Keep editing
              </TextButton>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

/**
 * The close guard both profile modals share.
 *
 * `requestClose` is what every way out of a modal should call — X, Cancel,
 * Escape, the backdrop. With nothing to lose it discards and closes straight
 * away; otherwise it asks first. Spread `dialogProps` onto a
 * `DiscardEditsDialog` rendered inside the modal's `Content`.
 */
export function useDiscardEditsGuard({
  hasUnsavedEdits,
  canSave,
  saveBlockedReason,
  discard,
  save,
}: {
  hasUnsavedEdits: boolean;
  canSave: boolean;
  saveBlockedReason: string | null;
  /** Throws the draft away and closes the modal. */
  discard: () => void;
  /** Publishes the draft and closes the modal. */
  save: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  const requestClose = () => {
    if (hasUnsavedEdits) setIsOpen(true);
    else discard();
  };

  const dialogProps: Props = {
    open: isOpen,
    onOpenChange: setIsOpen,
    canSave,
    saveBlockedReason,
    onDiscard: () => {
      setIsOpen(false);
      discard();
    },
    onSave: () => {
      setIsOpen(false);
      save();
    },
  };

  return { requestClose, dialogProps };
}
