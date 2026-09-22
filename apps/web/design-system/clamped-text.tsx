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

const MAX_SUPPORTED_LINES = 6;

function assertSupportedMaxLines(maxLines: number) {
  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > MAX_SUPPORTED_LINES) {
    throw new Error(`ClampedText: maxLines must be a whole number from 1 to ${MAX_SUPPORTED_LINES}.`);
  }
}

type ClampedTextProps = {
  text: string;
  as?: 'p' | 'h1' | 'h2' | 'h3';
  maxLines?: number;
  variant?: TypographyName;
  textClassName?: string;
  /**
   * What the toggle expands, for its accessible name — "description for
   * Engineer", say, giving "Show more description for Engineer".
   *
   * Worth passing wherever more than one of these can be on screen at once. The
   * visible word is always More or Less, so without it a page of clamped rows
   * offers a list of identical buttons and no way to tell which opens what. It
   * has to separate the rows *and* the fields: one row can clamp both its
   * description and its skills.
   */
  label?: string;
  /**
   * Where More and Less sit. `inline` (the default) puts More over the end of the last line, which
   * costs every line a gutter; `below` gives the text its full width and puts the toggle on a line
   * of its own under it.
   */
  togglePlacement?: 'inline' | 'below';
};

// No type of its own: the toggle takes the variant of the text it belongs to, so
// More sits on the last line at the same size and on the same baseline. It used
// to hardcode `text-body` and `leading-none`, which was right only for a caller
// passing `body` and left every other one with an oversized toggle sitting off
// the line.
const TOGGLE_CLASS =
  'm-0 inline cursor-pointer border-0 bg-transparent p-0 text-grey-04 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

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
    temp.style.width = 'auto';
    temp.style.maxWidth = 'none';
    temp.style.minWidth = '0';
  } else {
    temp.style.whiteSpace = getComputedStyle(e).whiteSpace;
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
  label,
  togglePlacement = 'inline',
}: ClampedTextProps) {
  assertSupportedMaxLines(maxLines);

  const [expanded, setExpanded] = React.useState(false);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const [lastLinePx, setLastLinePx] = React.useState<number | null>(null);
  const textRef = React.useRef<HTMLElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => setExpanded(false), [text]);

  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;

    const measure = () => {
      setIsOverflowing(isEllipsisActive(el, maxLines));
      setLastLinePx(readLineHeightPx(el));
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const ro = new ResizeObserver(measure);
    ro.observe(wrapper, { box: 'border-box' });
    return () => ro.disconnect();
  }, [text, maxLines, expanded, variant]);

  const showToggle = isOverflowing;
  const clamp = !expanded;
  const isBelow = togglePlacement === 'below';
  const reserveToggle = showToggle && clamp && !isBelow;
  const typeClassName = textStyles[variant];

  if (isBelow) {
    return (
      <div ref={wrapperRef} className="box-border w-full min-w-0">
        <Tag
          ref={textRef as React.Ref<never>}
          className={cx(typeClassName, textClassName, clamp && LINE_CLAMP_CLASS[maxLines])}
        >
          {text}
        </Tag>
        {showToggle && (
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            aria-expanded={expanded}
            aria-label={label ? `Show ${expanded ? 'less' : 'more'} ${label}` : undefined}
            className={cx(typeClassName, TOGGLE_CLASS, 'mt-1 block')}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cx('relative box-border w-full min-w-0', reserveToggle && TOGGLE_GUTTER_CLASS)}>
      <Tag
        ref={textRef as React.Ref<never>}
        className={cx(typeClassName, textClassName, clamp && LINE_CLAMP_CLASS[maxLines])}
      >
        {text}
        {showToggle && expanded && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-expanded={true}
              aria-label={label ? `Show less ${label}` : undefined}
              className={cx(typeClassName, TOGGLE_CLASS)}
            >
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
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-label={label ? `Show more ${label}` : undefined}
            className={cx(typeClassName, TOGGLE_CLASS)}
          >
            More
          </button>
        </span>
      )}
    </div>
  );
}
