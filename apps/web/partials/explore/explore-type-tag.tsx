import cx from 'classnames';

/**
 * The pill that names what an explore card is: "Debate", "Claim", "Ranking".
 *
 * Its own module because both meta rows draw it. The debate row had a pill while every other card
 * drew its type as plain grey text, so a Debate and a Claim beside each other in the feed labelled
 * themselves in two different styles.
 */
export function ExploreTypeTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'rounded-[4px] bg-grey-01 px-1.5 py-0.5 text-[12px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04',
        className
      )}
    >
      {children}
    </span>
  );
}
