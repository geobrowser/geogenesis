import { describe, expect, it } from 'vitest';

import { DEBATE_OG_GEOMETRY as g } from './debate-og-image';

describe('the divider band', () => {
  /// Where the band sits has been through two rounds of review, and each round moved it by less
  /// than the one before — 32px, then 20px. Every remaining candidate position is within 20px of
  /// this one, so the choice is asserted rather than left to a comment.
  it('is centred where it crosses the top edge of the block', () => {
    expect(g.topCrossingCentre).toBe(g.blockWidth / 2);
  });

  /// The near-neighbour that was there before: centring the band at mid-height instead. It looks
  /// like the same intent and is half the lean away, which is exactly enough to read as the whole
  /// split sitting off to the right of the card.
  it('is therefore not centred at mid-height, which is the position it replaced', () => {
    expect(g.bandCentre).not.toBe(g.blockWidth / 2);
    expect(g.topCrossingCentre - g.bandCentre).toBe(20);
  });

  /// Centring the top crossing means the lean falls entirely left of centre, so the panels are no
  /// longer equal. That is intended and matches the design, but only at exactly the lean's width —
  /// a larger gap would mean an edge had been hardcoded again, which is what once put them 64px
  /// apart.
  it('leaves the panels differing by the lean, and by nothing else', () => {
    expect(g.rightPanelWidth - g.leftPanelWidth).toBe(40);
  });

  it('leaves the panels meeting exactly under the band, with no gap and no visible overlap', () => {
    // Each panel runs to its own side of the band; together they span the block plus the band's
    // width, which is the overlap the divider covers.
    expect(g.leftPanelWidth + g.rightPanelWidth).toBe(g.blockWidth + g.dividerWidth);
  });

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
});

describe('the VS badge', () => {
  /// The badge is centred on the *white* bar's right edge, not on the band's centre and not on the
  /// black bar's. The three are 7.5px and 8.5px apart, so nothing about a render says which one a
  /// given number was meant to be.
  it('sits on the right edge of the white bar', () => {
    const [white] = g.bars;
    expect(g.badgeCentre).toBe(g.seamX + white.width);
    expect(g.badgeCentre).toBe(g.whiteBarRightEdgeAt(g.badgeCentreY));
  });

  /// Which is the point of it. The band leans, so no x holds the line through the whole badge; the
  /// badge can only be centred on the line at one height, and the lean carries the line off centre
  /// either side of that. Centring on the white bar's edge is what splits that error evenly.
  /// On the black bar's centre it was near flush where the line entered the badge and 15px out
  /// where it left, which read as the divider sliding out from under the badge on the way down.
  it('takes the lean evenly above and below itself', () => {
    const above = g.whiteBarRightEdgeAt(g.badgeCentreY - g.badgeRadius) - g.badgeCentre;
    const below = g.whiteBarRightEdgeAt(g.badgeCentreY + g.badgeRadius) - g.badgeCentre;

    expect(above).toBeCloseTo(-below, 10);
    expect(Math.abs(above)).toBeGreaterThan(0);
  });
});
