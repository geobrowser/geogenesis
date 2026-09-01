import * as React from 'react';

import { ImageResponse } from 'next/og';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GeoLogoIcon, initials, seedHue } from '~/core/blocks/ranking/ranking-og-image';

import { CLAIM_MEASURE_PX, claimLineHeight, fitClaimToBand } from './debate-og-claim-fit';

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

/**
 * Card geometry, exported so the symmetry can be asserted rather than eyeballed.
 *
 * Two rounds of review have gone on where the divider sits, so where it sits is asserted rather
 * than eyeballed: the band is centred where it crosses the *top* edge of the block, and the VS
 * badge is centred on the white bar's right edge. Both are choices among near-neighbours that a
 * later edit could quietly undo — see `SEAM_X` and `BADGE_CENTRE_X` for why each was made.
 */
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
  /** Centre of the band at mid-height, which is *not* where it is centred — see `SEAM_X`. */
  get bandCentre() {
    return SEAM_X + DIVIDER_W / 2;
  },
  /** Centre of the band where it crosses the top edge of the block. This is the centred one. */
  get topCrossingCentre() {
    return SEAM_X + LEAN / 2 + DIVIDER_W / 2;
  },
  /** Right edge of the white bar, which the VS badge is centred on. */
  get badgeCentre() {
    return BADGE_CENTRE_X;
  },
  get badgeCentreY() {
    return BADGE_CENTRE_Y;
  },
  get badgeRadius() {
    return BADGE_R;
  },
  /** The white bar's right edge at a given height in the block — the line the badge sits on. */
  whiteBarRightEdgeAt(y: number) {
    return SEAM_X + DIVIDER_WHITE_W + ((SEAM_Y - y) / VIDEO_H) * LEAN;
  },
  /** The two bars of the divider, as offsets from the seam. Must tile the gap exactly. */
  get bars() {
    return [
      { offset: 0, width: DIVIDER_WHITE_W },
      { offset: DIVIDER_WHITE_W, width: DIVIDER_BLACK_W },
    ];
  },
};

const CARD_W = 1200;
const CARD_H = 630;
const CLAIM_BAND_H = 210;
const VIDEO_H = 352;
const FOOTER_H = 68;
const SIDE_MARGIN = 32;
const BLOCK_W = CARD_W - SIDE_MARGIN * 2; // 1136, and the claim measure too

const TEXT = '#202020';
const CHROME = '#111111';
const DIVIDER = '#F0F0F0';
const RADIUS_XL = 16;

/**
 * The divider, in coordinates local to the video block.
 *
 * From the design: a 15px white band then a 17px black one, leaning 40px horizontally across the
 * block's 352px height, top edge to the right of the bottom edge. The two panel edges are therefore
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
 * The band leans 40px, so "centred" has to name a height, and the two candidates are 20px apart.
 * It is centred where it crosses the **top** edge of the block: that is the crossing the eye
 * checks, sitting directly under the claim and against white on both sides, and it is roughly
 * where the design puts it (the artboard's band crosses the top at 572..604 against a card centre
 * of 600). Centring at mid-height instead is what carried the top crossing 20px right and read as
 * the whole split leaning off to the right of the card.
 *
 * The cost is that the panels are no longer exactly equal — the lean now falls entirely left of
 * centre, so the left panel averages 40px narrower. The design carries the same asymmetry and more
 * of it, so this is the direction it wants; what it cannot become again is the 64px difference
 * review caught, which came from hardcoding an edge rather than deriving one.
 */
const SEAM_X = BLOCK_W / 2 - DIVIDER_W / 2 - LEAN / 2;
/**
 * Where the VS badge is centred: on the **right edge of the white bar**.
 *
 * The band leans, so no single x holds the line through the whole badge — the badge can only be
 * centred on the line at its own height, and the lean then carries the line about 6px either way
 * where it enters the badge and where it leaves. Sitting the badge on the white bar's right edge is
 * what makes those two offsets symmetric.
 *
 * The black bar's centre, 8.5px right of here, does not: the line arrived at the top of the badge
 * near enough flush and left the bottom 15px to its left, which read as the divider sliding out
 * from under the badge on its way down rather than as a lean.
 */
const BADGE_CENTRE_X = SEAM_X + DIVIDER_WHITE_W;
const SEAM_Y = VIDEO_H / 2;
const BADGE_R = 54;
/** The badge sits on the pivot, which is what makes the lean's ±6px either side of it symmetric. */
const BADGE_CENTRE_Y = SEAM_Y;
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

/**
 * Geist only, deliberately.
 *
 * The design asks for Calibre Medium on every piece of UI text, but Calibre ships in this repo as
 * `.woff2` alone and Satori cannot load that format. The existing ranking card registers no Calibre
 * for the same reason. Geist Medium stands in until a `.ttf`/`.otf` cut exists — tracked on the
 * ticket rather than silently substituted.
 */
const debateFonts = [
  { name: 'Geist', data: readFontData('Geist-Bold.ttf'), weight: 700 as const, style: 'normal' as const },
  { name: 'Geist', data: readFontData('Geist-Medium.ttf'), weight: 500 as const, style: 'normal' as const },
];

/**
 * One bar of the two-tone divider, leaning with the panels.
 *
 * `offset` is measured rightward from `SEAM_X`, because that is the direction the gap between the
 * clipped panels runs — they meet at `SEAM_X..SEAM_X + DIVIDER_W`. Measuring leftward instead put
 * the whole band 32px off: the black bar read as the split while the VS badge sat at the real one,
 * the white bar covered a strip of the left speaker, and bare background showed before the right
 * panel began — which looked like three separate problems and was one.
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

function SpeakerPill({ speaker }: { speaker: DebateOgSpeaker }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 14,
        bottom: 14,
        display: 'flex',
        alignItems: 'center',
        height: 40,
        borderRadius: 9999,
        background: CHROME,
        padding: '0 6px 0 5px',
        gap: 10,
      }}
    >
      {speaker.avatarSrc ? (
        <img
          src={speaker.avatarSrc}
          width={30}
          height={30}
          alt=""
          style={{ width: 30, height: 30, borderRadius: 9999, border: '2px solid rgba(255,255,255,0.42)' }}
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
            width: 30,
            height: 30,
            borderRadius: 9999,
            border: '2px solid rgba(255,255,255,0.42)',
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
      <div style={{ display: 'flex', color: '#ffffff', fontSize: 20, fontWeight: 500 }}>{speaker.name}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 26,
          borderRadius: 9999,
          background: '#ffffff',
          color: TEXT,
          padding: '0 12px',
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        {speaker.stance}
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
  /**
   * The block's outer top corner, carried by the still itself rather than by anything above it.
   *
   * It used to come from the block's own `overflow: hidden`, which {@link VideoBlock} can no longer
   * have, and then from this wrapper's `border-radius` — which drew nothing, because a radius only
   * rounds what it clips and the wrapper clips nothing: the still is an absolutely sized child that
   * simply overran the curve and left a square corner. Putting the radius on the still (and on the
   * placeholder field) rounds the pixels that actually reach that corner. The scrim and the speaker
   * pill sit at the bottom, so they never meet it.
   */
  const outerCorner = isLeft ? `${RADIUS_XL}px 0 0 0` : `0 ${RADIUS_XL}px 0 0`;

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
            height: 110,
            background: 'linear-gradient(180deg, rgba(17,17,17,0) 0%, rgba(17,17,17,0.42) 100%)',
          }}
        />
        <SpeakerPill speaker={speaker} />
      </div>
    </div>
  );
}

/**
 * The two panels, the angled two-tone divider, and the VS badge on the seam.
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
          borderRadius: `${RADIUS_XL}px ${RADIUS_XL}px 0 0`,
          overflow: 'hidden',
        }}
      >
        <Slab offset={0} width={DIVIDER_WHITE_W} background="#ffffff" />
        <Slab offset={DIVIDER_WHITE_W} width={DIVIDER_BLACK_W} background={CHROME} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: BADGE_CENTRE_X - BADGE_R,
          top: BADGE_CENTRE_Y - BADGE_R,
          width: BADGE_R * 2,
          height: BADGE_R * 2,
          borderRadius: 9999,
          background: CHROME,
          border: '11px solid #ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: 50,
          fontWeight: 700,
        }}
      >
        VS
      </div>
    </div>
  );
}

/**
 * The faint background arcs behind the claim (`#F0F0F0`, 1.5px, from the design's divider token).
 *
 * Segments of very large circles centred off-canvas, which is why they read as gentle sweeps
 * rather than curves: two concentric about a point far below the card, one near-flat horizon, and
 * a steep pair falling in from either side. Reconstructed from the artboard raster — the design
 * canvas records the token and the stroke but not the circles' centres — so the composition
 * matches rather than being transcribed, and radii are cheap to nudge.
 *
 * Clipped to the claim band. Below it the video block covers the card to within a 32px gutter, and
 * arcs surfacing in that sliver would read as a rendering artefact rather than as texture.
 */
const BACKGROUND_ARCS = [
  { cx: 450, cy: 1300, r: 1180 },
  { cx: 450, cy: 1300, r: 1420 },
  { cx: 600, cy: 4200, r: 4030 },
  { cx: -1400, cy: 900, r: 1700 },
  { cx: 2500, cy: 620, r: 1900 },
];

function BackgroundArcs() {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', width: CARD_W, height: CLAIM_BAND_H }}>
      <svg width={CARD_W} height={CLAIM_BAND_H} viewBox={`0 0 ${CARD_W} ${CLAIM_BAND_H}`} fill="none">
        {BACKGROUND_ARCS.map((arc, index) => (
          <circle key={index} cx={arc.cx} cy={arc.cy} r={arc.r} stroke={DIVIDER} strokeWidth={1.5} fill="none" />
        ))}
      </svg>
    </div>
  );
}

/**
 * The footer's play mark: a filled white disc with the triangle knocked out in the footer's own
 * black. Drawn rather than typed — the `▶` character renders as a bare triangle whose weight and
 * baseline come from whichever font Satori resolves it in, and the design is a disc.
 */
function PlayGlyph() {
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#ffffff" />
      <path d="M12.5 9.8 L23 16 L12.5 22.2 Z" fill={CHROME} />
    </svg>
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
      }}
    >
      <BackgroundArcs />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: CLAIM_BAND_H,
          width: CLAIM_MEASURE_PX,
          margin: `0 ${SIDE_MARGIN}px`,
          color: TEXT,
          fontWeight: 700,
          fontSize: claim.fontSize,
          letterSpacing: '-0.022em',
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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: FOOTER_H,
          background: CHROME,
          color: '#ffffff',
          gap: 12,
        }}
      >
        <PlayGlyph />
        <div style={{ display: 'flex', fontSize: 27, fontWeight: 500 }}>Watch the debate on</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {/* The real mark, shared with the ranking card so the two lockups cannot drift. */}
          <GeoLogoIcon size={24} color="#ffffff" />
          <div style={{ display: 'flex', fontSize: 27, fontWeight: 500 }}>Geo</div>
        </div>
      </div>
    </div>
  );
}

export function generateDebateOgImageResponse(data: DebateOgCardData) {
  return new ImageResponse(<Card data={data} />, { width: CARD_W, height: CARD_H, fonts: debateFonts });
}
