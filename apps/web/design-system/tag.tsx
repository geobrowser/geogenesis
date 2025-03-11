import cx from 'classnames';

import * as React from 'react';

type Props = React.ComponentPropsWithoutRef<'div'>;

export const Tag = ({ className = '', ...rest }: Props) => {
  return (
    <div
      className={cx(
        'inline-block rounded-sm bg-grey-02 px-1 pb-px text-[0.875rem] leading-none no-underline',
        className
      )}
      {...rest}
    />
  );
};
