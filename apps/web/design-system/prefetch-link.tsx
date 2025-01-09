import Link from 'next/link';

import * as React from 'react';

type Props = React.ComponentPropsWithoutRef<typeof Link>;

export function PrefetchLink({ children, ...rest }: Props) {
  return (
    <Link {...rest} prefetch={false}>
      {children}
    </Link>
  );
}
