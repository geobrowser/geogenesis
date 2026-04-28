import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { Environment } from '~/core/environment';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { graphql } from '~/core/io/subgraph/graphql';

type InitialSpaceRow = {
  id: string;
  name: string;
  image: string | null;
};

type SpaceScoresResult = {
  spaceScores: { spaceId: string }[] | null;
};

async function fetchScoredSpaceIds(): Promise<string[]> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<SpaceScoresResult>({
        endpoint: Environment.getConfig().api,
        query: `query DataBlockInitialSpaceScores {
          spaceScores(orderBy: SCORE_DESC, first: 50) {
            spaceId
          }
        }`,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error('Failed to fetch scored spaces for data block scope dropdown:', result.left);
    return [];
  }

  return result.right.spaceScores?.map(row => row.spaceId) ?? [];
}

async function fetchScoredSpaces(spaceIds: string[]): Promise<Space[]> {
  if (spaceIds.length === 0) return [];

  const result = await Effect.runPromise(Effect.either(getSpaces({ spaceIds, limit: spaceIds.length })));

  if (Either.isLeft(result)) {
    console.error('Failed to hydrate scored spaces for data block scope dropdown:', result.left);
    return [];
  }

  return result.right;
}

export async function GET() {
  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  const memberSpaceId = cookieWallet ? await resolveMemberSpaceFromWalletSafe(cookieWallet) : null;

  const browse = await fetchBrowseSidebarData(memberSpaceId);
  const scoredSpaceIds = await fetchScoredSpaceIds();
  const scoredSpaces = await fetchScoredSpaces(scoredSpaceIds);
  const scoredSpacesById = new Map(scoredSpaces.map(space => [space.id, space]));
  const scoredRows = scoredSpaceIds.flatMap(spaceId => {
    const space = scoredSpacesById.get(spaceId);
    if (!space) return [];

    return [
      {
        id: space.id,
        name: space.entity.name ?? space.id.slice(0, 8),
        image: space.entity.image,
      },
    ];
  });

  const ordered = [...browse.editorOf, ...browse.memberOf, ...scoredRows];

  const spaces = ordered
    .filter((row, index) => ordered.findIndex(r => r.id === row.id) === index)
    .map<InitialSpaceRow>(row => ({
      id: row.id,
      name: row.name,
      image: row.image,
    }));

  return NextResponse.json({ spaces });
}
