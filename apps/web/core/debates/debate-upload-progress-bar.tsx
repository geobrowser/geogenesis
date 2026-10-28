import cx from 'classnames';

/**
 * The upload's 40px bar: a fill when the share is known, a pulse while it is not. `dark` is the
 * banner's, on its near-black strip; `light` is the claim picker's publishing card (GEO-3301).
 */
export function DebateUploadProgressBar({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number | null;
  tone: 'dark' | 'light';
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={cx('h-1 w-10 shrink-0 overflow-hidden rounded-full', tone === 'dark' ? 'bg-grey-04' : 'bg-grey-02')}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width]',
          tone === 'dark' ? 'bg-white' : 'bg-text',
          percent === null && 'w-1/3 animate-pulse'
        )}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}
