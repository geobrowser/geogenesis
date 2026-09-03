'use client';

import * as React from 'react';

import cx from 'classnames';
import Textarea from 'react-textarea-autosize';

import { ZERO_WIDTH_SPACE } from '~/core/constants';

import { Spacer } from '~/design-system/spacer';

/** Page-title token (`text-mainPage`), including the narrow-viewport steps in `styles.css`. */
const titleTypographyClassName = 'text-mainPage';

type EntityPageTitleProps = {
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Rendered inline directly after the title in browse mode, e.g. a verification badge. */
  accessory?: React.ReactNode;
};

export function EntityPageTitle({
  value,
  isEditing,
  onChange,
  placeholder = 'Entity name...',
  className,
  accessory,
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
      {accessory ? (
        <div className="flex min-w-0 items-center gap-2">
          <h1 className={cx(titleTypographyClassName, 'min-w-0 wrap-break-word text-text')}>
            {value || ZERO_WIDTH_SPACE}
          </h1>
          <span className="mt-[9px] inline-flex shrink-0">{accessory}</span>
        </div>
      ) : (
        <h1 className={cx(titleTypographyClassName, 'w-full text-text')}>{value || ZERO_WIDTH_SPACE}</h1>
      )}
      <Spacer height={12} />
    </div>
  );
}
