import cx from 'classnames';

/** Grey placeholders in the app's skeleton colour, dimmed for the dark stage. No text. */
const SHAPE = 'bg-grey-02/25';
const BAR = 'rounded-full bg-grey-02/45';

/**
 * A loading node: a round avatar over a label bar for entities, a card with two bars for claims.
 * `pulse` is a class, so the server markup can use a motion-safe variant.
 */
export function SkeletonNode({
  kind,
  isCentre,
  phone,
  pulse,
}: {
  kind: 'ent' | 'claim';
  isCentre: boolean;
  phone: boolean;
  pulse: string | false;
}) {
  if (isCentre)
    return (
      <span className={cx('block rounded-full', SHAPE, pulse, phone ? 'h-[40px] w-[150px]' : 'h-[46px] w-[190px]')} />
    );
  // A phone pin's shape (GEO-3864): a dot the map scales with depth over a name bar at a fixed size.
  if (phone)
    return (
      <span className={cx('flex flex-col items-center gap-1', pulse)}>
        <span data-anchor className={cx('block h-[18px] w-[18px] [scale:var(--pin-scale,1)] rounded-full', SHAPE)} />
        <span className={cx('block h-[18px] w-[76px] rounded-md', SHAPE)} />
      </span>
    );
  if (kind === 'claim')
    return (
      <span className={cx('flex flex-col gap-2 rounded-xl p-3', SHAPE, pulse, phone ? 'w-[140px]' : 'w-[176px]')}>
        <span className={cx('block h-[8px] w-full', BAR)} />
        <span className={cx('block h-[8px] w-2/3', BAR)} />
        <span className={cx('mt-1 block h-[4px] w-full', BAR)} />
      </span>
    );
  return (
    <span className={cx('flex flex-col items-center gap-[6px]', pulse)}>
      <span className={cx('block h-[30px] w-[30px] rounded-full', SHAPE)} />
      <span className={cx('block h-[18px] rounded-md', SHAPE, phone ? 'w-[70px]' : 'w-[88px]')} />
    </span>
  );
}
