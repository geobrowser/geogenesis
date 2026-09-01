import { describe, expect, it } from 'vitest';

import { DEBATE_OG_GEOMETRY as g } from './debate-og-image';

describe('debate share card geometry', () => {
  /// Review caught both of these on the first render: panels 64px apart, divider 32px left of
  /// centre. Both came from one hardcoded seam, so both are asserted against one derivation.
  it('splits the block into two equal panels', () => {
    expect(g.leftPanelWidth).toBe(g.rightPanelWidth);
  });

  it('centres the divider band on the block, which is what makes the panels equal', () => {
    expect(g.bandCentre).toBe(g.blockWidth / 2);
  });

  it('leaves the panels meeting exactly under the band, with no gap and no visible overlap', () => {
    // Each panel runs to its own side of the band; together they span the block plus the band's
    // width, which is the overlap the divider covers.
    expect(g.leftPanelWidth + g.rightPanelWidth).toBe(g.blockWidth + g.dividerWidth);
  });
});

describe('the divider band', () => {
  /// The band is what the eye reads as "the split". Drawn 32px off, it sat beside the real gap
  /// rather than in it — which looked like three separate faults at once: the split missing the VS
  /// badge, the left panel narrowed by the white bar, and bare background showing before the right
  /// panel. One offset, three symptoms.
  it('tiles the gap between the panels exactly', () => {
    const bars = g.bars;
    expect(bars[0].offset).toBe(0);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].offset).toBe(bars[i - 1].offset + bars[i - 1].width);
    }
    const total = bars.reduce((sum, bar) => sum + bar.width, 0);
    expect(total).toBe(g.dividerWidth);
  });

  it('spans the gap symmetrically about the block', () => {
    const bars = g.bars;
    const bandCentre = g.seamX + bars.reduce((sum, bar) => sum + bar.width, 0) / 2;
    expect(bandCentre).toBe(g.bandCentre);
    expect(bandCentre).toBe(g.blockWidth / 2);
  });

  /// Review's second complaint: the split missed the VS. The eye reads the black bar as the split
  /// — the white one is a rim on its left — so the badge belongs on the *black bar's* centre, not
  /// the band's. The two differ because the band is asymmetric, 15px against 17px.
  it('puts the VS badge on the black bar rather than the band centre', () => {
    const [white, black] = g.bars;
    expect(white.width).not.toBe(black.width);
    expect(g.blackBarCentre).toBe(g.seamX + white.width + black.width / 2);
    expect(g.blackBarCentre).not.toBe(g.bandCentre);
  });

  /// The tempting fix for that — slide the whole band until the black bar lands on the block's
  /// centre — reintroduces review's *first* complaint, so it is asserted against rather than left
  /// as a comment. Each panel is bounded by the band's outer edges, so shifting the band by 7.5px
  /// makes the right panel 15px wider than the left.
  it('does not buy the badge alignment by unbalancing the panels', () => {
    const shiftedSeam = g.blockWidth / 2 - g.bars[0].width - g.bars[1].width / 2;
    const left = shiftedSeam;
    const right = g.blockWidth - shiftedSeam - g.dividerWidth;

    expect(right - left).toBe(15);
    expect(g.seamX).not.toBe(shiftedSeam);
  });
});
