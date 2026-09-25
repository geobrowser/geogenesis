import cx from 'classnames';

/**
 * What kind of thing a row is, said in a word.
 *
 * Under a debate the feed draws two rows that carry the same furniture — a face, a name, a sentence,
 * a vote, a comment count — and mean different things. One is a claim the debater made, extracted
 * from the transcript; the other is a comment somebody left afterwards. The differences that exist
 * (a timecode, a position badge) are conditional, so a claim with no assertable moment and a comment
 * from someone holding no position are indistinguishable at a glance.
 *
 * Neutral on purpose. The coloured chip beside it is a *claim* about a person's position; this one
 * is a label for the row, and two coloured chips in one header would compete for the same meaning.
 */
export function ActivityRowTag({ kind }: { kind: 'claim' | 'comment' }) {
  return (
    <span
      className={cx(
        // Same geometry as `ResponsePositionTag`, so the two sit on one line without one riding
        // higher than the other.
        'inline-flex shrink-0 items-center rounded-xs px-1 py-px text-[0.6875rem] font-medium',
        'bg-grey-01 text-grey-04'
      )}
    >
      {kind === 'claim' ? 'Claim' : 'Comment'}
    </span>
  );
}
