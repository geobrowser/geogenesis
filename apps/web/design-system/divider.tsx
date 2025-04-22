import cx from 'classnames';

import * as React from 'react';

type Props = Omit<React.ComponentPropsWithoutRef<'div'>, 'children'> & {
  type: 'horizontal' | 'vertical';
  style?: 'solid' | 'dashed';
};

export const Divider = ({ className = '', style = 'solid', ...rest }: Props) => {
  return (
    <div
      className={cx(
        rest.type === 'horizontal' && 'justify-stretch',
        rest.type === 'vertical' && 'items-stretch',
        style === 'solid' && 'border-[0.5px] border-divider',
        style === 'dashed' && 'border-t-[1px] border-dashed border-grey-02',
        className
      )}
      {...rest}
    />
  );
};
