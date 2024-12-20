import cx from 'classnames';

import * as React from 'react';

type ToggleProps = {
  checked: boolean;
} & React.ComponentPropsWithoutRef<'div'>;

export const Toggle = ({ checked, className = '', ...rest }: ToggleProps) => {
  switch (checked) {
    case true:
      return (
        <div
          className={cx(
            'relative inline-flex h-[10px] w-[16px] items-center justify-end rounded-full bg-black p-[1px]',
            className
          )}
          {...rest}
        >
          <div className="h-[8px] w-[8px] rounded-full bg-white" />
          <Mousecatch />
        </div>
      );
    case false:
      return (
        <div
          className={cx(
            'relative inline-flex h-[10px] w-[16px] items-center justify-start rounded-full bg-grey-03 p-[1px]',
            className
          )}
          {...rest}
        >
          <div className="h-[8px] w-[8px] rounded-full bg-white" />
          <Mousecatch />
        </div>
      );
  }
};

const Mousecatch = () => <div className="absolute -inset-2" />;
