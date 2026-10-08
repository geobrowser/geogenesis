import cx from 'classnames';

const LABELS = { debate: 'Debate', claim: 'Claim', comment: 'Comment' } as const;

/**
 * What kind of thing a row is, said in a word.
 *
 * The feed draws three kinds of row that carry the same furniture — a face or a keyframe, a name, a
 * sentence, a vote, a comment count — and mean different things. The differences that exist (a
 * timecode, a position badge) are conditional, so a claim with no assertable moment and a comment
 * from someone holding no position are indistinguishable at a glance.
 *
 * All three go through here. The debate row used to spell its own chip inline with different padding
 * and a different type size, so the one label a reader was meant to compare across rows was the one
 * thing that did not match between them.
 *
 * Neutral on purpose. The coloured chip beside it is a *claim* about a person's position; this one
 * is a label for the row, and two coloured chips in one header would compete for the same meaning.
 */
export function ActivityRowTag({ kind }: { kind: keyof typeof LABELS }) {
  return (
    <span
      className={cx(
        // Same geometry as `ResponsePositionTag`, so the two sit on one line without one riding
        // higher than the other.
        'inline-flex shrink-0 items-center rounded-xs px-1 py-px text-[0.6875rem] font-medium',
        'bg-grey-01 text-grey-04'
      )}
    >
      {LABELS[kind]}
    </span>
  );
}
