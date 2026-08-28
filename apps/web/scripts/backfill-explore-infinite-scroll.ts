#!/usr/bin/env bun
import { type GeoWalletClient, generateZeroDevAccount } from '@geogenesis/auth/account';
import { defineGeoNetworkConfig } from '@geoprotocol/geo-sdk';
import type { Op } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';

import { getSpaceAccess } from '~/core/access/space-access';
import {
  type ExploreBlockRelation,
  type ExploreInfiniteScrollBackfillItem,
  buildExploreInfiniteScrollBackfillPlan,
  buildExploreInfiniteScrollBackfillValues,
} from '~/core/blocks/data/explore-infinite-scroll-backfill';
import { fetchExploreBlockRelationsForBackfill } from '~/core/blocks/data/fetch-explore-blocks-for-backfill';
import { Environment } from '~/core/environment';
import { getSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { GEO_NETWORK } from '~/core/sdk/geo-network';
import { Publish } from '~/core/utils/publish';

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

function readRelationsFromFile(inputPath: string): ExploreBlockRelation[] {
  const parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Input must be a JSON array');
  return parsed as ExploreBlockRelation[];
}

async function loadRelations(): Promise<ExploreBlockRelation[]> {
  if (hasArg('--fetch')) {
    const api = argValue('--api') ?? Environment.getConfig().api;
    return fetchExploreBlockRelationsForBackfill(api);
  }

  const inputPath = argValue('--input');
  if (!inputPath) {
    throw new Error('Pass --fetch to query the API, or --input <json-file>');
  }
  return readRelationsFromFile(inputPath);
}

async function prepareOpsForSpace(spaceId: string, items: readonly ExploreInfiniteScrollBackfillItem[]) {
  const values = buildExploreInfiniteScrollBackfillValues(items);
  return Effect.runPromise(Publish.prepareLocalDataForPublishing(values, [], spaceId));
}

async function publishSpaceEdit({
  spaceId,
  ops,
  smartAccount,
  authorSpaceId,
}: {
  spaceId: string;
  ops: Op[];
  smartAccount: GeoWalletClient;
  authorSpaceId: string;
}): Promise<{ status: 'published' | 'proposed' | 'not_editor' | 'empty'; hash?: string }> {
  if (ops.length === 0) return { status: 'empty' };

  const space = await Effect.runPromise(getSpace(spaceId));
  if (!space) throw new Error(`Space ${spaceId} could not be loaded`);

  const access = await Effect.runPromise(getSpaceAccess(space, authorSpaceId));
  if (!access.isEditor) return { status: 'not_editor' };

  const name = 'Backfill: Infinite scroll on Explore blocks';

  if (space.type === 'PERSONAL') {
    const result = await geo.personalSpaces.publishEdit({
      name,
      spaceId,
      ops,
      author: authorSpaceId,
    });
    const hash = await smartAccount.sendUserOperation({
      calls: [{ to: result.to, value: 0n, data: result.calldata }],
    });
    return { status: 'published', hash };
  }

  const proposal = await geo.daoSpaces.proposeEdit({
    name,
    ops,
    author: authorSpaceId,
    callerSpaceId: `0x${authorSpaceId}`,
    daoSpaceId: `0x${spaceId}`,
    votingMode: 'FAST',
  });
  const hash = await smartAccount.sendUserOperation({
    calls: [{ to: proposal.to as `0x${string}`, value: 0n, data: proposal.calldata as `0x${string}` }],
  });
  return { status: 'proposed', hash };
}

async function main() {
  const relations = await loadRelations();
  const plan = buildExploreInfiniteScrollBackfillPlan(relations);

  const prepared: { spaceId: string; ops: Op[]; itemCount: number }[] = [];
  if (hasArg('--prepare-ops') || hasArg('--publish')) {
    for (const entry of plan.bySpace) {
      const ops = await prepareOpsForSpace(entry.spaceId, entry.items);
      prepared.push({ spaceId: entry.spaceId, ops, itemCount: entry.items.length });
    }
  }

  const publishResults: unknown[] = [];
  if (hasArg('--publish')) {
    const privateKey = process.env.BACKFILL_PRIVATE_KEY as `0x${string}` | undefined;
    const authorSpaceId = process.env.BACKFILL_AUTHOR_SPACE_ID;
    if (!privateKey || !authorSpaceId) {
      throw new Error('--publish needs BACKFILL_PRIVATE_KEY and BACKFILL_AUTHOR_SPACE_ID');
    }

    const rpcUrl = process.env.BACKFILL_RPC_URL;
    const network = rpcUrl
      ? defineGeoNetworkConfig({ ...GEO_NETWORK, chain: { ...GEO_NETWORK.chain!, rpcUrl } })
      : GEO_NETWORK;
    const smartAccount = await generateZeroDevAccount({
      signer: privateKeyToAccount(privateKey),
      network,
    });

    for (const entry of prepared) {
      const result = await publishSpaceEdit({
        spaceId: entry.spaceId,
        ops: entry.ops,
        smartAccount,
        authorSpaceId,
      });
      publishResults.push({ spaceId: entry.spaceId, itemCount: entry.itemCount, ...result });
    }
  }

  console.log(
    JSON.stringify(
      {
        spaces: plan.bySpace.length,
        blocks: plan.bySpace.reduce((total, entry) => total + entry.items.length, 0),
        skipped: plan.skipped.length,
        plan: plan.bySpace,
        skippedDetail: plan.skipped,
        ...(prepared.length > 0
          ? {
              prepared: prepared.map(entry => ({
                spaceId: entry.spaceId,
                itemCount: entry.itemCount,
                opCount: entry.ops.length,
              })),
            }
          : {}),
        ...(publishResults.length > 0 ? { publishResults } : {}),
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
