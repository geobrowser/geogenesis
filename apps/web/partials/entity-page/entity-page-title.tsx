'use client';

import * as React from 'react';

import cx from 'classnames';
import Textarea from 'react-textarea-autosize';

import { ZERO_WIDTH_SPACE } from '~/core/constants';

import { Spacer } from '~/design-system/spacer';

/** Entity-title token (`text-entityTitle`), including the narrow-viewport steps in `styles.css`. */
const titleTypographyClassName = 'text-entityTitle';

type EntityPageTitleProps = {
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Rendered inline directly after the title in browse mode, e.g. a verification badge. */
  accessory?: React.ReactNode;
};

/**
 * The shared page title for an entity and a space.
 *
 * The three-line clamp is intentionally gone — the designer asked for it (GEO-2460 issue thread,
 * 2026-07-31). It compensated for a title fixed at 52px (`mainPage`) at every width; the token now
 * steps down to 26px on a phone, which is what the clamp was working around.
 *
 * The two headers it replaced clamped differently, and only one of them offered a way out: the
 * space header used `Truncate`, which cuts with no reveal, while the entity header used
 * `ClampedText`, which renders a More/Less toggle. So this is a straight win for space titles and a
 * trade for entity titles — a pathological name (a pasted paragraph) now runs full length instead
 * of collapsing behind More. Accepted deliberately; revisit here if it shows up in practice.
 */
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
          {/* Centred by the row, with no pixel nudge. Master offset this by `mt-[9px]`, tuned
              against a title fixed at 52px; the token now steps 44/36/26, and a fixed offset
              reads as the badge sagging below a 26px title. The badge is a fixed-height pill
              either way, so it cannot scale with the text. */}
          <span className="inline-flex shrink-0">{accessory}</span>
        </div>
      ) : (
        <h1 className={cx(titleTypographyClassName, 'w-full wrap-break-word text-text')}>{value || ZERO_WIDTH_SPACE}</h1>
      )}
      <Spacer height={12} />
    </div>
  );
}
