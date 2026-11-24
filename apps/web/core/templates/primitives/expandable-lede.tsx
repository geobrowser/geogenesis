'use client';

import * as React from 'react';

import cx from 'classnames';

/**
 * A page description that collapses to four lines with "Show more" when it runs longer (GEO-3837).
 *
 * Measured rather than counted: whether four lines overflow depends on the container width, so the
 * toggle only shows when the clamped text actually hides something.
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

  return (
    <div className={cx('flex max-w-[780px] flex-col items-start gap-1.5', className)}>
      <p
        ref={textRef}
        data-testid="expandable-lede"
        className={cx('m-0 text-[16.5px] leading-[25px] text-text/85', !expanded && 'line-clamp-4')}
      >
        {text}
      </p>
      {(isTruncated || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(prev => !prev)}
          className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-medium text-grey-04 transition-colors hover:text-text"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
