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
        'relative box-content list-none overflow-hidden rounded-full border-2 border-white',
        size === 20 ? 'h-5 w-5' : 'h-3 w-3'
      )}
    >
      {children}
    </li>
  );
}

AvatarGroup.Item = AvatarGroupItem;
