import * as React from 'react';

import { ImageResponse } from 'next/og';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fitWrappedText, initials, measureTextWidth, seedHue } from '~/core/blocks/ranking/ranking-og-image';

import { GeoMark } from '~/design-system/icons/geo-mark';

import { CLAIM_BAND_HEIGHT_PX, CLAIM_MEASURE_PX, claimLineHeight, fitClaimToBand } from './debate-og-claim-fit';

/**
 * The 1200x630 share card for a published debate (GEO-2755).
 *
 * Rendered through Satori (`next/og`), which implements a subset of CSS — no `clip-path`, no
 * `mask`, no `text-wrap: balance`. Every technique below is chosen inside that subset, and the
 * angled divider in particular is why: see {@link VideoBlock}.
 */

export type DebateOgSpeaker = {
  name: string;
  /** The side they argued, rendered in the pill next to their name. */
  stance: string;
  /** `https://` or `data:` only — Satori cannot fetch anything else. */
  avatarSrc?: string | null;
  /** Their still. Absent renders the placeholder field from the design. */
  stillSrc?: string | null;
};

export type DebateOgCardData = {
  claim: string;
  speakers: [DebateOgSpeaker, DebateOgSpeaker];
};

/** Geometry shared with the panel-symmetry tests. */
export const DEBATE_OG_GEOMETRY = {
  get blockWidth() {
    return BLOCK_W;
  },
  get dividerWidth() {
    return DIVIDER_W;
  },
  get seamX() {
    return SEAM_X;
  },
  get leftPanelWidth() {
    return SEAM_X + DIVIDER_W;
  },
  get rightPanelWidth() {
    return BLOCK_W - SEAM_X;
  },
  /** Centre of the band at mid-height, where it is centred on the block. */
  get bandCentre() {
    return SEAM_X + DIVIDER_W / 2;
  },
  /** Centre of the band where it crosses the top edge — 20px right of centre. See `SEAM_X`. */
  get topCrossingCentre() {
    return SEAM_X + LEAN / 2 + DIVIDER_W / 2;
  },
  /** The four panel edge widths review measures: each panel's width at the top and the bottom. */
  get panelWidths() {
    const bandLeftTop = SEAM_X + LEAN / 2;
    const bandLeftBottom = SEAM_X - LEAN / 2;
    return {
      leftTop: bandLeftTop,
      leftBottom: bandLeftBottom,
      rightTop: BLOCK_W - (bandLeftTop + DIVIDER_W),
      rightBottom: BLOCK_W - (bandLeftBottom + DIVIDER_W),
    };
  },
  /** The two slabs of the divider, as offsets from the seam. Must tile the gap exactly. */
  get bars() {
    return [
      { offset: 0, width: DIVIDER_WHITE_W },
      { offset: DIVIDER_WHITE_W, width: DIVIDER_BLACK_W },
    ];
  },
};

const CARD_W = 1200;
const CARD_H = 630;
const HEADER_H = 88;
const BRAND_OFFSET_Y = 10;
const CLAIM_BAND_H = CLAIM_BAND_HEIGHT_PX;
const SIDE_MARGIN = 32;
const VIDEO_H = CARD_H - HEADER_H - CLAIM_BAND_H - SIDE_MARGIN;
const BLOCK_W = CARD_W - SIDE_MARGIN * 2; // 1136, and the claim measure too

const TEXT = '#292929';
const CHROME = '#111111';
const DIVIDER = '#F3F3F3';
const RADIUS_XL = 24;

/**
 * The divider, in coordinates local to the video block.
 *
 * Two adjacent white slabs form the divider, leaning 40px horizontally across the
 * block's height, top edge to the right of the bottom edge. The two panel edges are therefore
 * 32px apart, and the lean is what makes this impossible to express as a straight seam — a 32px
 * band cannot cover a vertical seam across a 40px lean at every height.
 */
const DIVIDER_W = 32;
const LEAN = 40;
/** The band's two bars. Asymmetric, which is what makes its centring a choice — see `SEAM_X`. */
const DIVIDER_WHITE_W = 15;
const DIVIDER_BLACK_W = 17;
/**
 * Left edge of the divider band at mid-height, and the point the whole divider pivots about.
 *
 * This position is the one that makes the two panels **mirror images**: the top of the left panel
 * is exactly as wide as the bottom of the right (572px), and the bottom of the left exactly as
 * wide as the top of the right (532px). Each speaker gets the same trapezoid, just flipped. That
 * is the rule review settled on, and it is the only position that satisfies it — from
 * `Lt = a`, `Rb = BLOCK_W - b - DIVIDER_W` and `a - b = LEAN`, `Lt = Rb` forces
 * `a + b = BLOCK_W - DIVIDER_W`, whose midpoint is exactly this.
 *
 * It cannot also be centred where it crosses the *top* edge, and that is arithmetic rather than a
 * missed detail: top-centred needs the band's top crossing at `BLOCK_W / 2`, mirror-symmetry needs
 * it 20px to the right of that, and the gap between them is `LEAN / 2`. The two coincide only at
 * `LEAN = 0`. An earlier round asked for the top crossing and got it, at the cost of the left
 * panel being 40px narrower overall; this asks for equal panels and pays 20px of top offset.
 * Shrinking `LEAN` is the only way to buy both, and it costs the divider its lean.
 */
const SEAM_X = BLOCK_W / 2 - DIVIDER_W / 2;
const SEAM_Y = VIDEO_H / 2;
/** The speaker label's inset from its panel's edges, and its height. */
const LABEL_INSET = 24;
const LABEL_BOTTOM = 24;
const LABEL_H = 32;
/**
 * How far the divider has leaned at a given height, as an offset from its position at `SEAM_Y`.
 *
 * Positive above the pivot, negative below it, because the band's top edge sits to the right of
 * its bottom edge.
 */
function leanOffsetAt(y: number) {
  return ((SEAM_Y - y) / VIDEO_H) * LEAN;
}
/** Positive rotation is clockwise, which sends the bottom of a vertical edge left — the lean. */
const LEAN_DEG = (Math.atan2(LEAN, VIDEO_H) * 180) / Math.PI;

/**
 * Keeps a `transformOrigin` component off exactly zero.
 *
 * Satori treats `0px` there as absent and falls back to `50%`. The right panel's content starts
 * exactly on the seam, so its pivot is `0px` on the x axis, and the fallback rotated it about its
 * own centre instead — 292px away, which at this lean leaks a 33px vertical offset. The panel came
 * out whole and upright but sitting a third of the way down the block, which reads as a layout
 * mistake rather than a transform one. A hundredth of a pixel is below any rounding in the render
 * and moves the pivot back onto the seam.
 */
const ORIGIN_EPSILON = 0.01;

/** Oversized so a rotated rect still covers the block's corners. */
const SLAB_W = 2000;
const SLAB_H = 1200;

function readFontData(fileName: string): ArrayBuffer {
  const candidates = [
    join(process.cwd(), `public/fonts/${fileName}`),
    join(process.cwd(), `apps/web/public/fonts/${fileName}`),
  ];
  const filePath = candidates.find(candidate => existsSync(candidate));
  if (!filePath) throw new Error(`Debate OG font file not found: ${fileName}`);
  const data = readFileSync(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

// Satori cannot read WOFF2. These TTFs are decompressed copies of the app's Calibre files.
const debateFonts = [
  { name: 'Calibre', data: readFontData('calibre-regular.ttf'), weight: 400 as const, style: 'normal' as const },
  { name: 'Calibre', data: readFontData('calibre-medium.ttf'), weight: 500 as const, style: 'normal' as const },
];

/**
 * One slab of the white divider, leaning with the panels.
 *
 * `offset` is measured rightward from `SEAM_X`, because that is the direction the gap between the
 * clipped panels runs — they meet at `SEAM_X..SEAM_X + DIVIDER_W`.
 *
 * Every bar pivots about `SEAM_X` so the band and both panel clips lean as one rigid assembly.
 */
function Slab({ offset, width, background }: { offset: number; width: number; background: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: SEAM_X + offset,
        top: SEAM_Y - SLAB_H / 2,
        width,
        height: SLAB_H,
        background,
        transform: `rotate(${LEAN_DEG}deg)`,
        transformOrigin: `${-offset + ORIGIN_EPSILON}px ${SLAB_H / 2}px`,
      }}
    />
  );
}

function SpeakerLabel({ speaker, left }: { speaker: DebateOgSpeaker; left: number }) {
  const stanceWidth = measureTextWidth(speaker.stance, 20);
  const name = fitWrappedText(speaker.name, 22, 18, 480 - stanceWidth - 50, 1, 'Speaker');

  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: LABEL_BOTTOM,
        display: 'flex',
        alignItems: 'center',
        height: LABEL_H,
        gap: 10,
        color: '#ffffff',
        textShadow: '0 1px 4px rgba(0,0,0,0.35)',
      }}
    >
      {speaker.avatarSrc ? (
        <img
          src={speaker.avatarSrc}
          width={28}
          height={28}
          alt=""
          // `cover`, because a profile photo is almost never square and without this Satori
          // stretches it to fit — a face comes out visibly squeezed on one axis.
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            objectFit: 'cover',
            border: '1px solid rgba(255,255,255,0.45)',
          }}
        />
      ) : (
        // The design's fallback, not a plain swatch: initials over a name-seeded gradient, reusing
        // the ranking card's helpers so two OG surfaces cannot drift into different-looking
        // avatars for the same person.
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: `linear-gradient(135deg, hsl(${seedHue(speaker.name)}, 92%, 68%), hsl(${
              (seedHue(speaker.name) + 72) % 360
            }, 92%, 72%))`,
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {initials(speaker.name).toUpperCase()}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ display: 'flex', fontSize: name.fontSize, fontWeight: 400, lineHeight: 1 }}>{name.lines[0]}</div>
        <div
          style={{
            display: 'flex',
            color: '#d9d9d9',
            fontSize: Math.min(20, name.fontSize - 2),
            fontWeight: 400,
            lineHeight: 1,
          }}
        >
          {speaker.stance}
        </div>
      </div>
    </div>
  );
}

/**
 * One speaker's half of the video block, clipped along the divider.
 *
 * Satori has no `clip-path`, so the diagonal cannot be cut out of a panel directly. A rotated box
 * with `overflow: hidden` gives a real diagonal edge; the content inside is counter-rotated about
 * the same pivot so it renders upright. Both primitives are already proven in the ranking card.
 *
 * The obvious cheaper version — plain rectangles that overrun the seam, with the opaque band laid
 * over the join — does not work, and looked like it did. The band is 32px wide but leans 40px, so
 * a straight boundary is covered at one end of the lean and exposed at the other: it left 20px of
 * the right speaker showing in the left speaker's corner, which reads as the right panel simply
 * having more room.
 */
function Panel({ side, speaker }: { side: 'left' | 'right'; speaker: DebateOgSpeaker }) {
  const isLeft = side === 'left';
  // The clip box: its inner edge sits on the divider line, and it is oversized so that rotating it
  // still covers the block's corners.
  const boxLeft = isLeft ? SEAM_X - SLAB_W : SEAM_X + DIVIDER_W;
  const boxTop = SEAM_Y - SLAB_H / 2;
  // The pivot, in the box's own coordinates. Every rotated piece shares it so they lean as one.
  const pivotX = isLeft ? SLAB_W : -DIVIDER_W;
  // Where this panel's content sits, in block coordinates, then rebased into the box.
  const contentLeft = isLeft ? 0 : SEAM_X;
  const contentWidth = isLeft ? SEAM_X + DIVIDER_W : BLOCK_W - SEAM_X;
  // Clip the still and its scrim together so the bottom corners cannot leak dark square pixels.
  const outerCorner = isLeft ? `${RADIUS_XL}px 0 0 ${RADIUS_XL}px` : `0 ${RADIUS_XL}px ${RADIUS_XL}px 0`;
  /**
   * Where the speaker label starts, inside this panel's content box.
   *
   * The left panel measures from the card edge, so a flat inset is right. The right panel measures
   * from the *divider*, which leans — and its content box starts at `SEAM_X`, back under the band,
   * so a flat inset put the label within a couple of pixels of the line. It is measured from the
   * band's right edge at the label's own top, which is the closest the two come over the label's
   * height (the band moves right as it rises).
   */
  const labelLeft = isLeft ? LABEL_INSET : DIVIDER_W + leanOffsetAt(VIDEO_H - LABEL_BOTTOM - LABEL_H) + LABEL_INSET;

  return (
    <div
      style={{
        position: 'absolute',
        left: boxLeft,
        top: boxTop,
        width: SLAB_W,
        height: SLAB_H,
        display: 'flex',
        overflow: 'hidden',
        transform: `rotate(${LEAN_DEG}deg)`,
        transformOrigin: `${pivotX}px ${SLAB_H / 2}px`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: contentLeft - boxLeft,
          top: 0 - boxTop,
          width: contentWidth,
          height: VIDEO_H,
          display: 'flex',
          borderRadius: outerCorner,
          overflow: 'hidden',
          transform: `rotate(${-LEAN_DEG}deg)`,
          transformOrigin: `${SEAM_X - contentLeft + ORIGIN_EPSILON}px ${SEAM_Y}px`,
        }}
      >
        {speaker.stillSrc ? (
          <img
            src={speaker.stillSrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: outerCorner }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(160deg, #e8e8e8, #cfcfcf)',
              borderRadius: outerCorner,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 130,
            background: 'linear-gradient(180deg, rgba(17,17,17,0) 0%, rgba(17,17,17,0.48) 100%)',
          }}
        />
        <SpeakerLabel speaker={speaker} left={labelLeft} />
      </div>
    </div>
  );
}

/**
 * The two speaker panels with a compact VS medallion on their shared diagonal.
 *
 * Satori has no `clip-path`, so the diagonal cannot be cut out of a panel directly. Instead the
 * divider is drawn as rotated opaque slabs laid over panels that deliberately overrun the seam:
 * each slab shares a pivot, so they lean as one rigid band and the overrun is hidden beneath it.
 * `transform: rotate` and `overflow: hidden` are both already proven in the ranking card, which is
 * why this route was chosen over pre-compositing the diagonal upstream.
 */
function VideoBlock({ speakers }: { speakers: [DebateOgSpeaker, DebateOgSpeaker] }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: BLOCK_W,
        height: VIDEO_H,
      }}
    >
      <Panel side="left" speaker={speakers[0]} />
      <Panel side="right" speaker={speakers[1]} />
      {/* The bars run far past the block so their ends never show; this is what bounds them. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: BLOCK_W,
          height: VIDEO_H,
          display: 'flex',
          borderRadius: RADIUS_XL,
          overflow: 'hidden',
        }}
      >
        <Slab offset={0} width={DIVIDER_WHITE_W} background="#ffffff" />
        <Slab offset={DIVIDER_WHITE_W} width={DIVIDER_BLACK_W} background="#ffffff" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: BLOCK_W / 2 - 38,
          top: VIDEO_H / 2 - 38,
          width: 76,
          height: 76,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 9999,
          border: '5px solid #ffffff',
          background: CHROME,
          color: '#ffffff',
          boxShadow: '0 2px 8px rgba(17,17,17,0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            transform: 'translateY(-1px)',
          }}
        >
          VS
        </div>
      </div>
    </div>
  );
}

/** Fine rays echo the network motif on the Geo landing page. */
function BackgroundRays() {
  const ends = [
    [0, 0],
    [360, 0],
    [840, 0],
    [1200, 0],
    [0, 120],
    [1200, 120],
    [0, 630],
    [1200, 630],
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', width: CARD_W, height: HEADER_H + CLAIM_BAND_H }}>
      <svg
        width={CARD_W}
        height={HEADER_H + CLAIM_BAND_H}
        viewBox={`0 0 ${CARD_W} ${HEADER_H + CLAIM_BAND_H}`}
        fill="none"
      >
        {ends.map(([x, y], index) => (
          <line
            key={index}
            x1={600}
            y1={HEADER_H / 2 + BRAND_OFFSET_Y}
            x2={x}
            y2={y}
            stroke={DIVIDER}
            strokeWidth={1}
          />
        ))}
      </svg>
    </div>
  );
}

function Card({ data }: { data: DebateOgCardData }) {
  const claim = fitClaimToBand(data.claim);
  const lineHeight = claimLineHeight(claim.fontSize);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: CARD_W,
        height: CARD_H,
        background: '#ffffff',
        fontFamily: 'Calibre',
      }}
    >
      <BackgroundRays />
      <div style={{ display: 'flex', height: HEADER_H, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            background: '#ffffff',
            color: CHROME,
            transform: `translateY(${BRAND_OFFSET_Y}px)`,
          }}
        >
          <GeoMark size={32} color={CHROME} />
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 400, letterSpacing: '-0.015em' }}>Geo Debates</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: CLAIM_BAND_H,
          flexShrink: 0,
          width: CLAIM_MEASURE_PX,
          margin: `0 ${SIDE_MARGIN}px`,
          color: TEXT,
          fontWeight: 500,
          fontSize: claim.fontSize,
          letterSpacing: '-0.022em',
          transform: 'translateY(-10px)',
        }}
      >
        {/* Pre-wrapped: Satori has no `text-wrap: balance`, so the fitter owns line breaks. */}
        {claim.lines.map((line, index) => (
          <div
            key={index}
            style={{ display: 'flex', height: lineHeight, alignItems: 'center', justifyContent: 'center' }}
          >
            {line}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', margin: `0 ${SIDE_MARGIN}px` }}>
        <VideoBlock speakers={data.speakers} />
      </div>
    </div>
  );
}

export function generateDebateOgImageResponse(data: DebateOgCardData) {
  return new ImageResponse(<Card data={data} />, { width: CARD_W, height: CARD_H, fonts: debateFonts });
}
