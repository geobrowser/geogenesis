import { describe, expect, it } from 'vitest';

import { DEBATE_OG_GEOMETRY as g } from './debate-og-image';

describe('the divider band', () => {
  /// The rule review settled on, after two rounds that each moved the band and each broke the
  /// other property. The panels are mirror images: whatever the left one is at the top, the right
  /// one is at the bottom. Neither speaker gets more room, at any height.
  it('makes the two panels mirror images of each other', () => {
    const w = g.panelWidths;
    expect(w.leftTop).toBe(w.rightBottom);
    expect(w.leftBottom).toBe(w.rightTop);
  });

  /// Measured off a render at 572/532, which is what those mirrored widths come to. Pinned as
  /// numbers as well as a relationship, because a change to BLOCK_W or LEAN keeps the symmetry
  /// while silently moving both.
  it('puts those widths at 572 and 532', () => {
    const w = g.panelWidths;
    expect(w.leftTop).toBe(572);
    expect(w.leftBottom).toBe(532);
  });

  it('is centred on the block at mid-height, which is what makes that symmetry hold', () => {
    expect(g.bandCentre).toBe(g.blockWidth / 2);
  });

  /// The property this trades away, asserted so it is a known cost rather than a regression
  /// someone re-discovers. Centring the top crossing and mirroring the panels are `LEAN / 2`
  /// apart and coincide only at LEAN = 0; review chose the panels.
  it('is therefore not centred where it crosses the top edge, by exactly half the lean', () => {
    expect(g.topCrossingCentre - g.blockWidth / 2).toBe(20);
  });

  it('leaves the panels meeting exactly under the band, with no gap and no visible overlap', () => {
    expect(g.leftPanelWidth + g.rightPanelWidth).toBe(g.blockWidth + g.dividerWidth);
  });

  /// Drawn 32px off, the band sat beside the real gap rather than in it — which looked like three
  /// separate faults at once: the left panel narrowed by the white
  /// bar, and bare background showing before the right panel. One offset, three symptoms.
  it('tiles the gap between the panels exactly', () => {
    const bars = g.bars;
    expect(bars[0].offset).toBe(0);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].offset).toBe(bars[i - 1].offset + bars[i - 1].width);
    }
    expect(bars.reduce((sum, bar) => sum + bar.width, 0)).toBe(g.dividerWidth);
  });
});

describe('the masthead', () => {
  /// Option B from GEO-3791, picked off rendered cards: the old 32/36/10 read too small in feeds.
  it('is drawn at mark 40, text 45, gap 12', () => {
    const m = g.masthead;
    expect([m.markPx, m.textPx, m.gapPx]).toEqual([40, 45, 12]);
  });

  /// Growing it must not push it into the claim band, which starts at the bottom of the header.
  /// The text's line box (~1.2x font size) is the taller of the two; renders put a 3-line claim
  /// 26px below the ink, but the box itself must clear the band on its own.
  it('stays inside the header, above the claim band', () => {
    const m = g.masthead;
    const halfBox = Math.max(m.markPx, m.textPx * 1.2) / 2;
    expect(m.centreY + halfBox).toBeLessThanOrEqual(m.claimBandTop - 4);
  });
});
