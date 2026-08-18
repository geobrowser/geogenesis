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
  temp.classList.remove(TOGGLE_GUTTER_CLASS);

  if (maxLines === 1) {
    temp.style.whiteSpace = 'nowrap';
  } else {
    temp.style.whiteSpace = 'normal';
    temp.style.width = `${display.width}px`;
    temp.style.boxSizing = 'border-box';
  }

  parent.appendChild(temp);

  try {
    const full = temp.getBoundingClientRect();
    if (maxLines === 1) {
      return full.width > display.width + 1;
    }
    return full.height > display.height + 1;
  } finally {
    temp.remove();
  }
}

/**
 * Text clamped to `maxLines` with a More/Less toggle, so nothing is permanently
 * hidden from a reader who can't switch the page into edit mode.
 */
export function ClampedText({ text, as: Tag = 'p', maxLines = 3, textClassName = '' }: ClampedTextProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const textRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => setExpanded(false), [text]);

  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;

    const measure = () => setIsOverflowing(isEllipsisActive(el, maxLines));
    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, maxLines, expanded]);

  const showToggle = isOverflowing;
  const clamp = !expanded;

  const reserveToggle = showToggle && clamp;

  return (
    <div className="relative w-full min-w-0">
      <Tag
        ref={textRef as React.Ref<never>}
        className={cx(textClassName, clamp && LINE_CLAMP_CLASS[maxLines], reserveToggle && TOGGLE_GUTTER_CLASS)}
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
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className={cx('absolute right-0 bottom-0', TOGGLE_CLASS)}
        >
          More
        </button>
      )}
    </div>
  );
}
