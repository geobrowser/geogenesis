import * as React from 'react';

/** Whether a scrolling list still has content hidden below its fixed footer. */
export function useContentBelow(
  scrollRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  enabled: boolean
): boolean {
  const [hasContentBelow, setHasContentBelow] = React.useState(false);

  React.useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!enabled || !viewport || !content) return;

    const measure = () => {
      // A pixel of slack absorbs fractional scroll positions at the bottom.
      setHasContentBelow(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 1);
    };
    measure();
    viewport.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(content);

    return () => {
      viewport.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [scrollRef, contentRef, enabled]);

  return enabled && hasContentBelow;
}
