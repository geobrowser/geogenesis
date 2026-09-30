'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';

import { useBackdropDismiss } from './use-backdrop-dismiss';

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
  const reasonId = React.useId();
  const backdropDismiss = useBackdropDismiss(() => onOpenChange(false));
  const reason = canSave ? null : saveBlockedReason;

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-102 bg-text/20" />
        <Content
          // Focus starts on Keep editing, so a reason that is not wired up here is
          // never read out: the title is announced and the explanation skipped.
          // With nothing to explain, the title is the whole message.
          aria-describedby={reason ? reasonId : undefined}
          // Radix focuses the first button by default, which is Discard edits —
          // Enter straight after opening would throw the draft away. Start on the
          // one choice that loses nothing.
          onOpenAutoFocus={event => {
            event.preventDefault();
            keepEditingRef.current?.focus();
          }}
          // A press on the backdrop means "keep editing".
          {...backdropDismiss}
          className="fixed inset-0 z-103 flex items-center justify-center px-4 focus:outline-hidden"
        >
          {/* Laid out like the debate request prompt: centred, a pair of pills
              splitting the width, and the quiet way out as text beneath them. */}
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-grey-02 bg-white px-5 pt-5 pb-3 text-center shadow-dropdown">
            <Title className="text-smallTitle text-text">Exiting without saving will discard edits</Title>
            {reason && (
              <p id={reasonId} className="text-metadata text-grey-04">
                {reason}
              </p>
            )}
            {/* Keep editing sits close under the pills it is the alternative to. */}
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full grid-cols-2 gap-2">
                <button type="button" onClick={onDiscard} className={hubPillClassName('secondary', 'w-full')}>
                  Discard edits
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!canSave}
                  className={hubPillClassName('primary', 'w-full')}
                >
                  Save changes
                </button>
              </div>
              <button
                ref={keepEditingRef}
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-0.5 text-metadata text-grey-04 hover:text-text"
              >
                Keep editing
              </button>
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
