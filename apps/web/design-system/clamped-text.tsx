'use client';

import * as React from 'react';

import cx from 'classnames';

const LINE_CLAMP_CLASS: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

type ClampedTextProps = {
  text: string;
  as?: 'p' | 'h1' | 'h2' | 'h3';
  maxLines?: number;
  textClassName?: string;
};

const TOGGLE_CLASS =
  'cursor-pointer text-body text-grey-04 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

const TOGGLE_GUTTER_CLASS = 'pr-11';

/**
 * Text clamped to `maxLines` with a More/Less toggle, so nothing is permanently
 * hidden from a reader who can't switch the page into edit mode.
 */
export function ClampedText({ text, as: Tag = 'p', maxLines = 3, textClassName = '' }: ClampedTextProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const measureRef = React.useRef<HTMLElement>(null);

  React.useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '0');
      const fullHeight = el.scrollHeight;
      if (lineHeight > 0) {
        setIsOverflowing(fullHeight > lineHeight * maxLines + 1);
      }
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, maxLines]);

  const showToggle = isOverflowing;
  const clamp = !expanded;

  const reserveToggle = showToggle && clamp;

  return (
    <div className="relative">
      <Tag className={cx(textClassName, clamp && LINE_CLAMP_CLASS[maxLines], reserveToggle && TOGGLE_GUTTER_CLASS)}>
        {text}
        {showToggle && expanded && (
          <>
            {' '}
            <button type="button" onClick={() => setExpanded(false)} aria-expanded={true} className={TOGGLE_CLASS}>
              Less
            </button>
          </>
        )}
      </Tag>
      {showToggle && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className={cx('absolute right-0 bottom-0', TOGGLE_CLASS)}
        >
          More
        </button>
      )}
      <Tag
        ref={measureRef as React.Ref<never>}
        aria-hidden="true"
        className={cx('pointer-events-none invisible absolute inset-x-0 top-0', textClassName)}
      >
        {text}
      </Tag>
    </div>
  );
}
