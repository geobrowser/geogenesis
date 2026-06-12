#!/usr/bin/env bun
import { readFileSync } from 'node:fs';

import {
  type RankingOgBackfillInput,
  buildRankingOgBackfillPlan,
  parseRankingOgVariants,
} from '../core/blocks/ranking/ranking-og-backfill';

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function readInputs(): RankingOgBackfillInput[] {
  const inputPath = argValue('--input');
  if (!inputPath) throw new Error('Missing --input <json-file>');
  const parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Input must be a JSON array');
  return parsed as RankingOgBackfillInput[];
}

async function main() {
  const inputs = readInputs();
  const variants = parseRankingOgVariants(argValue('--variants'));
  const publicBaseUrl = argValue('--public-base-url') ?? process.env.RANKING_OG_PUBLIC_BASE_URL;
  if (!publicBaseUrl) throw new Error('Missing --public-base-url or RANKING_OG_PUBLIC_BASE_URL');

  const plan = buildRankingOgBackfillPlan({ inputs, variants, publicBaseUrl });
  if (hasArg('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, items: plan }, null, 2));
    return;
  }

  const apiUrl = argValue('--api-url');
  if (!apiUrl) throw new Error('Missing --api-url for non-dry-run generation');
  const adminSecret = process.env.RANKING_OG_ADMIN_SECRET;
  if (!adminSecret) throw new Error('Missing RANKING_OG_ADMIN_SECRET');

  const uniqueInputs = [...new Map(inputs.map(input => [`${input.rankEntityId}:${input.ogVersion}`, input])).values()];
  const results = [];

  for (const input of uniqueInputs) {
    const response = await fetch(new URL('/api/ranking-og/generate', apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ranking-og-admin-secret': adminSecret,
      },
      body: JSON.stringify({
        ...input,
        variants,
      }),
    });
    results.push({
      rankEntityId: input.rankEntityId,
      ogVersion: input.ogVersion,
      status: response.status,
      body: await response.json().catch(() => null),
    });
  }

  console.log(JSON.stringify({ dryRun: false, results }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
