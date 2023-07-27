import cx from 'classnames';

import * as React from 'react';

type Props = Omit<React.ComponentPropsWithoutRef<'div'>, 'children'> & {
  type: 'horizontal' | 'vertical';
};

export const Divider = ({ className = '', ...rest }: Props) => {
  return (
    <div
      className={cx(
        rest.type === 'horizontal' && 'justify-stretch',
        rest.type === 'vertical' && 'items-stretch',
        'border-[0.5px] border-grey-02',
        className
      )}
      {...rest}
    />
  );
};
