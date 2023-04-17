import * as React from 'react';
import cx from 'classnames';

type Props = Omit<React.ComponentPropsWithoutRef<'div'>, 'children'> & {
  type: 'horizontal' | 'vertical';
};

export const Divider = ({ className = '', ...rest }: Props) => {
  return (
    <div
      className={cx(
        rest.type === 'horizontal' && 'w-full',
        rest.type === 'vertical' && 'h-full',
        'border-2 border-divider',
        className
      )}
      {...rest}
    />
  );
};
