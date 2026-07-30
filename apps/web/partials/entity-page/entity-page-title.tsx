'use client';

import cx from 'classnames';
import Textarea from 'react-textarea-autosize';

import { ZERO_WIDTH_SPACE } from '~/core/constants';

import { Spacer } from '~/design-system/spacer';

/**
 * ≥768 → 44/46, 410–767 → 36/38, ≤409 → 26/30.
 */
const titleTypographyClassName =
  'font-semibold tracking-[-0.5px] text-[44px] leading-[46px] max-[767px]:text-[36px] max-[767px]:leading-[38px] max-[409px]:text-[26px] max-[409px]:leading-[30px]';

type EntityPageTitleProps = {
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function EntityPageTitle({
  value,
  isEditing,
  onChange,
  placeholder = 'Entity name...',
  className,
}: EntityPageTitleProps) {
  if (isEditing) {
    return (
      <div className={cx('text-text', className)}>
        <Textarea
          value={value}
          onChange={event => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          className={cx(
            titleTypographyClassName,
            'm-0 -mb-px w-full resize-none overflow-hidden bg-transparent p-0 text-text placeholder:text-grey-03 focus:outline-hidden'
          )}
        />
        <Spacer height={3.5} />
      </div>
    );
  }

  return (
    <div className={className}>
      <h1 className={cx(titleTypographyClassName, 'line-clamp-3 w-full overflow-hidden text-text')}>
        {value || ZERO_WIDTH_SPACE}
      </h1>
      <Spacer height={12} />
    </div>
  );
}
