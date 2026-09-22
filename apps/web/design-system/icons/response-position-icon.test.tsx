import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import type { ResponseKind } from '~/core/responses/entity-response';

import { ResponsePositionIcon } from './response-position-icon';

/**
 * The mapping used to be written out at all three surfaces that draw it — the entity vote buttons,
 * the claim ticker over the video, and the position pills — and the pills' copy was the one missing
 * the veracity branch, so a factual claim was thumbed in the claims side panel while the ticker
 * above it drew a chevron for the same claim. These pin the mapping now that there is one of it.
 */
describe('ResponsePositionIcon', () => {
  afterEach(cleanup);

  // The glyphs are asserted by the path they draw, because that is the whole subject here: every
  // branch renders an `svg`, so anything coarser would pass with the wrong icon in it.
  const CHEVRON_UP = 'M1 11L8 4L15 11';
  const CHEVRON_DOWN = 'M1 5L8 12L15 5';

  const paths = (responseKind: ResponseKind, position: boolean, selected = false) => {
    const { container } = render(
      <ResponsePositionIcon responseKind={responseKind} position={position} selected={selected} />
    );
    return [...container.querySelectorAll('path')].map(path => path.getAttribute('d'));
  };

  it('draws chevrons for a veracity claim, where the act is confirming rather than approving', () => {
    expect(paths('veracity', true)).toEqual([CHEVRON_UP]);
    expect(paths('veracity', false)).toEqual([CHEVRON_DOWN]);
  });

  it('draws thumbs for a stance claim', () => {
    // A thumb's body starts at the wrist; the chevrons are single strokes and share no path with it.
    expect(paths('stance', true)[0]).toMatch(/^M7\.43587 11\.25/);
    expect(paths('stance', false)[0]).not.toBe(CHEVRON_DOWN);
  });

  it('draws arrows for curation', () => {
    expect(paths('curation', true)[0]).toMatch(/^M5\.13363 1\.50391/);
    expect(paths('curation', false)).not.toContain(CHEVRON_DOWN);
  });

  // `selected` is advisory: it fills the glyphs that have a filled form and is inert on the one
  // that does not. A chevron that quietly dropped it would read as veracity having a fill that
  // never arrives, which is the bug a previous shared `Icon` const shipped.
  //
  // Each glyph says "filled" differently, so each is asked in its own terms rather than by counting
  // paths: a thumb drops the separate handle stroke, and an arrow drops the outline it swaps on
  // hover. Both go from two paths to one, which is a coincidence and not a rule worth asserting.
  it('fills a thumb for the held side', () => {
    expect(paths('stance', true, true).length).toBeLessThan(paths('stance', true, false).length);
  });

  it('fills an arrow for the held side', () => {
    expect(paths('curation', true, true).length).toBeLessThan(paths('curation', true, false).length);
  });

  it('leaves a chevron unchanged when held, having no filled form to switch to', () => {
    expect(paths('veracity', true, true)).toEqual(paths('veracity', true, false));
  });
});
