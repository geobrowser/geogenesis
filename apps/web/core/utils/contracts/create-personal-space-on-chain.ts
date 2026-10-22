import { isRevertedUserOperationError } from '@geogenesis/auth/account';
import { getCreatePersonalSpaceCalldata } from '@geoprotocol/geo-sdk';

import { Duration, Effect, Schedule } from 'effect';
import { type Hex, createPublicClient, http, toHex } from 'viem';

import type { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SpaceType } from '~/core/types';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { devLog } from '../dev-log';
import { getImagePath } from '../utils';
import { EMPTY_SPACE_ID } from './dao-space-factory';
import { generateOpsForSpaceType } from './generate-ops-for-space-type';
import { padBytes16ToBytes32 } from './governance';
import { GOVERNANCE_ACTIONS, SpaceRegistryAbi } from './space-registry';
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
 * Wrong output here = wrong space, so it's covered by a unit test. Accepts `string`
 * (not `Hex`) so the casing-tolerance it guarantees at runtime can be unit-tested.
 */
export function parseRegisteredSpaceId(hex: string): string | null {
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

/**
 * How far back `hasDeclaredPersonalTopic` looks. It only has to cover the index's lag (seconds to
 * minutes): a declaration older than that is already served by the index, which answers first.
 * Bounded so the query stays inside RPC block-range caps as the chain grows. On testnet (~1,700
 * blocks a day, Oct 2026) this is about six days.
 */
const DECLARATION_LOOKBACK_BLOCKS = 10_000n;

/**
 * Whether the chain shows this personal space's profile publish: its own topic declaration,
 * which ships in the same userOp as the profile edit, so it exists only if that publish landed.
 * Unlike the index it has no lag, which is what keeps a second browser from publishing a second
 * profile (under a fresh topic id) while the index still trails the first.
 *
 * Proves presence only. Spaces whose profile predates topic declarations have none, so callers
 * use this to confirm a profile the index has not shown yet, never to rule one out.
 */
export async function hasDeclaredPersonalTopic(spaceId: string): Promise<boolean> {
  const client = publicClient();
  const space = padBytes16ToBytes32(`0x${spaceId}`);
  const head = await client.getBlockNumber();
  const fromBlock = head > DECLARATION_LOOKBACK_BLOCKS ? head - DECLARATION_LOOKBACK_BLOCKS : 0n;
  // `enter` logs [from space, to space, action, topic] as raw topics with no event signature,
  // so viem's typed `getLogs` cannot filter it.
  const logs = await client.request({
    method: 'eth_getLogs',
    params: [
      {
        address: SPACE_REGISTRY_ADDRESS_HEX,
        fromBlock: toHex(fromBlock),
        toBlock: toHex(head),
        topics: [space, space, GOVERNANCE_ACTIONS.TOPIC_DECLARED],
      },
    ],
  });
  return logs.length > 0;
}

/**
 * Poll the chain (not the indexer) until the register userOp is mined and the id appears.
 * 30 × 2s = 60s ceiling — matches the prior implementation; a shorter window spuriously
 * flips optimistic onboarding to `failed` on slow bundlers even when the tx still lands.
 */
async function pollRegisteredSpaceId(
  walletAddress: string,
  maxAttempts = 30,
  intervalMs = 2_000
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

// A reverted UserOperation short-circuits the schedule: it was included and had
// no effect, so re-sending the identical calldata reverts identically and only
// burns more sponsored operations.
function publishRetrySchedule() {
  return Schedule.exponential(Duration.millis(500)).pipe(
    Schedule.jittered,
    Schedule.tapInput(() => Effect.sync(() => devLog('[CREATE_SPACE] Retrying publish + topic'))),
    Schedule.intersect(Schedule.recurs(2)),
    Schedule.whileInput((error: unknown) => !isRevertedUserOperationError(error))
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
  onRegistered?: (spaceId: string) => void;
};

export async function createPersonalSpaceOnChain({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceAvatarUri,
  spaceCoverUri,
  topicId,
  onRegistered,
}: CreatePersonalSpaceOnChainParams): Promise<string> {
  // 1. Register the space id if the account doesn't already have one.
  let spaceId = await readRegisteredSpaceId(walletAddress);
  if (!spaceId) {
    const to = SPACE_REGISTRY_ADDRESS_HEX;
    const calldata = getCreatePersonalSpaceCalldata();
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

  const { to: publishTo, calldata: publishCalldata } = await geo.personalSpaces.publishEdit({
    name: spaceName,
    spaceId,
    ops,
    author: spaceId,
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

  try {
    onRegistered?.(spaceId);
  } catch (error) {
    console.error('[CREATE_SPACE] onRegistered callback failed', error);
  }

  // 4. Wait for both content and topic to index (one merged loop).
  //
  // A timeout here is NOT a creation failure. The space is registered on-chain — we
  // read its id from the registry above — and the content userOp was accepted; all
  // that's outstanding is the indexer catching up, which it does on its own schedule.
  // Throwing reported "Account setup failed: Timed out waiting for personal space to
  // index" for a space that already existed, and left the account wedged: the runner's
  // catch never seeds the personal-space cache, so the app kept the user unregistered
  // and refused every write until a hard reload.
  //
  // Return the id either way. Callers treat it as created, and usePersonalSpaceId
  // polls until the indexer serves it.
  const indexed = await waitForSpaceIndexed(spaceId, resolvedTopicId);
  if (indexed) {
    devLog('[CREATE_SPACE] indexed, spaceId=%s', spaceId);
  } else {
    devLog('[CREATE_SPACE] created but not yet indexed, spaceId=%s — resolving anyway', spaceId);
  }

  return spaceId;
}
