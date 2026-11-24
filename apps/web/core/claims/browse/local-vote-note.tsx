'use client';

import type * as React from 'react';

import cx from 'classnames';

import { openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

/**
 * A line under a vote pill, with an optional inline action: the one shape every note about the
 * reader's own vote takes, so they sit and read the same wherever a pill has one.
 */
export function VoteNote({
  children,
  action,
  announce = false,
  tone = 'light',
}: {
  children: React.ReactNode;
  action?: {
    label: string;
    onPress: () => void;
    analyticsLabel: string;
    analyticsIntent: string;
    /**
     * The vote it acts on is still on its way to the bundler, when the pills ignore presses. The action
     * says so the way the pills do — `aria-disabled` and a wait cursor — rather than looking live.
     */
    pending?: boolean;
  };
  /** Read out when it appears: for a note about something the page just did, not one already there. */
  announce?: boolean;
  /** `'dark'` draws it for a dark surface: the debates app's dark full screen (GEO-3833). */
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <p
      role={announce ? 'status' : undefined}
      className={cx('mt-1 text-center text-footnote', dark ? 'text-white/70' : 'text-grey-04')}
    >
      {children}
      {action ? (
        <>
          {' '}
          ·{' '}
          <button
            type="button"
            onClick={() => {
              if (!action.pending) action.onPress();
            }}
            aria-disabled={action.pending || undefined}
            data-geo-analytics-label={action.analyticsLabel}
            data-geo-analytics-intent={action.analyticsIntent}
            className={cx(
              'font-medium underline underline-offset-2',
              dark ? 'text-white' : 'text-text',
              action.pending ? 'cursor-progress' : dark ? 'hover:text-white/70' : 'hover:text-grey-04'
            )}
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
export function LocalVoteNote({ tone = 'light' }: { tone?: 'light' | 'dark' } = {}) {
  return (
    <VoteNote
      tone={tone}
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
