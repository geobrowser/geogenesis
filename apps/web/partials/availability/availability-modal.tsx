'use client';

import * as React from 'react';

import { type AvailabilityBlock, localTimezone } from '~/core/availability/blocks';
import type { BusyInterval } from '~/core/availability/calendar-busy';
import { scheduleInCurrentZone, scheduleTimezoneNote } from '~/core/availability/schedule-zone';
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
  /** Replaces the failure copy, e.g. while geo-chat is still setting up the account. */
  errorMessage?: string | null;
  onRetry?: () => void;
  onSave: (blocks: AvailabilityBlock[]) => void;
  /** Focus goes back here on close, since the opener is off in the panel behind the overlay. */
  openerRef?: React.RefObject<HTMLElement | null>;
  /** Beside the close button — the "copy my availability link" control, where the caller has one. */
  headerAction?: React.ReactNode;
  /**
   * Between the title and the grid: the viewer's connected calendar, in their own editor only.
   * `saveDraft` saves the grid as it stands without closing, for a calendar connect that leaves the
   * page (GEO-3595); absent where the caller gave no `onSaveDraft`.
   */
  calendarSection?: (state: { unsavedChanges: boolean; saveDraft?: () => Promise<unknown> }) => React.ReactNode;
  /** Saves `blocks` and settles with the outcome, leaving the dialog open. */
  onSaveDraft?: (blocks: AvailabilityBlock[]) => Promise<unknown>;
  /** The viewer's own calendar busy time, shaded on the grid. */
  busyIntervals?: BusyInterval[];
  /** The zone `blocks` were saved in. Drawn converted into the browser's zone where they differ. */
  savedTimezone?: string;
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
  errorMessage,
  onRetry,
  onSave,
  openerRef,
  headerAction,
  calendarSection,
  onSaveDraft,
  busyIntervals,
  savedTimezone,
}: Props) {
  // Read per render rather than once: a laptop that crosses a border keeps the dialog's zone honest.
  const currentTimezone = localTimezone();
  // Save stamps the browser's zone, so a schedule saved elsewhere is drawn in it too — the same
  // instants, so saving changes nothing the person did not change (GEO-3582). Memoised: the grid
  // seeds from it once, and the unsaved-changes check below compares by reference.
  const local = React.useMemo(
    () => (blocks ? scheduleInCurrentZone(blocks, savedTimezone, currentTimezone) : undefined),
    [blocks, savedTimezone, currentTimezone]
  );
  const shown = local?.blocks;
  const converted = local?.converted ?? false;
  const [draft, setDraft] = React.useState<AvailabilityBlock[]>(shown ?? []);
  // The draft a calendar connect last saved without closing. Saved is not unsaved: without this a
  // connect that failed after its save would save the same week again on every retry.
  const [savedDraft, setSavedDraft] = React.useState<AvailabilityBlock[] | null>(null);
  // Read after the save answers, so an edit made while it ran is not left behind when the page leaves.
  const latestDraft = React.useRef(draft);
  latestDraft.current = draft;
  const saveDraft = onSaveDraft
    ? async () => {
        let saving: AvailabilityBlock[];
        do {
          saving = latestDraft.current;
          await onSaveDraft(saving);
        } while (latestDraft.current !== saving);
        setSavedDraft(saving);
      }
    : undefined;
  const timezoneNote = scheduleTimezoneNote({ savedTimezone, currentTimezone, converted });

  return (
    <ScheduleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set your debate schedule"
      description={timezoneNote}
      headerAction={headerAction}
      closeButtonProps={debateActionAnalyticsAttributes('schedule-editor', 'Close', 'close_debate_schedule')}
      openerRef={openerRef}
    >
      {/* The grid echoes `shown` back on mount, so any other draft is an edit. */}
      {calendarSection?.({
        unsavedChanges: shown !== undefined && draft !== shown && draft !== savedDraft,
        saveDraft,
      })}
      {/* Remounted per opening so a discarded draft cannot survive into the next one. The
          footer buttons ride in the calendar's own action row, beside its Clear all.

          Mounted only once `blocks` is known, because the grid seeds from it once. */}
      {open && shown === undefined ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <Text as="p" variant="metadata" className="text-grey-04">
            {error ? (errorMessage ?? 'We couldn’t load your schedule.') : 'Loading your schedule…'}
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
      {open && shown !== undefined && (
        <AvailabilityCalendar
          // The grid reads `initialBlocks` once. If the browser's zone changes while it is open, a
          // fresh grid in the new zone beats Save stamping the old zone's hours with the new one.
          key={currentTimezone}
          className="min-h-0 flex-1"
          initialBlocks={shown}
          onChange={setDraft}
          busyIntervals={busyIntervals}
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
