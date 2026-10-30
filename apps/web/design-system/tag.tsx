import * as React from 'react';

import cx from 'classnames';

type Props = React.ComponentPropsWithoutRef<'div'>;

/** Shared with tags that need their own element or ref, such as visibility-tracked status labels. */
export const tagStyles = (className = '') =>
  cx(
    'inline-block rounded-sm px-1 pb-px text-[0.875rem] leading-none no-underline',
    !className.includes('bg-') && 'bg-grey-02',
    className
  );

export const Tag = ({ className = '', ...rest }: Props) => {
  return <div className={tagStyles(className)} {...rest} />;
};
