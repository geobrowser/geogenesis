import cx from 'classnames';

import type { ComponentPropsWithoutRef } from 'react';

import { Dots } from '~/design-system/dots';

type PendingProps = {
  isPending?: boolean;
  position?: 'start' | 'center' | 'end';
} & ComponentPropsWithoutRef<'div'>;

export const Pending = ({
  isPending = false,
  position = 'center',
  className = '',
  children,
  ...rest
}: PendingProps) => {
  return (
    <div className="relative">
      <div className={cx(isPending && 'invisible', className)} {...rest}>
        {children}
      </div>
      {isPending && (
        <div className={cx('absolute inset-0 flex h-full w-full', pendingPositionClassName[position])}>
          <Dots />
        </div>
      )}
    </div>
  );
};

const pendingPositionClassName = {
  start: 'justify-start items-center',
  center: 'justify-center items-center',
  end: 'justify-end items-center',
};
