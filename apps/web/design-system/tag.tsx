import cx from 'classnames';

import * as React from 'react';

type Props = React.ComponentPropsWithoutRef<'div'>;

export const Tag = ({ className = '', ...rest }: Props) => {
  return <div className={cx('inline-block rounded-sm bg-grey-02 px-1 text-tag no-underline', className)} {...rest} />;
};
