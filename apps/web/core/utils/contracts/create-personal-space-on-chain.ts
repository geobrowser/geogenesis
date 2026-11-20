import { isRevertedUserOperationError } from '@geogenesis/auth/account';
import { getCreatePersonalSpaceCalldata } from '@geoprotocol/geo-sdk';
import type { Op } from '@geoprotocol/geo-sdk/lite';

import { Duration, Effect, Schedule } from 'effect';
import { type Hex, createPublicClient, http, toHex } from 'viem';

import type { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { reportEvent } from '~/core/telemetry/logger';
import { SpaceType } from '~/core/types';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { devLog } from '../dev-log';
import { getImagePath } from '../utils';
import { EMPTY_SPACE_ID } from './dao-space-factory';
import { generateAvatarOps, generateOpsForSpaceType } from './generate-ops-for-space-type';
import { padBytes16ToBytes32 } from './governance';
import {
  type ProfileDeclaration,
  ProfileRecoveryError,
  buildRecoveryOps,
  canPublishFreshUnderDeclaredTopic,
  fetchOriginalProfileEdit,
  hasProfileAvatar,
  parseEditUriFromLogData,
  parseOriginalProfileEdit,
} from './personal-profile-recovery';
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
 * The block window for one `eth_getLogs` call. Bounded so each query stays inside RPC block-range
 * caps as the chain grows; the range includes both ends, so it spans exactly this many blocks.
 */
const DECLARATION_LOOKBACK_BLOCKS = 10_000n;

type RegistryLog = {
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
};

/**
 * The space's earliest topic declaration and the edit sent in the same transaction, walking back
 * to its registration. Proves presence only: spaces older than topic declarations have none.
 */
export async function findPersonalProfileDeclaration(spaceId: string): Promise<ProfileDeclaration | null> {
  const client = publicClient();
  const space = padBytes16ToBytes32(`0x${spaceId}`);
  const actions = [
    GOVERNANCE_ACTIONS.SPACE_ID_REGISTERED,
    GOVERNANCE_ACTIONS.TOPIC_DECLARED,
    GOVERNANCE_ACTIONS.EDITS_PUBLISHED,
  ];

  const queryLogs = async (fromBlock: bigint, toBlock: bigint) =>
    // `enter` logs [from space, to space, action, topic] as raw topics with no event signature, so
    // viem's typed `getLogs` cannot filter it. Registration logs a zero from-space, hence `null`.
    (await client.request({
      method: 'eth_getLogs',
      params: [
        {
          address: SPACE_REGISTRY_ADDRESS_HEX,
          fromBlock: toHex(fromBlock),
          toBlock: toHex(toBlock),
          topics: [null, space, actions],
        },
      ],
    })) as RegistryLog[];

  const logs: RegistryLog[] = [];
  let toBlock = await client.getBlockNumber();
  // Unbounded in windows, never in range: stopping early would leave "no profile" unproven. It runs
  // only for a registered space the index shows without a profile.
  for (;;) {
    const fromBlock = toBlock >= DECLARATION_LOOKBACK_BLOCKS ? toBlock - DECLARATION_LOOKBACK_BLOCKS + 1n : 0n;
    const found = await queryLogs(fromBlock, toBlock);
    logs.push(...found);
    if (fromBlock === 0n || found.some(log => log.topics[2] === GOVERNANCE_ACTIONS.SPACE_ID_REGISTERED)) break;
    toBlock = fromBlock - 1n;
  }

  const ownLogs = logs
    .filter(log => log.topics[0] === space)
    .sort(
      (a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex))
    );
  const declarations = ownLogs.filter(log => log.topics[2] === GOVERNANCE_ACTIONS.TOPIC_DECLARED);
  const edits = ownLogs.filter(log => log.topics[2] === GOVERNANCE_ACTIONS.EDITS_PUBLISHED);
  const pairedEdit = (declaration: RegistryLog) =>
    edits.find(edit => edit.transactionHash === declaration.transactionHash);
  // The profile is the earliest declaration sent with its edit; one sent alone has nothing to republish.
  const declaration = declarations.find(pairedEdit) ?? declarations[0];
  if (!declaration) return null;
  const edit = pairedEdit(declaration);

  const blockNumber = BigInt(declaration.blockNumber);
  const laterEdits = edits.filter(log => BigInt(log.blockNumber) >= blockNumber);
  const lastBlockNumber = laterEdits.length > 0 ? BigInt(laterEdits[laterEdits.length - 1].blockNumber) : blockNumber;
  const blockTimeMs = async (number: bigint) =>
    Number((await client.getBlock({ blockNumber: number })).timestamp) * 1000;
  const declaredAtMs = await blockTimeMs(blockNumber);

  return {
    topicId: declaration.topics[3].slice(2, 34),
    blockNumber,
    transactionHash: declaration.transactionHash,
    declaredAtMs,
    editUri: edit ? parseEditUriFromLogData(edit.data) : null,
    lastPublishedAtMs: lastBlockNumber === blockNumber ? declaredAtMs : await blockTimeMs(lastBlockNumber),
    publishCount: laterEdits.length,
  };
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
  /** Called once the profile userOp is sent, with the space id and the profile entity id. */
  onRegistered?: (spaceId: string, profileEntityId: string) => void;
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
    onRegistered?.(spaceId, resolvedTopicId);
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

type RepublishPersonalProfileParams = {
  smartAccount: SmartAccount;
  walletAddress: string;
  spaceId: string;
  declaration: ProfileDeclaration;
  spaceName: string;
  /** Raw image value (pre-`getImagePath`); null/undefined for none. */
  spaceAvatarUri?: string | null;
  onRegistered?: (spaceId: string, profileEntityId: string) => void;
};

/**
 * Republishes a dropped profile under a new edit id and CID, sending only the edit since the
 * declaration is on chain. An unreadable original throws and sends nothing until the fallback age.
 */
export async function republishPersonalProfile({
  smartAccount,
  walletAddress,
  spaceId,
  declaration,
  spaceName,
  spaceAvatarUri,
  onRegistered,
}: RepublishPersonalProfileParams): Promise<string> {
  const { ops, source } = await profileRecoveryOps({ spaceId, declaration, spaceName, spaceAvatarUri, walletAddress });

  const { to, calldata } = await geo.personalSpaces.publishEdit({ name: spaceName, spaceId, ops, author: spaceId });

  const submitResult = await runEffectEither(
    Effect.retry(
      Effect.tryPromise({
        try: () => smartAccount.sendUserOperation({ calls: [{ to, value: 0n, data: calldata }] }),
        catch: error => new Error('Failed to republish personal profile', { cause: error }),
      }).pipe(
        Effect.withSpan('web.write.createPersonalSpace.republishProfile'),
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
  // Counted so a republish the index drops again shows up: `publishCount` keeps rising for the space.
  reportEvent({
    name: 'personal_profile_republished',
    level: 'warning',
    tags: { 'space.id': spaceId, outcome: source },
    extra: { topicId: declaration.topicId, publishCount: declaration.publishCount, editUri: declaration.editUri },
  });
  devLog('[CREATE_SPACE] profile republished, waiting for index…');

  try {
    onRegistered?.(spaceId, declaration.topicId);
  } catch (error) {
    console.error('[CREATE_SPACE] onRegistered callback failed', error);
  }

  // The index serves the profile as the space's page; its topic waits on the indexer handling
  // TOPIC_DECLARED. As with a first publish, a timeout here is not a failure.
  const indexed = await waitForSpacePage(spaceId, declaration.topicId);
  devLog('[CREATE_SPACE] republished profile %s, spaceId=%s', indexed ? 'indexed' : 'not yet indexed', spaceId);

  return spaceId;
}

/**
 * A readable original's ops by id; else, past the fallback age, a fresh profile under the declared
 * topic, so the person entity and page stay the same.
 */
async function profileRecoveryOps({
  spaceId,
  declaration,
  spaceName,
  spaceAvatarUri,
  walletAddress,
}: {
  spaceId: string;
  declaration: ProfileDeclaration;
  spaceName: string;
  spaceAvatarUri?: string | null;
  walletAddress: string;
}): Promise<{ ops: Op[]; source: 'original' | 'fresh_under_declared_topic' }> {
  try {
    if (!declaration.editUri) {
      throw new ProfileRecoveryError('The original profile edit is not on chain.', { reason: 'missing' });
    }
    const original = parseOriginalProfileEdit(
      await fetchOriginalProfileEdit(declaration.editUri),
      spaceId,
      declaration.topicId
    );
    const avatarOps =
      spaceAvatarUri && !hasProfileAvatar(original.ops, declaration.topicId)
        ? await generateAvatarOps(declaration.topicId, getImagePath(spaceAvatarUri))
        : [];
    const ops = buildRecoveryOps({
      originalOps: original.ops,
      topicId: declaration.topicId,
      name: spaceName,
      avatarOps,
    });
    return { ops, source: 'original' };
  } catch (error) {
    const missing = error instanceof ProfileRecoveryError && error.reason === 'missing';
    if (!missing || !canPublishFreshUnderDeclaredTopic(declaration, Date.now())) {
      throw error;
    }
    const { ops } = await generateOpsForSpaceType({
      type: 'personal',
      spaceName,
      spaceAvatarUri: spaceAvatarUri ? getImagePath(spaceAvatarUri) : null,
      spaceCoverUri: null,
      initialEditorAddress: walletAddress,
      topicId: declaration.topicId,
    });
    return { ops, source: 'fresh_under_declared_topic' };
  }
}

/** Polls until the index serves `entityId` as the space's named profile entity (its topic or page). */
async function waitForSpacePage(spaceId: string, entityId: string, maxAttempts = 30, intervalMs = 2_000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const space = await Effect.runPromise(getSpace(spaceId));
      if (space?.entity?.id === entityId && space.entity.name) return true;
    } catch {
      // keep polling
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
