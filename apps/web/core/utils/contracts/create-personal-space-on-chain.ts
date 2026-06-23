import { personalSpace } from '@geoprotocol/geo-sdk';

import { Duration, Effect, Schedule } from 'effect';
import { type Hex, createPublicClient, http } from 'viem';

import type { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SpaceType } from '~/core/types';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { devLog } from '../dev-log';
import { getImagePath } from '../utils';
import { EMPTY_SPACE_ID } from './dao-space-factory';
import { generateOpsForSpaceType } from './generate-ops-for-space-type';
import { SPACE_REGISTRY_ADDRESS_HEX, SpaceRegistryAbi } from './space-registry';
import { buildPersonalTopicDeclaredCalldata } from './space-topic';

/**
 * Shared on-chain creation flow for personal / personal-style spaces. Previously
 * duplicated (and drifted) between `useCreatePersonalSpace` and `createPersonalStyleSpace`.
 *
 * Three optimizations vs. the old per-hook flow:
 *  1. The new space id is read from the chain (`addressToSpaceId`) instead of
 *     polling the lagging GraphQL indexer — removes the up-to-60s `waitForSpaceId`.
 *  2. The publish-edit and declare-topic calls ship as a single userOp instead of
 *     two sequential ones — one bundler round-trip, and the topic can't race ahead
 *     of its publish.
 *  3. Content + topic indexing are awaited in one merged poll loop instead of two.
 */

// Exact permissionless SmartAccountClient type both call sites already use. `import type`
// erases at compile time, so no runtime hook<->util coupling.
type SmartAccount = NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;

const publicClient = () => createPublicClient({ chain: GEOGENESIS, transport: http() });

/**
 * Normalize the registry's `addressToSpaceId` return into the app-internal id form:
 * null for the empty/unregistered sentinel, otherwise the bare (no `0x`) lowercase id.
 * Wrong output here = wrong space, so it's covered by a unit test.
 */
export function parseRegisteredSpaceId(hex: Hex): string | null {
  if (hex.toLowerCase() === EMPTY_SPACE_ID.toLowerCase()) return null;
  return hex.slice(2).toLowerCase();
}

/** Single chain read of the registry: wallet address -> registered space id (or null). */
export async function readRegisteredSpaceId(walletAddress: string): Promise<string | null> {
  const hex = (await publicClient().readContract({
    address: SPACE_REGISTRY_ADDRESS_HEX,
    abi: SpaceRegistryAbi,
    functionName: 'addressToSpaceId',
    args: [walletAddress as Hex],
  })) as Hex;

  return parseRegisteredSpaceId(hex);
}

/** Poll the chain (not the indexer) until the register userOp is mined and the id appears. */
async function pollRegisteredSpaceId(
  walletAddress: string,
  maxAttempts = 30,
  intervalMs = 1_500
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const spaceId = await readRegisteredSpaceId(walletAddress);
    if (spaceId) return spaceId;
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

/** One poll loop that resolves once both the space content and its topic have indexed. */
export async function waitForSpaceIndexed(
  spaceId: string,
  topicId: string,
  maxAttempts = 30,
  intervalMs = 2_000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const space = await Effect.runPromise(getSpace(spaceId));
      if (space?.entity?.name && space?.topicId === topicId) return true;
    } catch {
      // keep polling
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

function publishRetrySchedule() {
  return Schedule.exponential(Duration.millis(500)).pipe(
    Schedule.jittered,
    Schedule.tapInput(() => Effect.sync(() => devLog('[CREATE_SPACE] Retrying publish + topic'))),
    Schedule.intersect(Schedule.recurs(2))
  );
}

type CreatePersonalSpaceOnChainParams = {
  smartAccount: SmartAccount;
  walletAddress: string;
  type: SpaceType;
  spaceName: string;
  /** Raw image value (pre-`getImagePath`); null/undefined for none. */
  spaceAvatarUri?: string | null;
  spaceCoverUri?: string | null;
  topicId?: string;
};

export async function createPersonalSpaceOnChain({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceAvatarUri,
  spaceCoverUri,
  topicId,
}: CreatePersonalSpaceOnChainParams): Promise<string> {
  // 1. Register the space id if the account doesn't already have one.
  let spaceId = await readRegisteredSpaceId(walletAddress);
  if (!spaceId) {
    const { to, calldata } = personalSpace.createSpace();
    const registerResult = await runEffectEither(
      Effect.tryPromise({
        try: () => smartAccount.sendUserOperation({ calls: [{ to, value: 0n, data: calldata }] }),
        catch: error => new Error('Failed to register personal space', { cause: error }),
      }).pipe(
        Effect.withSpan('web.write.createPersonalSpace.register'),
        Effect.annotateSpans({
          'io.operation': 'create_personal_space',
          'space.type': 'PERSONAL',
          'governance.action': 'space_created',
        })
      )
    );
    if (registerResult._tag === 'Left') throw registerResult.left;

    // Read the id straight from the chain as soon as the userOp mines — no indexer wait.
    spaceId = await pollRegisteredSpaceId(walletAddress);
    if (!spaceId) throw new Error('Timed out waiting for space ID after registration.');
    devLog('[CREATE_SPACE] registered, spaceId=%s', spaceId);
  } else {
    devLog('[CREATE_SPACE] already registered, spaceId=%s', spaceId);
  }

  // 2. Build the content + topic calldata (id is now known).
  const { ops, topicId: resolvedTopicId } = await generateOpsForSpaceType({
    type,
    spaceName,
    spaceAvatarUri: spaceAvatarUri ? getImagePath(spaceAvatarUri) : null,
    spaceCoverUri: spaceCoverUri ? getImagePath(spaceCoverUri) : null,
    initialEditorAddress: walletAddress,
    topicId,
  });

  const { to: publishTo, calldata: publishCalldata } = await personalSpace.publishEdit({
    name: spaceName,
    spaceId,
    ops,
    author: spaceId,
    network: 'TESTNET',
  });

  const topicCalldata = buildPersonalTopicDeclaredCalldata({
    authorSpaceId: spaceId,
    spaceId,
    topicId: resolvedTopicId,
  });

  // 3. Publish edit + declare topic in a single userOp. Calldata is built once, so
  // retrying only re-sends (the publish revert is atomic — nothing persists).
  const submitResult = await runEffectEither(
    Effect.retry(
      Effect.tryPromise({
        try: () =>
          smartAccount.sendUserOperation({
            calls: [
              { to: publishTo, value: 0n, data: publishCalldata },
              { to: SPACE_REGISTRY_ADDRESS_HEX, value: 0n, data: topicCalldata },
            ],
          }),
        catch: error => new Error('Failed to publish personal space content + topic', { cause: error }),
      }).pipe(
        Effect.withSpan('web.write.createPersonalSpace.publishAndDeclareTopic'),
        Effect.annotateSpans({
          'io.operation': 'submit_user_operation',
          'space.type': 'PERSONAL',
          'governance.action': 'space_content_published',
        })
      ),
      publishRetrySchedule()
    )
  );
  if (submitResult._tag === 'Left') throw submitResult.left;
  devLog('[CREATE_SPACE] publish + topic userOp sent, waiting for index…');

  // 4. Wait for both content and topic to index (one merged loop).
  const indexed = await waitForSpaceIndexed(spaceId, resolvedTopicId);
  if (!indexed) throw new Error('Timed out waiting for personal space to index.');
  devLog('[CREATE_SPACE] indexed, spaceId=%s', spaceId);

  return spaceId;
}
