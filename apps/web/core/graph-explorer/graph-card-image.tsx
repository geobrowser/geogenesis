import * as React from 'react';

import { ImageResponse } from 'next/og';

import { calibreOgFonts } from '~/core/og-fonts';
import { ogImageToJpeg } from '~/core/og-jpeg';

import { LINK_CARD_H, LINK_CARD_W, LinkCard, shownVerdict } from './link-card-layout';
import type { GraphCardData } from './server/graph-card-data';

/**
 * The graph explorer's 1200×630 share card, in the Topic card's layout: the centre's kind and name on
 * the left, the centre as the hub of its real neighbours on the right. Claims may be neighbours; they
 * draw as neutral cards whose label carries the agree percent, never a band color.
 */

export const CARD_W = LINK_CARD_W;
export const CARD_H = LINK_CARD_H;
export { shownVerdict };

export function GraphCard({ data }: { data: GraphCardData }) {
  return <LinkCard label={data.centre.typeLabel} centre={data.centre} neighbours={data.neighbours} />;
}

export function generateGraphCardResponse(data: GraphCardData) {
  return ogImageToJpeg(
    new ImageResponse(<GraphCard data={data} />, { width: CARD_W, height: CARD_H, fonts: calibreOgFonts })
  );
}
