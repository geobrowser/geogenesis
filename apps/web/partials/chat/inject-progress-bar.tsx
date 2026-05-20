'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';

import { EXPECTED_DURATION_MS, PROGRESS_CEILING, PROGRESS_FLOOR } from '~/core/hooks/use-inject-job';
import type { InjectInlineState } from '~/core/state/chat-store';

import { AssistantSparkle } from '~/design-system/icons/assistant-sparkle';

// Rotation cadence is tuned so a typical ~170s run cycles through most phrases
// without lingering on any one feeling stuck. The last phrase loops if the run
// exceeds the expected duration.
const PHRASES: ReadonlyArray<string> = [
  'Fetching article…',
  'Reading the page…',
  'Gathering sources…',
  'Cross-referencing outlets…',
  'Processing content…',
  'Extracting facts…',
  'Identifying entities…',
  'Mapping topics…',
  'Connecting people…',
  'Linking organizations…',
  'Building the story…',
  'Structuring data…',
  'Almost there…',
  'Finalizing…',
];
const PHRASE_MS = 6_000;

function percentForElapsed(elapsedMs: number): number {
  const linear = (elapsedMs / EXPECTED_DURATION_MS) * PROGRESS_CEILING;
  return Math.min(PROGRESS_CEILING, Math.max(PROGRESS_FLOOR, linear));
}

function phraseIdxForElapsed(elapsedMs: number): number {
  return Math.min(PHRASES.length - 1, Math.max(0, Math.floor(elapsedMs / PHRASE_MS)));
}

// Inline progress UI in place of the synthetic assistant message's text body.
// Framer Motion animates the bar via WAAPI (compositor-thread when possible),
// so a 180s interpolation costs essentially nothing on the main thread. The
// label rotates once every 6s via a single `setInterval`.
export function InjectInlineProgress({ state }: { state: InjectInlineState }) {
  const [phraseIdx, setPhraseIdx] = React.useState(() => {
    if (state.status !== 'pending') return PHRASES.length - 1;
    return phraseIdxForElapsed(Math.max(0, Date.now() - state.startedAt));
  });

  React.useEffect(() => {
    if (state.status !== 'pending') return;
    const id = setInterval(() => {
      setPhraseIdx(prev => Math.min(PHRASES.length - 1, prev + 1));
    }, PHRASE_MS);
    return () => clearInterval(id);
  }, [state.status, state.startedAt]);

  const isPending = state.status === 'pending';
  const isFailed = state.status === 'failed';
  const elapsed = isPending ? Math.max(0, Date.now() - state.startedAt) : 0;
  const startPct = isPending ? percentForElapsed(elapsed) : 0;
  const targetPct = isPending ? PROGRESS_CEILING : 100;
  const remainingSec = isPending ? Math.max(0.25, (EXPECTED_DURATION_MS - elapsed) / 1000) : 0.25;

  return (
    <div className="flex flex-col items-start gap-2">
      <AssistantSparkle />
      <div className="flex w-full flex-col gap-1.5">
        <div className="text-chat text-text" aria-live="polite">
          {PHRASES[phraseIdx]}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-02">
          <motion.div
            className={cx('h-full rounded-full', isFailed ? 'bg-red-500' : 'bg-ctaHover')}
            initial={{ width: `${startPct}%` }}
            animate={{ width: `${targetPct}%` }}
            transition={{ duration: remainingSec, ease: 'easeOut' }}
          />
        </div>
        <p className="text-metadata text-grey-04">Please wait. This can take a while.</p>
      </div>
    </div>
  );
}
