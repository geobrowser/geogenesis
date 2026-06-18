import * as React from 'react';

import { ImageResponse } from 'next/og';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LIGHTHOUSE_GATEWAY_READ_PATH, PINATA_GATEWAY_READ_PATH, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getImagePath } from '~/core/utils/utils';

import type { RankingOgCardData, RankingOgEntryData } from './ranking-og-data';
import { RANKING_OG_IMAGE_CONTENT_TYPE, RANKING_OG_VARIANT_SIZES, type RankingOgVariant } from './ranking-og-storage';

const purple = '#5B19FF';
const ink = '#111111';
const line = '#D9D9D9';

const RANKING_OG_DESIGN_VARIANT_SIZES: Record<RankingOgVariant, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
};

function scaleForVariant(variant: RankingOgVariant): number {
  return RANKING_OG_VARIANT_SIZES[variant].width / RANKING_OG_DESIGN_VARIANT_SIZES[variant].width;
}

function scaled(value: number, scale: number): number {
  return Math.round(value * scale);
}

function scaledBorder(width: number, scale: number, color: string): string {
  return `${Math.max(1, scaled(width, scale))}px solid ${color}`;
}

function readPublicImageSrc(fileName: string, contentType: string): string | null {
  const normalizedFileName = fileName.replace(/^\/+/, '');
  const candidates = [
    join(process.cwd(), `public/${normalizedFileName}`),
    join(process.cwd(), `apps/web/public/${normalizedFileName}`),
  ];
  const filePath = candidates.find(candidate => existsSync(candidate));
  if (!filePath) return null;
  return `data:${contentType};base64,${readFileSync(filePath).toString('base64')}`;
}

function readStaticFontData(fileName: string): ArrayBuffer {
  const candidates = [
    join(process.cwd(), `public/fonts/${fileName}`),
    join(process.cwd(), `apps/web/public/fonts/${fileName}`),
  ];
  const filePath = candidates.find(candidate => existsSync(candidate));
  if (!filePath) throw new Error(`Ranking OG font file not found: ${fileName}`);

  const data = readFileSync(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

const placeholderThumbnailSrc = readPublicImageSrc(PLACEHOLDER_SPACE_IMAGE, 'image/png');

const geistFonts = [
  {
    name: 'Geist',
    data: readStaticFontData('Geist-Bold.ttf'),
    weight: 700 as const,
    style: 'normal' as const,
  },
  {
    name: 'Geist',
    data: readStaticFontData('Geist-ExtraBold.ttf'),
    weight: 800 as const,
    style: 'normal' as const,
  },
];

// Only these hosts (our IPFS gateways) may be fetched by Satori
const ALLOWED_IMAGE_HOSTS = new Set(
  [PINATA_GATEWAY_READ_PATH, LIGHTHOUSE_GATEWAY_READ_PATH]
    .map(base => {
      try {
        return new URL(base).host;
      } catch {
        return null;
      }
    })
    .filter((host): host is string => Boolean(host))
);

// next/og (Satori) can only fetch http(s) or data: images.
function toRenderableImageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const resolved = getImagePath(value);
  if (resolved.startsWith('data:')) return resolved;
  try {
    const url = new URL(resolved);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && ALLOWED_IMAGE_HOSTS.has(url.host)) {
      return resolved;
    }
  } catch {
    // Not an absolute URL — not renderable by Satori.
  }
  return null;
}

function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  return (parts[0]?.[0] ?? 'G') + (parts[1]?.[0] ?? '');
}

function seedHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/).find(Boolean)?.replace(/^@+/, '') || 'My';
}

function possessiveName(name: string): string {
  const first = firstName(name);
  if (first === 'My') return 'My';
  return first.endsWith('s') || first.endsWith('S') ? `${first}'` : `${first}'s`;
}

function characterWidthRatio(character: string): number {
  if (character === ' ') return 0.28;
  if ("'!.,:;|".includes(character)) return 0.24;
  if ('ilI[]()'.includes(character)) return 0.31;
  if ('fjrt'.includes(character)) return 0.42;
  if ('mwMW@#%&'.includes(character)) return 0.88;
  if (/[A-Z]/.test(character)) return 0.68;
  if (/[0-9]/.test(character)) return 0.58;
  return 0.54;
}

function measureTextWidth(text: string, fontSize: number): number {
  const nominalWidth =
    Array.from(text).reduce((width, character) => width + characterWidthRatio(character), 0) * fontSize;
  return Math.ceil(nominalWidth * 1.1);
}

function fitTextToWidth(text: string, targetFontSize: number, minFontSize: number, maxWidth: number): number {
  let fontSize = targetFontSize;
  while (fontSize > minFontSize && measureTextWidth(text, fontSize) > maxWidth) {
    fontSize -= 1;
  }
  return fontSize;
}

type SingleLineTextFit = {
  fontSize: number;
  text: string;
};

type WrappedTextFit = {
  fontSize: number;
  lines: string[];
};

function normalizeDisplayText(text: string, fallback: string): string {
  return text.replace(/\s+/g, ' ').trim() || fallback;
}

function truncateTextToWidth(text: string, fontSize: number, maxWidth: number): string {
  const normalized = text.trim();
  if (measureTextWidth(normalized, fontSize) <= maxWidth) return normalized;

  const suffix = '...';
  const characters = Array.from(normalized);
  while (characters.length > 0 && measureTextWidth(`${characters.join('').trimEnd()}${suffix}`, fontSize) > maxWidth) {
    characters.pop();
  }

  return characters.length > 0 ? `${characters.join('').trimEnd()}${suffix}` : suffix;
}

function fitSingleLineText(
  text: string,
  targetFontSize: number,
  minFontSize: number,
  maxWidth: number,
  fallback: string
): SingleLineTextFit {
  const normalized = normalizeDisplayText(text, fallback);
  const fontSize = fitTextToWidth(normalized, targetFontSize, minFontSize, maxWidth);

  return {
    fontSize,
    text: truncateTextToWidth(normalized, fontSize, maxWidth),
  };
}

function wrapTextToLines(text: string, fontSize: number, maxWidth: number): string[] {
  const words = normalizeDisplayText(text, '').split(' ').filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || measureTextWidth(nextLine, fontSize) <= maxWidth) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

function fitWrappedText(
  text: string,
  targetFontSize: number,
  minFontSize: number,
  maxWidth: number,
  maxLines: number,
  fallback: string
): WrappedTextFit {
  const normalized = normalizeDisplayText(text, fallback);

  for (let fontSize = targetFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lines = wrapTextToLines(normalized, fontSize, maxWidth);
    const allLinesFit = lines.every(lineText => measureTextWidth(lineText, fontSize) <= maxWidth);
    if (lines.length <= maxLines && allLinesFit) return { fontSize, lines };
  }

  const wrappedLines = wrapTextToLines(normalized, minFontSize, maxWidth);
  const lines = wrappedLines.slice(0, maxLines);
  if (wrappedLines.length > maxLines) {
    lines[maxLines - 1] = wrappedLines.slice(maxLines - 1).join(' ');
  }

  return {
    fontSize: minFontSize,
    lines: lines.map(lineText => truncateTextToWidth(lineText, minFontSize, maxWidth)),
  };
}

function Avatar({
  data,
  size,
  shape = 'rounded-square',
}: {
  data: RankingOgCardData;
  size: number;
  shape?: 'circle' | 'rounded-square';
}) {
  const hue = seedHue(data.author.avatarSeed);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: shape === 'circle' ? size : Math.max(4, Math.round(size * 0.14)),
    background: `linear-gradient(135deg, hsl(${hue}, 92%, 68%), hsl(${(hue + 72) % 360}, 92%, 72%))`,
    border: `${Math.max(2, Math.round(size * 0.06))}px solid rgba(255,255,255,0.42)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontSize: Math.round(size * 0.35),
    fontWeight: 700,
    overflow: 'hidden',
  };

  const avatarSrc = toRenderableImageSrc(data.author.avatarUrl);
  if (avatarSrc) {
    return <img src={avatarSrc} width={size} height={size} style={{ ...style, objectFit: 'cover' }} />;
  }

  return <div style={style}>{initials(data.author.name).toUpperCase()}</div>;
}

function GeoLogoIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.3558 14.5685C14.5064 14.824 14.4369 15.1543 14.1838 15.3089C12.9706 16.0499 11.5349 16.4784 9.99619 16.4784C8.46312 16.4784 7.0323 16.053 5.82196 15.3171C5.56819 15.1628 5.49827 14.832 5.64911 14.5761L9.51384 8.02041C9.73427 7.6465 10.2751 7.6465 10.4955 8.02041L14.3558 14.5685ZM4.94964 16.9532C4.66671 16.787 4.29709 16.8695 4.13047 17.1522L2.95809 19.1408C2.73416 19.5207 3.00801 20 3.44895 20H16.5604C17.0014 20 17.2752 19.5207 17.0513 19.1408L15.8745 17.1447C15.7077 16.8618 15.3376 16.7795 15.0546 16.9462C13.5791 17.8155 11.8478 18.3159 9.99619 18.3159C8.14957 18.3159 6.4226 17.8182 4.94964 16.9532Z"
        fill="black"
      />
      <circle
        cx="9.99613"
        cy="8.49619"
        r="7.4278"
        transform="rotate(-180 9.99613 8.49619)"
        stroke="black"
        strokeWidth="2.13675"
      />
    </svg>
  );
}

function BrandMark({ variant, scale }: { variant: RankingOgVariant; scale: number }) {
  const isStory = variant === 'story';
  const iconSize = scaled(isStory ? 63 : 37, scale);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: scaled(isStory ? 15 : 10, scale),
        color: '#111111',
        fontSize: scaled(isStory ? 65 : 41, scale),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <GeoLogoIcon size={iconSize} />
      <div>Geo</div>
    </div>
  );
}

export function resolveRankingOgEntryImageSrc(entry: RankingOgEntryData): string | null {
  return toRenderableImageSrc(entry.image) ?? placeholderThumbnailSrc;
}

function OwnerBadge({ data, variant, scale }: { data: RankingOgCardData; variant: RankingOgVariant; scale: number }) {
  const isStory = variant === 'story';
  const badgeName = possessiveName(data.author.name);
  const text = badgeName === 'My' ? 'My ranking!' : `${badgeName} ranking!`;
  const designHeight = isStory ? 92 : 70;
  const designAvatarSize = isStory ? 56 : 42;
  const designGap = isStory ? 18 : 14;
  const designLead = isStory ? 64 : 48;
  const designRightPadding = isStory ? 40 : 28;
  const targetFontSize = isStory ? 34 : 25;
  const minFontSize = isStory ? 24 : 17;
  const maxTopLength = isStory ? 650 : 430;
  const minTopLength = isStory ? 430 : 292;
  const maxTextWidth = maxTopLength - designLead - designAvatarSize / 2 - designGap - designRightPadding;
  const textFit = fitSingleLineText(text, targetFontSize, minFontSize, maxTextWidth, 'My ranking!');
  const measuredTextWidth = measureTextWidth(textFit.text, textFit.fontSize);
  const topLength = Math.min(
    maxTopLength,
    Math.max(
      minTopLength,
      Math.ceil(designLead + designAvatarSize / 2 + designGap + measuredTextWidth + designRightPadding)
    )
  );
  const avatarSize = scaled(designAvatarSize, scale);
  const angle = 12;
  const angleRadians = (angle * Math.PI) / 180;
  const topVector = { x: Math.cos(angleRadians), y: Math.sin(angleRadians) };
  const sideVector = { x: -(isStory ? 0.62 : 0.64) * designHeight, y: (isStory ? 0.78 : 0.76) * designHeight };
  const topRight = {
    x: isStory ? 1046 : 1192,
    y: Math.max(isStory ? 132 : 96, Math.ceil((isStory ? 24 : 10) + topLength * topVector.y)),
  };
  const topLeft = {
    x: topRight.x - topVector.x * topLength,
    y: topRight.y - topVector.y * topLength,
  };
  const bottomRight = {
    x: topRight.x + sideVector.x,
    y: topRight.y + sideVector.y,
  };
  const bottomLeft = {
    x: topLeft.x + sideVector.x,
    y: topLeft.y + sideVector.y,
  };
  const point = (pointValue: { x: number; y: number }) =>
    `${scaled(pointValue.x, scale)},${scaled(pointValue.y, scale)}`;
  const avatarCenter = {
    x: topLeft.x + topVector.x * designLead + sideVector.x * 0.42,
    y: topLeft.y + topVector.y * designLead + sideVector.y * 0.42,
  };
  const textCenter = {
    x: topLeft.x + topVector.x * (designLead + designAvatarSize / 2 + designGap) + sideVector.x * 0.46,
    y: topLeft.y + topVector.y * (designLead + designAvatarSize / 2 + designGap) + sideVector.y * 0.46,
  };
  const textBoxHeight = Math.ceil(textFit.fontSize * 1.35);
  const textBoxWidth = measuredTextWidth + (isStory ? 24 : 18);
  const textLeft = scaled(textCenter.x, scale);
  const textTop = scaled(textCenter.y - textBoxHeight / 2, scale);

  return (
    <>
      <svg
        width={RANKING_OG_VARIANT_SIZES[variant].width}
        height={RANKING_OG_VARIANT_SIZES[variant].height}
        viewBox={`0 0 ${RANKING_OG_VARIANT_SIZES[variant].width} ${RANKING_OG_VARIANT_SIZES[variant].height}`}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
        }}
      >
        <polygon
          points={`${point(topLeft)} ${point(topRight)} ${point(bottomRight)} ${point(bottomLeft)}`}
          fill="#8F44FF"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: scaled(avatarCenter.x - designAvatarSize / 2, scale),
          top: scaled(avatarCenter.y - designAvatarSize / 2, scale),
          width: avatarSize,
          height: avatarSize,
          display: 'flex',
        }}
      >
        <Avatar data={data} size={avatarSize} shape="circle" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: textLeft,
          top: textTop,
          width: scaled(textBoxWidth, scale),
          height: scaled(textBoxHeight, scale),
          display: 'flex',
          alignItems: 'center',
          transform: `rotate(${angle}deg)`,
          transformOrigin: 'left center',
        }}
      >
        <div
          style={{
            color: '#FFFFFF',
            fontSize: scaled(textFit.fontSize, scale),
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {textFit.text}
        </div>
      </div>
    </>
  );
}

function Background() {
  return <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }} />;
}

function imageDimensions(index: number, variant: RankingOgVariant, scale: number) {
  const { width, height } = imageDesignDimensions(index, variant);
  return {
    width: scaled(width, scale),
    height: scaled(height, scale),
  };
}

function imageDesignDimensions(index: number, variant: RankingOgVariant) {
  const isStory = variant === 'story';
  const widths = isStory ? [380, 314, 252, 204, 166] : [286, 226, 176, 134, 112];
  return {
    width: widths[index] ?? widths[widths.length - 1],
    height: isStory ? 132 : 74,
  };
}

function fitEntryNameText(name: string, index: number, variant: RankingOgVariant): SingleLineTextFit {
  const isStory = variant === 'story';
  const image = imageDesignDimensions(index, variant);
  const listWidth = isStory ? 890 : 790;
  const numberWidth = isStory ? 104 : 80;
  const imageMarginLeft = isStory ? 30 : 24;
  const nameMarginLeft = isStory ? 46 : 60;
  const maxWidth = listWidth - numberWidth - imageMarginLeft - image.width - nameMarginLeft;

  return fitSingleLineText(name, isStory ? 82 : 56, isStory ? 42 : 30, maxWidth, 'Untitled');
}

function EntryImage({
  entry,
  index,
  variant,
  scale,
}: {
  entry: RankingOgEntryData;
  index: number;
  variant: RankingOgVariant;
  scale: number;
}) {
  const src = resolveRankingOgEntryImageSrc(entry);
  const { width, height } = imageDimensions(index, variant, scale);

  if (src) {
    return (
      <img
        src={src}
        width={width}
        height={height}
        style={{
          width,
          height,
          borderRadius: scaled(variant === 'story' ? 8 : 6, scale),
          overflow: 'hidden',
          flexShrink: 0,
          objectFit: 'cover',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width,
        height,
        borderRadius: scaled(variant === 'story' ? 8 : 6, scale),
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: Math.round(height * 0.36),
        fontWeight: 800,
        background: `linear-gradient(135deg, ${purple}, #FF78E6)`,
      }}
    >
      {initials(entry.name).toUpperCase()}
    </div>
  );
}

function EntryRow({
  entry,
  index,
  variant,
  scale,
}: {
  entry: RankingOgEntryData;
  index: number;
  variant: RankingOgVariant;
  scale: number;
}) {
  const isStory = variant === 'story';
  const rowHeight = scaled(isStory ? 224 : 100, scale);
  const nameFit = fitEntryNameText(entry.name, index, variant);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: rowHeight,
        borderBottom: index < 4 ? scaledBorder(1, scale, line) : '0px solid transparent',
      }}
    >
      <div
        style={{
          width: scaled(isStory ? 104 : 80, scale),
          color: '#111111',
          fontSize: scaled(isStory ? 98 : 62, scale),
          lineHeight: 0.9,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexShrink: 0,
        }}
      >
        {index + 1}
      </div>
      <div style={{ display: 'flex', flexShrink: 0, marginLeft: scaled(isStory ? 30 : 24, scale) }}>
        <EntryImage entry={entry} index={index} variant={variant} scale={scale} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          marginLeft: scaled(isStory ? 46 : 60, scale),
        }}
      >
        <div
          style={{
            color: ink,
            fontSize: scaled(nameFit.fontSize, scale),
            fontWeight: 800,
            lineHeight: 0.92,
            maxHeight: scaled(isStory ? 152 : 58, scale),
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {nameFit.text}
        </div>
      </div>
    </div>
  );
}

function EmptyRows({ variant, scale }: { variant: RankingOgVariant; scale: number }) {
  const isStory = variant === 'story';
  const textFit = fitWrappedText(
    'This ranking is ready for its first picks.',
    isStory ? 52 : 30,
    isStory ? 32 : 22,
    isStory ? 760 : 420,
    2,
    'This ranking is ready.'
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: scaled(isStory ? 760 : 300, scale),
        alignItems: 'flex-start',
        justifyContent: 'center',
        color: '#111111',
        fontSize: scaled(textFit.fontSize, scale),
        fontWeight: 700,
        lineHeight: 1.05,
        textAlign: 'left',
      }}
    >
      {textFit.lines.map((lineText, index) => (
        <div key={`${lineText}-${index}`} style={{ display: 'flex' }}>
          {lineText}
        </div>
      ))}
    </div>
  );
}

function TitleText({ title, variant, scale }: { title: string; variant: RankingOgVariant; scale: number }) {
  const isStory = variant === 'story';
  const textFit = fitWrappedText(title, isStory ? 112 : 58, isStory ? 58 : 34, isStory ? 680 : 318, 3, 'My ranking');

  return (
    <div
      style={{
        color: '#111111',
        display: 'flex',
        flexDirection: 'column',
        fontSize: scaled(textFit.fontSize, scale),
        fontWeight: 800,
        lineHeight: 0.95,
      }}
    >
      {textFit.lines.map((lineText, index) => (
        <div key={`${lineText}-${index}`} style={{ display: 'flex' }}>
          {lineText}
        </div>
      ))}
    </div>
  );
}

function Card({ data, variant }: { data: RankingOgCardData; variant: RankingOgVariant }) {
  const isStory = variant === 'story';
  const size = RANKING_OG_VARIANT_SIZES[variant];
  const scale = scaleForVariant(variant);
  const entries = data.entries.slice(0, 5);

  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        position: 'relative',
        display: 'flex',
        overflow: 'hidden',
        background: '#FFFFFF',
        color: ink,
        fontFamily: 'Geist',
      }}
    >
      <Background />
      {data.kind !== 'global' ? <OwnerBadge data={data} variant={variant} scale={scale} /> : null}
      <div
        style={{
          position: 'absolute',
          left: scaled(isStory ? 78 : 52, scale),
          top: scaled(isStory ? 154 : 64, scale),
          width: scaled(isStory ? 680 : 318, scale),
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            color: '#111111',
            display: 'flex',
            maxHeight: scaled(isStory ? 330 : 190, scale),
            overflow: 'hidden',
          }}
        >
          <TitleText title={data.title} variant={variant} scale={scale} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: scaled(isStory ? 110 : 384, scale),
          top: scaled(isStory ? 560 : 114, scale),
          width: scaled(isStory ? 890 : 790, scale),
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {entries.length > 0 ? (
            entries.map((entry, index) => (
              <EntryRow key={entry.entityId} entry={entry} index={index} variant={variant} scale={scale} />
            ))
          ) : (
            <EmptyRows variant={variant} scale={scale} />
          )}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: scaled(isStory ? 78 : 52, scale),
          bottom: scaled(isStory ? 132 : 116, scale),
          display: 'flex',
        }}
      >
        <BrandMark variant={variant} scale={scale} />
      </div>
    </div>
  );
}

export function generateRankingOgImageResponse(data: RankingOgCardData, variant: RankingOgVariant) {
  return new ImageResponse(<Card data={data} variant={variant} />, {
    ...RANKING_OG_VARIANT_SIZES[variant],
    fonts: geistFonts,
    headers: {
      'Content-Type': RANKING_OG_IMAGE_CONTENT_TYPE,
    },
  });
}
