import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import type { ResponseKind } from '~/core/responses/entity-response';

import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { VoteArrow } from '~/design-system/icons/vote-arrow';

import { ResponsePositionIcon } from './response-position-icon';

/**
 * The mapping used to be written out at all three surfaces that draw it — the entity vote buttons,
 * the claim ticker over the video, and the position pills — and the pills' copy was the one missing
 * the veracity branch, so a factual claim was thumbed in the claims side panel while the ticker
 * above it drew a chevron for the same claim. These pin the mapping now that there is one of it.
 */
describe('ResponsePositionIcon', () => {
  afterEach(cleanup);

  /**
   * Each glyph is pinned against the icon component it should be, by rendered markup.
   *
   * Not by asserting the `d` of the path it draws. Two of these glyphs cannot be told apart that
   * way at all: `VoteArrow` draws the *same* path for both directions and flips it with a
   * `transform`, so a path-only assertion passes an up arrow off as a down one. And a negative
   * assertion — "not the down chevron" — is weaker still, since every wrong glyph in the set
   * satisfies it, which is how the first version of this file let a vote arrow stand in for a
   * thumb.
   *
   * Comparing markup also means redrawing an icon's art does not fail these: the expectation is
   * re-rendered from the same component, so what is pinned is *which* icon and with which props,
   * which is the whole of what this component decides.
   */
  const markup = (node: React.ReactNode) => render(<>{node}</>).container.innerHTML;

  const glyph = (responseKind: ResponseKind, position: boolean, selected = false) =>
    markup(<ResponsePositionIcon responseKind={responseKind} position={position} selected={selected} />);

  it('draws chevrons for a veracity claim, where the act is confirming rather than approving', () => {
    expect(glyph('veracity', true)).toBe(markup(<ChevronUp />));
    expect(glyph('veracity', false)).toBe(markup(<ChevronDown />));
  });

  it('draws thumbs for a stance claim', () => {
    expect(glyph('stance', true)).toBe(markup(<ThumbUp filled={false} />));
    expect(glyph('stance', false)).toBe(markup(<ThumbDown filled={false} />));
  });

  it('draws arrows for curation, pointing the way the side does', () => {
    expect(glyph('curation', true)).toBe(markup(<VoteArrow direction="up" filled={false} />));
    expect(glyph('curation', false)).toBe(markup(<VoteArrow direction="down" filled={false} />));
  });

  // `selected` is advisory: it fills the glyphs that have a filled form and is inert on the one
  // that does not. A chevron that quietly dropped it would read as veracity having a fill that
  // never arrives, which is the bug a previous shared `Icon` const shipped.
  it('fills the held side of a stance claim', () => {
    expect(glyph('stance', true, true)).toBe(markup(<ThumbUp filled />));
    expect(glyph('stance', false, true)).toBe(markup(<ThumbDown filled />));
  });

  it('fills the held side of a curation vote', () => {
    expect(glyph('curation', true, true)).toBe(markup(<VoteArrow direction="up" filled />));
    expect(glyph('curation', false, true)).toBe(markup(<VoteArrow direction="down" filled />));
  });

  it('leaves a chevron unchanged when held, having no filled form to switch to', () => {
    expect(glyph('veracity', true, true)).toBe(glyph('veracity', true, false));
    expect(glyph('veracity', false, true)).toBe(glyph('veracity', false, false));
  });
});
