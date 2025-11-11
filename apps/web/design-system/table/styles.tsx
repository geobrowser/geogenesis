import cx from 'classnames';

import * as React from 'react';

type PageNumberContainerProps = React.ComponentPropsWithoutRef<'div'>;

export const PageNumberContainer = ({ className = '', ...rest }: PageNumberContainerProps) => (
  <div className={cx('flex items-center justify-end gap-3 self-end', className)} {...rest} />
);
