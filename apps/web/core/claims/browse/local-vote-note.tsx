'use client';

import { openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

/** The pill's tooltip while its vote is only on this device (GEO-3214). */
export const LOCAL_VOTE_TITLE = 'Only on this device. Save it to count.';

/**
 * Under a pill whose vote is only on this device: it doesn't count yet, and "Save" is the way back
 * to the save sheet after closing it.
 */
export function LocalVoteNote() {
  return (
    <p className="mt-1 text-center text-footnote text-grey-04">
      Not counted yet ·{' '}
      <button
        type="button"
        onClick={() => openSaveVotesPrompt('inline_save')}
        data-geo-analytics-label="save_votes_inline"
        data-geo-analytics-intent="signup"
        className="font-medium text-text underline underline-offset-2 hover:text-grey-04"
      >
        Save
      </button>
    </p>
  );
}
