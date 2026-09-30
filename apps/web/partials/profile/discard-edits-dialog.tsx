'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import { Button } from '~/design-system/button';

type Props = {
  open: boolean;
  /** Closing without choosing — Escape or the backdrop — goes back to editing. */
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSave: () => void;
  /** False when the edit cannot be published as it stands, e.g. a blank name. */
  canSave: boolean;
};

/**
 * Asked before a profile modal closes on edits that were never saved.
 *
 * Rendered inside the modal it guards, so Radix treats it as a nested layer:
 * Escape and outside clicks dismiss this one only, and the modal underneath
 * stays open with the draft intact. Stacked one step above the modal's own
 * `z-100`/`z-101`.
 */
export function DiscardEditsDialog({ open, onOpenChange, onDiscard, onSave, canSave }: Props) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-102 bg-text/20" />
        <Content
          // The title is the whole message; there is nothing further to describe.
          aria-describedby={undefined}
          // This container covers the overlay, so Radix never sees an outside
          // click — a press on the backdrop lands here and means "keep editing".
          onClick={event => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          className="fixed inset-0 z-103 flex items-center justify-center px-4 focus:outline-hidden"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-grey-02 bg-white p-5 shadow-dropdown">
            <Title className="text-smallTitle text-text">Exiting without saving will discard edits</Title>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onDiscard}>
                Discard edits
              </Button>
              <Button type="button" onClick={onSave} disabled={!canSave}>
                Save changes
              </Button>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
