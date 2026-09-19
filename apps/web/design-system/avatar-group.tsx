import * as React from 'react';

import cx from 'classnames';

interface Props {
  children: React.ReactNode;
  variant?: 'overlap' | 'spaced';
}

type AvatarGroupItemProps = {
  children: React.ReactNode;
  size?: 12 | 20;
};

type AvatarGroupOverflowProps = Omit<React.ComponentPropsWithoutRef<'li'>, 'children'> & {
  count: number;
  size?: 12 | 20;
};

export function AvatarGroup({ children, variant = 'overlap' }: Props) {
  const childCount = React.Children.count(children);
  const useSpacedLayout = variant === 'spaced' && childCount > 1;

  return (
    <ul
      className={cx(
        'avatar-group m-0 flex list-none items-center p-0',
        variant === 'overlap' && '-space-x-2',
        useSpacedLayout && 'spaced'
      )}
    >
      {children}
    </ul>
  );
}

function AvatarGroupItem({ children, size = 12 }: AvatarGroupItemProps) {
  return (
    <li
      className={cx(
        // The ring's job is to separate a face from the one it overlaps, so it has to be the colour
        // *behind* the stack — white everywhere until a stack landed on the claim card's grey
        // footer, where a white ring reads as a halo. Themed through a variable rather than a prop
        // because this sits five levels below the surface that knows the answer, and every level
        // between is a ranking component with no opinion about it. Unset resolves to white, so
        // every existing caller is untouched.
        // `bg-white` under the image, not only the ring around it: an avatar
        // with a transparent background — a logo saved as a PNG with no matte —
        // otherwise shows whatever the stack is sitting on through its own face.
        'relative box-content list-none overflow-hidden rounded-full border-2 border-[color:var(--avatar-group-ring,var(--color-white))] bg-white',
        size === 20 ? 'h-5 w-5' : 'h-3 w-3'
      )}
    >
      {children}
    </li>
  );
}

/** The shared `+N` tail for an overlapping avatar stack. */
function AvatarGroupOverflow({ count, size = 12, className, ...props }: AvatarGroupOverflowProps) {
  if (count <= 0) return null;

  const isCompact = size === 12;

  return (
    <li
      {...props}
      className={cx(
        'relative box-content flex shrink-0 list-none items-center justify-center rounded-full border-2 border-[color:var(--avatar-group-ring,var(--color-white))] bg-grey-02 text-grey-04 tabular-nums',
        isCompact ? 'h-3 px-1 text-[9px]' : 'h-5 px-1.5 text-[11px]',
        className
      )}
    >
      <span className={cx('block', isCompact ? 'h-3 leading-[12px]' : 'h-5 leading-[20px]')}>+{count}</span>
    </li>
  );
}

AvatarGroup.Item = AvatarGroupItem;
AvatarGroup.Overflow = AvatarGroupOverflow;
