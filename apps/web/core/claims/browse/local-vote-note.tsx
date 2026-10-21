'use client';

import type * as React from 'react';

import { openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

/**
 * A line under a vote pill, with an optional inline action: the one shape every note about the
 * reader's own vote takes, so they sit and read the same wherever a pill has one.
 */
export function VoteNote({
  children,
  action,
  announce = false,
}: {
  children: React.ReactNode;
  action?: { label: string; onPress: () => void; analyticsLabel: string; analyticsIntent: string };
  /** Read out when it appears: for a note about something the page just did, not one already there. */
  announce?: boolean;
}) {
  return (
    <p role={announce ? 'status' : undefined} className="mt-1 text-center text-footnote text-grey-04">
      {children}
      {action ? (
        <>
          {' '}
          ·{' '}
          <button
            type="button"
            onClick={action.onPress}
            data-geo-analytics-label={action.analyticsLabel}
            data-geo-analytics-intent={action.analyticsIntent}
            className="font-medium text-text underline underline-offset-2 hover:text-grey-04"
          >
            {action.label}
          </button>
        </>
      ) : null}
    </p>
  );
}

/**
 * Under a pill whose vote is only on this device: it doesn't count yet, and "Save" is the way back
 * to the save sheet after closing it.
 */
export function LocalVoteNote() {
  return (
    <VoteNote
      action={{
        label: 'Save',
        onPress: () => openSaveVotesPrompt('inline_save'),
        analyticsLabel: 'save_votes_inline',
        analyticsIntent: 'signup',
      }}
    >
      Not counted yet
    </VoteNote>
  );
}
