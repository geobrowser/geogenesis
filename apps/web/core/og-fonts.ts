import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readFontData(fileName: string): ArrayBuffer {
  const candidates = [
    join(process.cwd(), `public/fonts/${fileName}`),
    join(process.cwd(), `apps/web/public/fonts/${fileName}`),
  ];
  const filePath = candidates.find(candidate => existsSync(candidate));
  if (!filePath) throw new Error(`OG font file not found: ${fileName}`);
  const data = readFileSync(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

// Satori cannot read WOFF2. These TTFs are decompressed copies of the app's Calibre files.
export const calibreOgFonts = [
  { name: 'Calibre', data: readFontData('calibre-regular.ttf'), weight: 400 as const, style: 'normal' as const },
  { name: 'Calibre', data: readFontData('calibre-medium.ttf'), weight: 500 as const, style: 'normal' as const },
];
