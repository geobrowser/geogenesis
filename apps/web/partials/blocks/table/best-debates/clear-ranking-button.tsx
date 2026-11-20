'use client';

import * as React from 'react';

import { useSetToast } from '~/core/hooks/use-toast';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';

import { RankingFlowDialog } from './ranking-flow-dialog';
import { RankingUndoToast } from './ranking-undo-toast';

/**
 * Your ranking's Clear (Preston, 12 Nov): after a confirm, empties the draft. Nothing publishes until
 * Publish, which then sends an edit that deletes every vote; the toast's Undo puts the list back.
 */
export function ClearRankingButton({
  orderedIds,
  setDraft,
}: {
  orderedIds: readonly string[];
  setDraft: (ids: string[]) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const setToast = useSetToast();
  const count = orderedIds.length;
  if (count === 0) return null;

  const clear = () => {
    const previous = [...orderedIds];
    setConfirming(false);
    setDraft([]);
    setToast(
      <RankingUndoToast
        copy="Cleared. Publish to make it final."
        onUndo={() => {
          setToast(null);
          setDraft(previous);
        }}
      />
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-8 rounded-full px-3 text-button text-grey-04 transition-colors hover:bg-grey-01 hover:text-text md:h-11"
      >
        Clear
      </button>
      {confirming ? (
        <RankingFlowDialog
          open
          phoneSheet
          onClose={() => setConfirming(false)}
          title={count === 1 ? 'Clear 1 debate from your ranking?' : `Clear all ${count} debates from your ranking?`}
          subtitle="Nothing changes until you publish."
          footer={
            <>
              <button
                type="button"
                className={`${DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME} !w-auto md:!w-full`}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button type="button" className={`${DIALOG_ACTION_BUTTON_CLASS_NAME} !w-auto md:!w-full`} onClick={clear}>
                Clear
              </button>
            </>
          }
        >
          {null}
        </RankingFlowDialog>
      ) : null}
    </>
  );
}
