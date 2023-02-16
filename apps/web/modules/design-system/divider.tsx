import * as React from 'react';
import cx from 'classnames';

type Props = Omit<React.ComponentPropsWithoutRef<'div'>, 'children'> & {
  type: 'horizontal' | 'vertical';
};

export const Divider = ({ className = '', ...rest }: Props) => {
  return (
    <div
      className={cx(
        rest.type === 'horizontal' && 'jsutify-stretch',
        rest.type === 'vertical' && 'items-stretch',
        'border-[0.5px] border-grey-02',
        className
      )}
      {...rest}
    />
  );
};
