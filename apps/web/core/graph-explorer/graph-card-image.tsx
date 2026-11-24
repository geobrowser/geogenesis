import * as React from 'react';

import { ImageResponse } from 'next/og';

import { fitWrappedText, initials, measureTextWidth, seedHue } from '~/core/blocks/ranking/ranking-og-image';
import { calibreOgFonts } from '~/core/og-fonts';
import { ogImageToJpeg } from '~/core/og-jpeg';

import { GeoMark } from '~/design-system/icons/geo-mark';

import { CLAIM_BAND_LABELS, type ClaimBand, agreePercent, claimBand } from './claim-band';
import type { GraphKind } from './graph-kinds';
import type { Counts, GraphCardData, GraphCardNode } from './server/graph-card-data';

/**
 * The graph explorer's 1200×630 share card: title and one stat on the left, a crop of the real
 * neighbourhood on the right. Satori renders a CSS subset, so every box here is flex or absolute.
 */

export const CARD_W = 1200;
export const CARD_H = 630;
/** A percent and a band off one or two votes reads as a verdict; below this the card says the count. */
export const MIN_RESPONSES_FOR_PERCENT = 3;

const BAND: Record<ClaimBand, string> = { agreed: '#1e824c', contested: '#b75700', rejected: '#6833ff' };
const BAND_GLOW: Record<ClaimBand, string> = {
  agreed: 'rgba(30,130,76,.45)',
  contested: 'rgba(183,87,0,.45)',
  rejected: 'rgba(104,51,255,.45)',
};
/** Band text on the dark stage, lighter than the fills so it stays legible. */
const BAND_TEXT: Record<ClaimBand, string> = { agreed: '#5fd394', contested: '#ff9a3d', rejected: '#a98bff' };
const GOLD = '#d9b46a';
const STAGE =
  'radial-gradient(ellipse 45% 40% at 22% 28%, rgba(154,96,255,.16), transparent 70%), radial-gradient(ellipse 40% 35% at 80% 74%, rgba(255,121,0,.10), transparent 70%), radial-gradient(ellipse at 50% 45%, #1c1c21 0%, #111114 55%, #070708 100%)';

const KIND_PLURAL: Record<GraphKind, string> = {
  topic: 'topics',
  ent: 'people and groups',
  claim: 'claims',
  story: 'news',
  event: 'events',
  src: 'sources',
  case: 'court cases',
  other: 'other',
};
const KIND_ONE: Record<GraphKind, string> = {
  topic: 'topic',
  ent: 'person or group',
  claim: 'claim',
  story: 'news story',
  event: 'event',
  src: 'source',
  case: 'court case',
  other: 'other',
};

/** Hub and slots on the right half; nodes are clamped inside the frame by `MARGIN`. */
const HUB = { x: 905, y: 318, size: 150 };
const SLOTS = [
  { x: 820, y: 92 },
  { x: 1080, y: 175 },
  { x: 1080, y: 430 },
  { x: 860, y: 552 },
  { x: 690, y: 450 },
  { x: 680, y: 205 },
];
const MARGIN = 24;
const TITLE_WIDTH = 520;
/** Calibre's width over `measureTextWidth`'s estimate, measured on the card's titles. */
const CALIBRE_WIDTH_RATIO = 0.86;
const NODE_SCALE = 0.85;

const total = (counts: Counts | null) => (counts ? counts.positive + counts.negative : 0);

/** The band and percent, only once a claim has enough responses to show them. */
export function shownVerdict(counts: Counts | null): { band: ClaimBand; percent: number } | null {
  if (!counts || total(counts) < MIN_RESPONSES_FOR_PERCENT) return null;
  const band = claimBand(counts.positive, counts.negative);
  const percent = agreePercent(counts.positive, counts.negative);
  return band && percent !== null ? { band, percent } : null;
}

export function responsesSoFar(n: number) {
  return `${n} ${n === 1 ? 'response' : 'responses'} so far`;
}

export function kindChipLabel({ kind, n, more }: { kind: GraphKind; n: number; more: boolean }) {
  return `${n}${more ? '+' : ''} ${n === 1 && !more ? KIND_ONE[kind] : KIND_PLURAL[kind]}`;
}

function seeded(seed: string) {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function Stars({ seed }: { seed: string }) {
  const random = seeded(seed);
  return (
    <>
      {Array.from({ length: 55 }, (_, i) => {
        const size = random() < 0.15 ? 3 : random() < 0.5 ? 2 : 1.5;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 560 + random() * 640,
              top: random() * CARD_H,
              width: size,
              height: size,
              borderRadius: 9,
              background: `rgba(255,255,255,${(0.15 + random() * 0.45).toFixed(2)})`,
            }}
          />
        );
      })}
    </>
  );
}

function Avatar({ name, src, size, ring }: { name: string; src: string | null; size: number; ring: number }) {
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size,
    border: `${ring}px solid #fff`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 0 0 8px rgba(255,255,255,.07), 0 0 44px rgba(255,255,255,.22)',
  };
  if (src) return <img src={src} width={size} height={size} style={{ ...base, objectFit: 'cover' }} alt="" />;
  return (
    <div
      style={{
        ...base,
        background: `hsl(${seedHue(name)},35%,32%)`,
        color: '#fff',
        fontSize: Math.round(size * 0.36),
        fontWeight: 500,
      }}
    >
      {initials(name).toUpperCase()}
    </div>
  );
}

const s = (value: number) => Math.round(value * NODE_SCALE);

/** Box sizes for clamping; heights are the tallest each node draws. */
function nodeBox(node: GraphCardNode) {
  if (node.kind === 'ent') return { w: s(200), h: s(100) };
  if (node.kind === 'topic') return { w: s(Math.min(250, measureTextWidth(node.name, 18) + 34)), h: s(42) };
  if (node.kind === 'claim') return { w: s(240), h: s(98) };
  return { w: s(230), h: s(78) };
}

function NodeView({ node }: { node: GraphCardNode }) {
  if (node.kind === 'ent') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(8), width: s(200) }}>
        <Avatar name={node.name} src={node.image} size={s(64)} ring={3} />
        <div
          style={{
            display: 'block',
            background: '#fff',
            color: '#151515',
            borderRadius: 6,
            padding: `${s(2)}px ${s(8)}px`,
            fontSize: s(17),
            fontWeight: 500,
            maxWidth: s(200),
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
          padding: `${s(8)}px ${s(16)}px`,
          fontSize: s(18),
          fontWeight: 500,
          maxWidth: s(250),
          boxShadow: '0 0 30px rgba(255,255,255,.18)',
        }}
      >
        <span style={{ display: 'block', lineClamp: 1 }}>{node.name}</span>
      </div>
    );
  }
  if (node.kind === 'claim') {
    const verdict = shownVerdict(node.counts);
    const n = total(node.counts);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: s(6),
          width: s(240),
          padding: `${s(12)}px ${s(14)}px`,
          borderRadius: s(14),
          color: '#fff',
          background: verdict ? BAND[verdict.band] : 'rgba(28,28,32,.86)',
          boxShadow: verdict
            ? `0 10px 40px ${BAND_GLOW[verdict.band]}`
            : 'inset 0 0 0 1px rgba(255,255,255,.16), 0 10px 30px rgba(0,0,0,.45)',
        }}
      >
        <div style={{ display: 'block', fontSize: s(17), fontWeight: 500, lineHeight: 1.2, lineClamp: 2 }}>
          {node.name}
        </div>
        {verdict ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: s(5) }}>
            <span style={{ fontSize: s(15), fontWeight: 500 }}>{`${verdict.percent}% agree`}</span>
            <div style={{ display: 'flex', height: s(4), borderRadius: 4, background: 'rgba(255,255,255,.3)' }}>
              <div
                style={{
                  width: (s(212) * verdict.percent) / 100,
                  height: s(4),
                  borderRadius: 4,
                  background: '#fff',
                }}
              />
            </div>
          </div>
        ) : (
          <span style={{ fontSize: s(14), color: '#a8a8a8' }}>{n ? responsesSoFar(n) : 'No responses yet'}</span>
        )}
      </div>
    );
  }
  const light = node.kind === 'story';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: s(4),
        width: s(230),
        padding: `${s(10)}px ${s(14)}px`,
        borderRadius: s(14),
        background: light ? 'rgba(246,246,246,.96)' : 'rgba(28,28,32,.86)',
        color: light ? '#151515' : '#f2f2f2',
        boxShadow: light
          ? '0 10px 30px rgba(0,0,0,.45)'
          : 'inset 0 0 0 1px rgba(255,255,255,.16), 0 10px 30px rgba(0,0,0,.45)',
      }}
    >
      {node.label ? (
        <span style={{ fontSize: s(13), fontWeight: 500, color: light ? '#4b4b4b' : GOLD }}>{node.label}</span>
      ) : null}
      <div style={{ display: 'block', fontSize: s(16), fontWeight: 500, lineHeight: 1.2, lineClamp: 2 }}>
        {node.name}
      </div>
    </div>
  );
}

function Hub({ data }: { data: GraphCardData }) {
  const { centre } = data;
  const disc: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: HUB.size,
    height: HUB.size,
    borderRadius: HUB.size,
    border: '4px solid #fff',
    color: '#fff',
    background: 'rgba(28,28,32,.95)',
    boxShadow: '0 0 0 8px rgba(255,255,255,.07), 0 0 44px rgba(255,255,255,.22)',
  };
  if (centre.kind === 'claim') {
    const verdict = shownVerdict(centre.counts);
    const n = total(centre.counts);
    return (
      <div
        style={{
          ...disc,
          ...(verdict
            ? {
                background: BAND[verdict.band],
                boxShadow: `0 0 0 8px rgba(255,255,255,.07), 0 0 60px ${BAND_GLOW[verdict.band]}`,
              }
            : {}),
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 500 }}>Claim</span>
        <span style={{ fontSize: 19, color: verdict ? '#fff' : '#a8a8a8' }}>
          {verdict
            ? CLAIM_BAND_LABELS[verdict.band]
            : n
              ? `${n} ${n === 1 ? 'response' : 'responses'}`
              : 'No votes yet'}
        </span>
      </div>
    );
  }
  if (centre.image || centre.kind !== 'topic')
    return <Avatar name={centre.name} src={centre.image} size={HUB.size} ring={5} />;
  return (
    <div style={{ ...disc, fontSize: 28, fontWeight: 500 }}>
      <span>Topic</span>
    </div>
  );
}

/** Each node centred on its slot, then moved inside the frame; links end where the node sits. */
export function placeNodes(nodes: readonly GraphCardNode[]) {
  return nodes.map((node, index) => {
    const slot = SLOTS[index];
    const box = nodeBox(node);
    const left = Math.min(Math.max(slot.x - box.w / 2, MARGIN), CARD_W - MARGIN - box.w);
    const top = Math.min(Math.max(slot.y - box.h / 2, MARGIN), CARD_H - MARGIN - box.h);
    return { node, left, top, w: box.w, h: box.h, cx: left + box.w / 2, cy: top + box.h / 2 };
  });
}

function Constellation({ data }: { data: GraphCardData }) {
  const placed = placeNodes(data.neighbours);
  const hubBox = HUB.size + 20;
  return (
    <>
      <svg width={CARD_W} height={CARD_H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {placed.map(({ node, cx, cy }) => {
          const verdict = node.kind === 'claim' ? shownVerdict(node.counts) : null;
          return (
            <line
              key={`l${node.id}`}
              x1={HUB.x}
              y1={HUB.y}
              x2={cx}
              y2={cy}
              stroke={verdict ? BAND[verdict.band] : 'rgba(255,255,255,.28)'}
              strokeOpacity={verdict ? 0.7 : 1}
              strokeWidth={1.5}
            />
          );
        })}
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
            alignItems: 'center',
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
        <Hub data={data} />
      </div>
    </>
  );
}

function BandLegendItem({ band, n }: { band: ClaimBand; n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: BAND[band] }} />
      <span>{`${n} ${CLAIM_BAND_LABELS[band].toLowerCase()}`}</span>
    </div>
  );
}

function Stat({ data }: { data: GraphCardData }) {
  const { centre, summary } = data;
  if (centre.kind === 'claim') {
    const verdict = shownVerdict(centre.counts);
    const n = total(centre.counts);
    if (!verdict)
      return (
        <span style={{ fontSize: 26, color: '#bdbdbd' }}>
          {n ? responsesSoFar(n) : 'No responses yet  ·  Agree or disagree on Geo'}
        </span>
      );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 52, fontWeight: 500, color: '#fff' }}>{`${verdict.percent}%`}</span>
          <span style={{ fontSize: 26, color: '#d6d6d6' }}>{`agree  ·  ${n} responses`}</span>
        </div>
        <div style={{ display: 'flex', width: 500, height: 10, borderRadius: 10, background: 'rgba(255,255,255,.14)' }}>
          <div
            style={{
              width: (500 * verdict.percent) / 100,
              height: 10,
              borderRadius: 10,
              background: BAND[verdict.band],
            }}
          />
        </div>
        <span style={{ fontSize: 22, color: BAND_TEXT[verdict.band] }}>{CLAIM_BAND_LABELS[verdict.band]}</span>
      </div>
    );
  }
  if (summary && summary.claims.length > 0) {
    // Same threshold as the claims: only claims with enough responses carry a band.
    const banded = summary.claims.filter(claim => claim.positive + claim.negative >= MIN_RESPONSES_FOR_PERCENT);
    const bands = { agreed: 0, contested: 0, rejected: 0 };
    for (const claim of banded) bands[claim.band]++;
    if (banded.length === 0)
      return (
        <span style={{ fontSize: 26, color: '#e6e6e6' }}>
          {`${summary.claims.length} ${summary.claims.length === 1 ? 'claim has' : 'claims have'} responses so far`}
        </span>
      );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 26, color: '#e6e6e6' }}>
          {`${banded.length} ${banded.length === 1 ? 'claim' : 'claims'} with ${MIN_RESPONSES_FOR_PERCENT}+ responses`}
        </span>
        <div style={{ display: 'flex', width: 500, height: 12, borderRadius: 12, overflow: 'hidden' }}>
          {(['agreed', 'contested', 'rejected'] as const)
            .filter(band => bands[band])
            .map(band => (
              <div
                key={band}
                style={{ width: (500 * bands[band]) / banded.length, height: 12, background: BAND[band] }}
              />
            ))}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 20, color: '#bdbdbd' }}>
          {(['agreed', 'contested', 'rejected'] as const).map(band => (
            <BandLegendItem key={band} band={band} n={bands[band]} />
          ))}
        </div>
      </div>
    );
  }
  const chips = [...data.kindCounts].sort((a, b) => b.n - a.n).slice(0, 3);
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: 520 }}>
      {chips.map(chip => (
        <div
          key={chip.kind}
          style={{
            display: 'flex',
            padding: '6px 16px',
            borderRadius: 999,
            fontSize: 22,
            background: 'rgba(255,255,255,.1)',
            color: '#e6e6e6',
          }}
        >
          {kindChipLabel(chip)}
        </div>
      ))}
    </div>
  );
}

export function eyebrowFor(data: GraphCardData) {
  return data.isTopicCentre || !data.topic
    ? data.centre.typeLabel
    : `${data.centre.typeLabel}  ·  in ${data.topic.name}`;
}

export function GraphCard({ data }: { data: GraphCardData }) {
  const { centre } = data;
  const isClaim = centre.kind === 'claim';
  // `measureTextWidth` reads ~25% wide for Calibre, so the fit gets the matching width; Satori wraps.
  const fitWidth = TITLE_WIDTH / CALIBRE_WIDTH_RATIO;
  const title = isClaim
    ? fitWrappedText(centre.name, 46, 31, fitWidth, 5, centre.name, { lineHeight: 1.05 })
    : fitWrappedText(centre.name, 68, 42, fitWidth, 3, centre.name, { lineHeight: 1.05 });
  const showDescription = !isClaim && centre.description && title.lines.length <= 2;
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        fontFamily: 'Calibre',
        backgroundImage: STAGE,
      }}
    >
      <Stars seed={centre.id} />
      <Constellation data={data} />
      {/* The text column sits on the stage, not on nodes. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 640,
          height: CARD_H,
          display: 'flex',
          backgroundImage:
            'linear-gradient(90deg, rgba(10,10,12,.96) 0%, rgba(10,10,12,.9) 78%, rgba(10,10,12,0) 100%)',
        }}
      />
      {/* Bottom 104px stays clear: X draws its domain overlay there. */}
      <div
        style={{
          position: 'absolute',
          left: 56,
          top: 44,
          bottom: 104,
          width: 530,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#e6e6e6', fontSize: 26, fontWeight: 500 }}
          >
            <GeoMark size={28} color="#e6e6e6" />
            <span>Geo</span>
            <span style={{ color: '#8a8a8a', fontWeight: 400 }}>· Connections</span>
          </div>
          <span style={{ fontSize: 22, color: GOLD, fontWeight: 500, marginTop: 18 }}>{eyebrowFor(data)}</span>
          <div
            style={{
              display: 'block',
              width: TITLE_WIDTH,
              color: '#fff',
              fontWeight: 500,
              fontSize: title.fontSize,
              lineHeight: 1.05,
              lineClamp: isClaim ? 5 : 3,
            }}
          >
            {centre.name}
          </div>
          {showDescription ? (
            <div
              style={{
                display: 'block',
                fontSize: 25,
                color: '#a8a8a8',
                lineHeight: 1.25,
                lineClamp: title.lines.length === 1 ? 3 : 2,
                marginTop: 4,
              }}
            >
              {centre.description}
            </div>
          ) : null}
        </div>
        <Stat data={data} />
      </div>
    </div>
  );
}

export function generateGraphCardResponse(data: GraphCardData) {
  return ogImageToJpeg(
    new ImageResponse(<GraphCard data={data} />, { width: CARD_W, height: CARD_H, fonts: calibreOgFonts })
  );
}
