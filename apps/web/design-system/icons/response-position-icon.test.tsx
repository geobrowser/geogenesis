import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import type { ResponseKind } from '~/core/responses/entity-response';

import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { VoteArrow } from '~/design-system/icons/vote-arrow';

import { ResponsePositionIcon } from './response-position-icon';

/**
 * There are two glyphs now, not three.
 *
 * A claim carrying the "Is factual" flag used to draw a chevron, because it was verified or
 * disputed rather than agreed with. Every claim is a stance now, so a thumb is the only thing a
 * claim draws — and `ResponseKind` no longer has a value that could ask for anything else, which
 * is what keeps a third glyph from creeping back.
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

  it('draws thumbs for a claim', () => {
    expect(glyph('stance', true)).toBe(markup(<ThumbUp filled={false} />));
    expect(glyph('stance', false)).toBe(markup(<ThumbDown filled={false} />));
  });

  it('draws arrows for curation, pointing the way the side does', () => {
    expect(glyph('curation', true)).toBe(markup(<VoteArrow direction="up" filled={false} />));
    expect(glyph('curation', false)).toBe(markup(<VoteArrow direction="down" filled={false} />));
  });

  it('fills the held side of a claim', () => {
    expect(glyph('stance', true, true)).toBe(markup(<ThumbUp filled />));
    expect(glyph('stance', false, true)).toBe(markup(<ThumbDown filled />));
  });

  it('fills the held side of a curation vote', () => {
    expect(glyph('curation', true, true)).toBe(markup(<VoteArrow direction="up" filled />));
    expect(glyph('curation', false, true)).toBe(markup(<VoteArrow direction="down" filled />));
  });
  /**
   * The wire can still say `"veracity"`.
   *
   * geo-chat labels claims minted before the vocabularies merged with a kind this app no longer
   * has, and the value reaches here typed as one it does — TypeScript cannot catch it. An unguarded
   * lookup returns `undefined` and throws on the call, which blanks the whole surface: the claims
   * ticker over a debate video, or a card in the matches list.
   */
  it('falls back to the claim glyph for a kind that is no longer a kind', () => {
    const retired = 'veracity' as unknown as ResponseKind;

    expect(() => glyph(retired, true)).not.toThrow();
    expect(glyph(retired, true)).toBe(markup(<ThumbUp filled={false} />));
    expect(glyph(retired, false)).toBe(markup(<ThumbDown filled={false} />));
  });
});
