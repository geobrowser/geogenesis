'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { AvailabilityCalendar } from './availability-calendar';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The schedule as it stands. The modal edits a copy and reports it only on save. */
  blocks?: AvailabilityBlock[];
  onSave: (blocks: AvailabilityBlock[]) => void;
  /** Focus goes back here on close, since the opener is off in the panel behind the overlay. */
  openerRef?: React.RefObject<HTMLElement | null>;
};

/**
 * "Set your debate schedule": the availability week grid (GEO-2936) in a dialog, opened from the
 * debates panel.
 *
 * Wider than the shared `Dialog` allows — seven day columns and a 7am–10pm grid is the smallest
 * this can honestly be — so it drives the Radix primitives directly, as the debate share sheet does.
 *
 * Edits are held until Save. Closing by any other route (Cancel, ×, Escape, the overlay) discards
 * them, because a schedule half-dragged is not one a person meant to publish.
 */
export function AvailabilityModal({ open, onOpenChange, blocks = [], onSave, openerRef }: Props) {
  const [draft, setDraft] = React.useState(blocks);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-[1000] bg-text/20" />
        <Content
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            if (!openerRef?.current) return;
            event.preventDefault();
            openerRef.current.focus();
          }}
          className="fixed top-1/2 left-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2 focus:outline-hidden"
        >
          <div className="flex max-h-[calc(100dvh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <Title asChild>
                <Text as="h2" variant="smallTitle">
                  Set your debate schedule
                </Text>
              </Title>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="grid size-4 shrink-0 place-items-center text-[#151515] transition-opacity hover:opacity-70"
              >
                <Close />
              </button>
            </div>

            {/* Remounted per opening so a discarded draft cannot survive into the next one. The
                footer buttons ride in the calendar's own action row, beside its Clear all. */}
            {open && (
              <AvailabilityCalendar
                initialBlocks={blocks}
                onChange={setDraft}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="rounded-full px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSave(draft);
                        onOpenChange(false);
                      }}
                      className="rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90"
                    >
                      Save schedule
                    </button>
                  </>
                }
              />
            )}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
