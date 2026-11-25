import * as React from 'react';

import { fitWrappedText, initials, measureTextWidth, seedHue } from '~/core/blocks/ranking/ranking-og-image';

import { GeoMark } from '~/design-system/icons/geo-mark';

import { type ClaimBand, MIN_RESPONSES_FOR_BAND, agreePercent, claimBand } from './claim-band';
import type { Counts, GraphCardNode } from './server/graph-card-data';
import { TOPIC_HUB as HUB, TOPIC_SLOTS, assignTopicSlots } from './topic-card-slots';

/**
 * The 1200×630 link preview layout the Topic card and the explorer card share: the logo, a small label
 * and the name on the left, the centre as the hub of its real neighbours on the right. No claims bar,
 * no description and no claim colors. Every weight is Calibre 400. Satori renders a CSS subset, so
 * every box is flex or absolute.
 */

export const LINK_CARD_W = 1200;
export const LINK_CARD_H = 630;

const STAGE = [
  'radial-gradient(ellipse 34% 52% at 79% 50%, rgba(217,180,106,.20), transparent 70%)',
  'radial-gradient(ellipse 42% 52% at 4% 2%, rgba(150,170,215,.22), transparent 70%)',
  'radial-gradient(ellipse 60% 70% at 12% 8%, rgba(70,82,120,.30), transparent 70%)',
  'linear-gradient(160deg, #161925 0%, #0d0e14 55%, #07070a 100%)',
].join(', ');

/** The text column, x 64 to 600. */
const TEXT_LEFT = 64;
export const TITLE_WIDTH = 536;
export const TITLE_MAX_PX = 78;
export const TITLE_MIN_PX = 48;
export const TITLE_MAX_LINES = 3;
/** A claim is a sentence: it gets more lines at the same sizes rather than being cut off. */
export const CLAIM_TITLE_MAX_LINES = 5;
const TITLE_LINE_HEIGHT = 1.05;
const LABEL_PX = 26;
const LABEL_LINE_HEIGHT = 1.1;
const LABEL_GAP = 12;
/**
 * Calibre 400's width over `measureTextWidth`'s estimate. Measured in Chrome on 22 topic-like names:
 * 0.62 to 0.77. The 500 weight's 0.86 would shrink names that fit.
 */
const CALIBRE_400_WIDTH_RATIO = 0.78;
const MARGIN = 24;

const PILL_MAX_W = 260;
const PERSON = { w: 180, h: 112, avatar: 72 };
const CARD = { w: 250, h: 90 };
const DARK_CARD = '#1c1c20';
const KIND_GRAY = '#a8a8ae';

/** The title's size and lines: 78px down to 48px, at most `maxLines` in the 536px column, broken at spaces. */
export function fitLinkCardTitle(name: string, maxLines = TITLE_MAX_LINES) {
  return fitWrappedText(name, TITLE_MAX_PX, TITLE_MIN_PX, TITLE_WIDTH / CALIBRE_400_WIDTH_RATIO, maxLines, name, {
    lineHeight: TITLE_LINE_HEIGHT,
  });
}

/** The label and title as one block, centred on the hub's line. */
export function textBlockTop(title: { fontSize: number; lines: readonly string[] }, maxLines = TITLE_MAX_LINES) {
  const lines = Math.min(title.lines.length, maxLines);
  const height = LABEL_PX * LABEL_LINE_HEIGHT + LABEL_GAP + lines * title.fontSize * TITLE_LINE_HEIGHT;
  return Math.round(HUB.y - height / 2);
}

const total = (counts: Counts | null) => (counts ? counts.positive + counts.negative : 0);

/** The band and percent, only once a claim has enough responses to show them. */
export function shownVerdict(counts: Counts | null): { band: ClaimBand; percent: number } | null {
  if (!counts || total(counts) < MIN_RESPONSES_FOR_BAND) return null;
  const band = claimBand(counts.positive, counts.negative);
  const percent = agreePercent(counts.positive, counts.negative);
  return band && percent !== null ? { band, percent } : null;
}

/** A claim node's kind label: its status as text, since the card draws no band color. */
export function claimNodeLabel(counts: Counts | null) {
  const verdict = shownVerdict(counts);
  return verdict ? `Claim · ${verdict.percent}% agree` : 'Claim';
}

function nodeBox(node: GraphCardNode) {
  if (node.kind === 'ent') return { w: PERSON.w, h: PERSON.h };
  if (node.kind === 'topic') return { w: Math.min(PILL_MAX_W, measureTextWidth(node.name, 20) + 36), h: 44 };
  return CARD;
}

/** Each node centred on its slot, then moved inside the frame. */
export function placeLinkCardNodes(nodes: readonly GraphCardNode[]) {
  return assignTopicSlots(nodes).map(({ node, slot }) => {
    const { x, y } = TOPIC_SLOTS[slot];
    const box = nodeBox(node);
    const left = Math.min(Math.max(x - box.w / 2, MARGIN), LINK_CARD_W - MARGIN - box.w);
    const top = Math.min(Math.max(y - box.h / 2, MARGIN), LINK_CARD_H - MARGIN - box.h);
    return { node, slot, left, top, w: box.w, h: box.h, cx: left + box.w / 2, cy: top + box.h / 2 };
  });
}

function discStyle(size: number, ring: number, halo: number, glow: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: size,
    border: `${ring}px solid #fff`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: `0 0 0 ${halo}px rgba(255,255,255,.07), 0 0 ${glow}px rgba(255,255,255,.22)`,
  };
}

function Disc({
  name,
  src,
  size,
  ring,
  halo,
  glow,
}: {
  name: string;
  src: string | null;
  size: number;
  ring: number;
  halo: number;
  glow: number;
}) {
  const base = discStyle(size, ring, halo, glow);
  if (src) return <img src={src} width={size} height={size} style={{ ...base, objectFit: 'cover' }} alt="" />;
  return (
    <div
      style={{
        ...base,
        background: `hsl(${seedHue(name)},35%,32%)`,
        color: '#fff',
        fontSize: Math.round(size * 0.36),
        fontWeight: 400,
      }}
    >
      {initials(name).toUpperCase()}
    </div>
  );
}

/** A claim at the centre has no picture: a dark disc with its agree percent, or its response count. */
function ClaimHub({ counts }: { counts: Counts | null }) {
  const verdict = shownVerdict(counts);
  const n = total(counts);
  return (
    <div style={{ ...discStyle(HUB.size, 5, 10, 60), background: DARK_CARD, color: '#fff' }}>
      {verdict ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 52, fontWeight: 400, lineHeight: 1 }}>{`${verdict.percent}%`}</span>
          <span style={{ fontSize: 22, fontWeight: 400, color: KIND_GRAY, marginTop: 6 }}>agree</span>
        </div>
      ) : (
        <span style={{ fontSize: 22, fontWeight: 400, color: KIND_GRAY, textAlign: 'center', maxWidth: 140 }}>
          {n ? `${n} ${n === 1 ? 'response' : 'responses'}` : 'No votes yet'}
        </span>
      )}
    </div>
  );
}

function NodeView({ node }: { node: GraphCardNode }) {
  if (node.kind === 'ent') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: PERSON.w }}>
        <Disc name={node.name} src={node.image} size={PERSON.avatar} ring={3} halo={8} glow={44} />
        <div
          style={{
            display: 'block',
            background: '#fff',
            color: '#151515',
            borderRadius: 6,
            padding: '2px 9px',
            fontSize: 19,
            fontWeight: 400,
            lineHeight: 1.25,
            maxWidth: PERSON.w,
            lineClamp: 1,
          }}
        >
          {node.name}
        </div>
      </div>
    );
  }
  if (node.kind === 'topic') {
    return (
      <div
        style={{
          display: 'flex',
          background: 'rgba(246,246,246,.96)',
          color: '#151515',
          borderRadius: 999,
          padding: '9px 18px',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.1,
          maxWidth: PILL_MAX_W,
          boxShadow: '0 0 30px rgba(255,255,255,.18)',
        }}
      >
        <span style={{ display: 'block', lineClamp: 1 }}>{node.name}</span>
      </div>
    );
  }
  const light = node.kind === 'story';
  const label = node.kind === 'claim' ? claimNodeLabel(node.counts) : node.label;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: CARD.w,
        padding: '12px 16px',
        borderRadius: 14,
        background: light ? 'rgba(246,246,246,.96)' : DARK_CARD,
        color: light ? '#151515' : '#f2f2f2',
        boxShadow: light
          ? '0 10px 30px rgba(0,0,0,.45)'
          : 'inset 0 0 0 1px rgba(255,255,255,.16), 0 10px 30px rgba(0,0,0,.45)',
      }}
    >
      {label ? (
        <span style={{ fontSize: 15, fontWeight: 400, color: light ? '#4b4b4b' : KIND_GRAY }}>{label}</span>
      ) : null}
      <div style={{ display: 'block', fontSize: 18, fontWeight: 400, lineHeight: 1.2, lineClamp: 2 }}>{node.name}</div>
    </div>
  );
}

function Graph({ centre, neighbours }: { centre: GraphCardNode; neighbours: readonly GraphCardNode[] }) {
  const placed = placeLinkCardNodes(neighbours);
  const hubBox = HUB.size + 40;
  return (
    <>
      <svg width={LINK_CARD_W} height={LINK_CARD_H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {placed.map(({ node, cx, cy }) => (
          <line
            key={`l${node.id}`}
            x1={HUB.x}
            y1={HUB.y}
            x2={cx}
            y2={cy}
            stroke="rgba(255,255,255,.28)"
            strokeWidth={1.5}
          />
        ))}
        {placed.map(({ node, cx, cy }) => (
          <circle
            key={`d${node.id}`}
            cx={(HUB.x + cx) / 2}
            cy={(HUB.y + cy) / 2}
            r={2.5}
            fill="rgba(255,255,255,.55)"
          />
        ))}
      </svg>
      {placed.map(({ node, left, top, w, h }) => (
        <div
          key={node.id}
          style={{
            position: 'absolute',
            display: 'flex',
            alignItems: node.kind === 'ent' ? 'flex-start' : 'center',
            justifyContent: 'center',
            left,
            top,
            width: w,
            height: h,
          }}
        >
          <NodeView node={node} />
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          left: HUB.x - hubBox / 2,
          top: HUB.y - hubBox / 2,
          width: hubBox,
          height: hubBox,
        }}
      >
        {centre.kind === 'claim' ? (
          <ClaimHub counts={centre.counts} />
        ) : (
          <Disc name={centre.name} src={centre.image} size={HUB.size} ring={5} halo={10} glow={60} />
        )}
      </div>
    </>
  );
}

export function LinkCard({
  label,
  centre,
  neighbours,
}: {
  /** The small gray line above the title: the centre's kind ("Topic", "Person", "Claim"). */
  label: string;
  centre: GraphCardNode;
  neighbours: readonly GraphCardNode[];
}) {
  const maxLines = centre.kind === 'claim' ? CLAIM_TITLE_MAX_LINES : TITLE_MAX_LINES;
  const title = fitLinkCardTitle(centre.name, maxLines);
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: LINK_CARD_W,
        height: LINK_CARD_H,
        fontFamily: 'Calibre',
        fontWeight: 400,
        color: '#fff',
        backgroundColor: '#0b0c11',
        backgroundImage: STAGE,
      }}
    >
      <Graph centre={centre} neighbours={neighbours} />
      <div
        style={{
          position: 'absolute',
          left: TEXT_LEFT,
          top: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          color: '#f2f2f2',
        }}
      >
        <GeoMark size={48} color="#f2f2f2" />
        <span style={{ fontSize: 48, fontWeight: 400, lineHeight: 1, paddingTop: 7 }}>Geo</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: TEXT_LEFT,
          top: textBlockTop(title, maxLines),
          width: TITLE_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          gap: LABEL_GAP,
        }}
      >
        <span style={{ fontSize: LABEL_PX, fontWeight: 400, color: '#b9b9bf', lineHeight: LABEL_LINE_HEIGHT }}>
          {label}
        </span>
        <div
          style={{
            display: 'block',
            width: TITLE_WIDTH,
            color: '#fff',
            fontSize: title.fontSize,
            fontWeight: 400,
            lineHeight: TITLE_LINE_HEIGHT,
            lineClamp: maxLines,
          }}
        >
          {centre.name}
        </div>
      </div>
    </div>
  );
}
