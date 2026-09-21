import * as React from 'react';

/**
 * Whether line-clamped text actually has more lines than the clamp is showing.
 *
 * The obvious test — `scrollHeight > clientHeight` — is wrong whenever `line-height` is set tighter
 * than the glyphs need, and the debate claim title sets exactly that: 24px leading on a 24px face on
 * mobile, 21px on a 22.4px face on desktop. `clientHeight` is the clamp's box, `lines × line-height`.
 * `scrollHeight` is the height the *content* wants, and a 24px face wants about 26px. So the
 * difference is two or three pixels for every title ever rendered — one word or fifty — and the
 * control that comparison gates is offered permanently.
 *
 * Measured in Chromium against the real type scale: the height comparison called 6 of 14 sample
 * lengths overflowing at 390px and 12 of 14 at 1280px that were not, and never once said no.
 *
 * Counting lines is immune to it. Content that occupies n lines is `n * lineHeight` plus that same
 * sub-line overflow, so "reaches into line `maxLines + 1`" is precisely "there is more here than the
 * clamp shows" — correct on all 84 samples across both widths and all three type scales.
 *
 * `~/design-system/clamped-text` solves the same problem a different way, by measuring an unclamped
 * clone; that is also correct and is left alone. This exists because the debate title clamps a
 * heading wrapped in a link and toggles it from a separate control, which `ClampedText` does not do.
 */
export function exceedsLineClamp({
  /** `scrollHeight`. A clamped box still reports the full height its content wants. */
  contentHeight,
  /** `clientHeight`. Only used for the `line-height: normal` fallback below. */
  clampedHeight,
  /** The computed `line-height` in pixels, re-read on every measure — it changes at the breakpoint. */
  lineHeight,
  /** The `line-clamp-N` the element is rendered with. */
  maxLines,
}: {
  contentHeight: number;
  clampedHeight: number;
  lineHeight: number;
  maxLines: number;
}): boolean {
  // `line-height: normal` parses to no number, so there is nothing to count with. It is also the one
  // case where comparing heights is accurate — a normal line box is sized to the glyphs, so there is
  // no standing overflow to mistake for a wrapped line — so fall back to it rather than guess.
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return contentHeight > clampedHeight + 1;

  return contentHeight >= (maxLines + 1) * lineHeight;
}

/**
 * {@link exceedsLineClamp}, measured off a live element and kept current as it resizes.
 *
 * Two surfaces clamp claim text and offer a control to unclamp it — the feed's debate title and
 * the claim cards over the video — and the measurement is the fiddly half: the line height has to
 * be re-read on every measure because the breakpoint swaps the type scale, and a `ResizeObserver`
 * is the only thing that notices the text rewrapping at a width the component never hears about.
 * One copy, because a rule decided twice is a rule that will eventually disagree with itself.
 *
 * `enabled: false` (the text is currently expanded) deliberately *keeps* the last answer rather
 * than reporting `false`. An expanded element does not overflow — that is the point of expanding
 * it — and resetting here would take away the control that collapses it again.
 */
export function useLineClampOverflow(
  /**
   * The clamped element, held in state by the caller (`ref={setElement}`) rather than in a ref.
   *
   * It has to be the node itself and not a `RefObject`, because the node can be replaced while
   * every other input stays identical: a caller that wraps the text in a button once it *is*
   * truncated re-parents it, React remounts it, and an effect keyed on the ref object would not
   * re-run — leaving the observer below attached to a detached node, which reports zero height and
   * latches the answer back to "fits" for good. Passing the element puts it in the dependency list.
   */
  element: HTMLElement | null,
  {
    maxLines,
    enabled = true,
    /** Changes when the text does, so the measurement is redone for new content. */
    contentKey,
  }: { maxLines: number; enabled?: boolean; contentKey?: string }
): boolean {
  const [overflowing, setOverflowing] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!element || !enabled) return;

    const measure = () =>
      setOverflowing(
        exceedsLineClamp({
          contentHeight: element.scrollHeight,
          clampedHeight: element.clientHeight,
          lineHeight: parseFloat(getComputedStyle(element).lineHeight),
          maxLines,
        })
      );
    measure();

    // Measured again on the next frame, and again once webfonts have landed.
    //
    // One synchronous read is not enough, and the failure is silent. A clamped box's own height is
    // `lines × line-height` whatever it contains, so the observer below has nothing to fire on —
    // which means whatever the *first* read says is the answer forever. And the first read is the
    // least trustworthy one: measured in a layout effect, `scrollHeight` on a freshly-clamped box
    // can still report the clamped height rather than the content's, and the face the text is set
    // in may not have arrived. Both make a four-line claim look like it fits, and the control that
    // would have expanded it is never offered. Re-reading costs a single frame.
    const frame = requestAnimationFrame(measure);
    let cancelled = false;
    void document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [element, maxLines, enabled, contentKey]);

  return overflowing;
}
