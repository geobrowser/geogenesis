import cx from 'classnames';
import Link from 'next/link';

import * as React from 'react';

type Props = React.ComponentPropsWithoutRef<'a'> & {
  isActive: boolean;
  href: string;
};

export const TabLink = ({ isActive, href, className = '', ...rest }: Props) => {
  return (
    <Link
      href={href}
      className={cx(
        isActive ? 'text-text' : 'text-grey-04',
        'cursor-pointer text-mediumTitle outline-none hover:text-text',
        className
      )}
      {...rest}
    ></Link>
  );
};
