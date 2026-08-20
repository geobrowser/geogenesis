'use client';

import * as React from 'react';

import cx from 'classnames';

import { type TypographyName, textStyles } from '~/design-system/theme/typography';

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
  variant?: TypographyName;
  textClassName?: string;
};

const TOGGLE_CLASS =
  'm-0 inline cursor-pointer border-0 bg-transparent p-0 text-body leading-none text-grey-04 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

const TOGGLE_GUTTER_CLASS = 'pr-11';

function isEllipsisActive(e: HTMLElement, maxLines: number): boolean {
  const parent = e.parentElement;
  const display = e.getBoundingClientRect();

  if (!parent || (display.width === 0 && display.height === 0)) {
    return e.scrollHeight > e.clientHeight + 1;
  }

  const temp = e.cloneNode(true) as HTMLElement;

  temp.style.position = 'fixed';
  temp.style.overflow = 'visible';
  temp.style.visibility = 'hidden';
  temp.style.pointerEvents = 'none';
  temp.style.height = 'auto';
  temp.style.maxHeight = 'none';
  temp.style.webkitLineClamp = 'none';
  temp.style.setProperty('line-clamp', 'none');
  temp.style.display = 'block';

  for (const clampClass of Object.values(LINE_CLAMP_CLASS)) {
    temp.classList.remove(clampClass);
  }

  if (maxLines === 1) {
    temp.style.whiteSpace = 'nowrap';
  } else {
    temp.style.whiteSpace = 'normal';
    temp.style.width = `${e.clientWidth}px`;
    temp.style.boxSizing = 'border-box';
  }

  parent.appendChild(temp);

  try {
    const full = temp.getBoundingClientRect();
    if (maxLines === 1) {
      return full.width > e.clientWidth + 1;
    }
    return full.height > display.height + 1;
  } finally {
    temp.remove();
  }
}

function readLineHeightPx(el: HTMLElement): number | null {
  const px = parseFloat(getComputedStyle(el).lineHeight);
  return Number.isFinite(px) ? px : null;
}

/**
 * Text clamped to `maxLines` with a More/Less toggle, so nothing is permanently
 * hidden from a reader who can't switch the page into edit mode.
 */
export function ClampedText({
  text,
  as: Tag = 'p',
  maxLines = 3,
  variant = 'body',
  textClassName = '',
}: ClampedTextProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const [lastLinePx, setLastLinePx] = React.useState<number | null>(null);
  const textRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => setExpanded(false), [text]);

  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;

    const measure = () => {
      setIsOverflowing(isEllipsisActive(el, maxLines));
      setLastLinePx(readLineHeightPx(el));
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, maxLines, expanded, variant]);

  const showToggle = isOverflowing;
  const clamp = !expanded;
  const reserveToggle = showToggle && clamp;
  const typeClassName = textStyles[variant];

  return (
    <div className={cx('relative w-full min-w-0', reserveToggle && TOGGLE_GUTTER_CLASS)}>
      <Tag
        ref={textRef as React.Ref<never>}
        className={cx(typeClassName, textClassName, clamp && LINE_CLAMP_CLASS[maxLines])}
      >
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
        <span
          className={cx('absolute right-0 bottom-0 text-right', typeClassName)}
          style={
            lastLinePx != null
              ? { height: lastLinePx, lineHeight: `${lastLinePx}px` }
              : { height: '1lh', lineHeight: '1lh' }
          }
        >
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} className={TOGGLE_CLASS}>
            More
          </button>
        </span>
      )}
    </div>
  );
}
