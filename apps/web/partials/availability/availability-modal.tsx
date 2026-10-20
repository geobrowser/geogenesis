'use client';

import * as React from 'react';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';

import { Text } from '~/design-system/text';

import { AvailabilityCalendar } from './availability-calendar';
import { ScheduleDialog } from './schedule-dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The schedule, or `undefined` until the read answers: not an empty week, which would be saved as one. */
  blocks?: AvailabilityBlock[];
  /** The read failed, so `blocks` will stay `undefined` and there is nothing left to wait for. */
  error?: boolean;
  onRetry?: () => void;
  onSave: (blocks: AvailabilityBlock[]) => void;
  /** Focus goes back here on close, since the opener is off in the panel behind the overlay. */
  openerRef?: React.RefObject<HTMLElement | null>;
  /** Beside the close button — the "copy my availability link" control, where the caller has one. */
  headerAction?: React.ReactNode;
};

/**
 * "Set your debate schedule": the availability week grid (GEO-2936) in a dialog, opened from the
 * debates panel.
 *
 * Wider than the shared `Dialog` allows — seven day columns and a 7am–10pm grid is the smallest
 * this can honestly be — so it sits in the scheduling dialogs' own frame, `ScheduleDialog`.
 *
 * Edits are held until Save. Closing by any other route (Cancel, ×, Escape, the overlay) discards
 * them, because a schedule half-dragged is not one a person meant to publish.
 */
export function AvailabilityModal({
  open,
  onOpenChange,
  blocks,
  error,
  onRetry,
  onSave,
  openerRef,
  headerAction,
}: Props) {
  const [draft, setDraft] = React.useState<AvailabilityBlock[]>(blocks ?? []);

  return (
    <ScheduleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set your debate schedule"
      headerAction={headerAction}
      closeButtonProps={debateActionAnalyticsAttributes('schedule-editor', 'Close', 'close_debate_schedule')}
      openerRef={openerRef}
    >
      {/* Remounted per opening so a discarded draft cannot survive into the next one. The
          footer buttons ride in the calendar's own action row, beside its Clear all.

          Mounted only once `blocks` is known, because the grid seeds from it once. */}
      {open && blocks === undefined ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <Text as="p" variant="metadata" className="text-grey-04">
            {error ? 'We couldn’t load your schedule.' : 'Loading your schedule…'}
          </Text>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text"
            >
              Cancel
            </button>
            {error && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-[#151515] px-4 py-1 text-metadata text-white transition-opacity hover:opacity-90"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {open && blocks !== undefined && (
        <AvailabilityCalendar
          className="min-h-0 flex-1"
          initialBlocks={blocks}
          onChange={setDraft}
          actions={
            <>
              <button
                type="button"
                {...debateActionAnalyticsAttributes('schedule-editor', 'Cancel', 'close_debate_schedule')}
                onClick={() => onOpenChange(false)}
                className="rounded-full px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                {...debateActionAnalyticsAttributes('schedule-editor', 'Save', 'save_debate_schedule')}
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
    </ScheduleDialog>
  );
}
