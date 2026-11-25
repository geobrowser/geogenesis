'use client';

import * as React from 'react';

import cx from 'classnames';

/** Fades the clamped text out under the inline "… Show more" so the cut never lands mid-letter. */
const SHOW_MORE_FADE = { background: 'linear-gradient(to right, transparent, white 28px)' };

/**
 * A page description that collapses to four lines when it runs longer (GEO-3837), with "Show more" at
 * the end of the last line and "Show less" right after the full text.
 *
 * Measured rather than counted: whether four lines overflow depends on the container width, so the
 * toggle only shows when the clamped text actually hides something. The description takes the page's
 * full width.
 */
export function ExpandableLede({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const textRef = React.useRef<HTMLParagraphElement | null>(null);

  React.useLayoutEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (!el) return;
    const measure = () => setIsTruncated(el.scrollHeight > el.clientHeight + 2);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  const toggleClassName =
    'cursor-pointer border-0 p-0 text-[16.5px] leading-[25px] font-medium text-grey-04 transition-colors hover:text-text';

  return (
    <div className={cx('relative', className)}>
      <p
        ref={textRef}
        data-testid="expandable-lede"
        className={cx('m-0 text-[16.5px] leading-[25px] text-text/85', !expanded && 'line-clamp-4')}
      >
        {text}
        {expanded && (
          <>
            {' '}
            <button
              type="button"
              aria-expanded
              onClick={() => setExpanded(false)}
              className={cx(toggleClassName, 'inline bg-transparent')}
            >
              Show less
            </button>
          </>
        )}
      </p>
      {!expanded && isTruncated && (
        <span className="absolute right-0 bottom-0 pl-8" style={SHOW_MORE_FADE}>
          <span aria-hidden className="text-[16.5px] leading-[25px] text-text/85">
            …{' '}
          </span>
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setExpanded(true)}
            className={cx(toggleClassName, 'bg-white')}
          >
            Show more
          </button>
        </span>
      )}
    </div>
  );
}
