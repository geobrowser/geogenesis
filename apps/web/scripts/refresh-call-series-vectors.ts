/**
 * Copies geo-chat's shared schedule vectors over the web's copy, byte for byte.
 * Usage: bun scripts/refresh-call-series-vectors.ts <path to the geo-chat checkout>
 */
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const GEO_CHAT_PATH = 'crates/debates/tests/fixtures/call_series_vectors.json';
const WEB_PATH = join(import.meta.dirname, '../core/community-calls/fixtures/call_series_vectors.json');

const geoChat = process.argv[2];
if (!geoChat) {
  console.error('Usage: bun scripts/refresh-call-series-vectors.ts <path to the geo-chat checkout>');
  process.exit(1);
}

const source = join(geoChat, GEO_CHAT_PATH);
copyFileSync(source, WEB_PATH);
if (!readFileSync(source).equals(readFileSync(WEB_PATH))) throw new Error('The copy differs from its source.');
const { tzdb, cases } = JSON.parse(readFileSync(WEB_PATH, 'utf8')) as { tzdb: string; cases: unknown[] };
console.log(`Copied ${cases.length} cases (tzdb ${tzdb}) from ${source}`);
