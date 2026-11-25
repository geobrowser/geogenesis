import * as React from 'react';

import { ImageResponse } from 'next/og';

import { calibreOgFonts } from '~/core/og-fonts';
import { ogImageToJpeg } from '~/core/og-jpeg';

import {
  LINK_CARD_H,
  LINK_CARD_W,
  LinkCard,
  TITLE_MAX_LINES,
  TITLE_MAX_PX,
  TITLE_MIN_PX,
  TITLE_WIDTH,
  fitLinkCardTitle,
  placeLinkCardNodes,
  textBlockTop,
} from './link-card-layout';
import type { GraphCardData } from './server/graph-card-data';

/**
 * A Topic page's 1200×630 link preview: "Topic" and the name on the left, the topic's Cover as the
 * hub of its real neighbours on the right, in the layout the explorer card shares. No claims.
 */

export { TITLE_MAX_LINES, TITLE_MAX_PX, TITLE_MIN_PX, TITLE_WIDTH, textBlockTop };
export const TOPIC_CARD_W = LINK_CARD_W;
export const TOPIC_CARD_H = LINK_CARD_H;
export const fitTopicTitle = (name: string) => fitLinkCardTitle(name);
export const placeTopicNodes = placeLinkCardNodes;

export function TopicCard({ data }: { data: GraphCardData }) {
  return (
    <LinkCard label="Topic" centre={data.centre} neighbours={data.neighbours.filter(node => node.kind !== 'claim')} />
  );
}

export function generateTopicCardResponse(data: GraphCardData) {
  return ogImageToJpeg(
    new ImageResponse(<TopicCard data={data} />, {
      width: TOPIC_CARD_W,
      height: TOPIC_CARD_H,
      fonts: calibreOgFonts,
    })
  );
}
