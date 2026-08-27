/**
 * Plain-markdown agenda draft parsing — matches curator's own agenda editor
 * (a textarea, not a rich block editor). Blocks split on blank lines; each
 * block gets a fresh fractional-index position on serialize so ordering
 * always matches the textarea's top-to-bottom order.
 */
import { Position } from '@geoprotocol/geo-sdk/lite';

import { OccurrenceAgendaBlock } from './types';

/** Split a textarea's raw text into positioned blocks on blank-line boundaries. */
export function parseAgendaText(text: string): OccurrenceAgendaBlock[] {
  const chunks = text
    .split(/\n\s*\n/)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);

  let position: string | null = null;
  return chunks.map(markdown => {
    position = Position.generateBetween(position, null);
    return { name: '', markdown, position };
  });
}

/** Join agenda blocks back into a single textarea string, in position order. */
export function serializeAgendaBlocks(blocks: OccurrenceAgendaBlock[]): string {
  return [...blocks]
    .sort((a, b) => Position.compare(a.position, b.position))
    .map(b => b.markdown)
    .join('\n\n');
}
