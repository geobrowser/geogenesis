'use client';

import { getCreateDaoSpaceCalldata, getCreatePersonalSpaceCalldata } from '@geoprotocol/geo-sdk';
import { DaoSpaceFactoryAbi } from '@geoprotocol/geo-sdk/abis';

/** The SDK doesn't re-export `VotingSettingsInput` from the public entry, so we
 *  derive it from the function signature we already depend on. Source of truth
 *  stays in the SDK. */
export type VotingSettingsInput = Parameters<typeof getCreateDaoSpaceCalldata>[0]['votingSettings'];
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Duration, Effect, Either, Schedule } from 'effect';
import { type Hex, createPublicClient, http } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import {
  DAO_SPACE_FACTORY_ADDRESS,
  EMPTY_SPACE_ID,
  NEW_SPACE_VOTING_DURATION_DAYS,
} from '~/core/utils/contracts/dao-space-factory';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';
import { SPACE_REGISTRY_ADDRESS_HEX, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';
import { buildPersonalTopicDeclaredCalldata } from '~/core/utils/contracts/space-topic';
import { getImagePath } from '~/core/utils/utils';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

type DeployArgs = {
  type: SpaceType;
  spaceName: string;
  spaceImage?: string;
  governanceType?: SpaceGovernanceType;
  topicId?: string;
  /** Optional override for DAO voting settings; ignored for personal-style spaces. */
  votingSettings?: VotingSettingsInput;
};

/**
 * Defaults used when the caller doesn't override voting settings.
 * Aligned with the SDK's DEFAULT_VOTING_SETTINGS but with a 1-day voting
 * duration so newly-created DAOs are usable without waiting two days.
 */
export const NEW_SPACE_DEFAULT_VOTING_SETTINGS: VotingSettingsInput = {
  partialPercentageSupportThreshold: 51,
  universalPercentageSupportThreshold: 90,
  flatSupportThreshold: 1,
  quorum: 1,
  disableFastPathAccessForNewMembers: true,
  executionGracePeriodInDays: 14,
  durationInDays: NEW_SPACE_VOTING_DURATION_DAYS,
};

const PUBLIC_GOVERNANCE_TYPES: SpaceType[] = [
  'dao',
  'academic-field',
  'company',
  'government-org',
  'industry',
  'interest',
  'nonprofit',
  'region',
  'protocol',
];

async function runWriteEffect<A>(effect: Effect.Effect<A, Error>): Promise<A> {
  const result = await runEffectEither(effect);

  if (Either.isLeft(result)) {
    throw result.left;
  }

  return result.right;
}

export function useDeploySpace() {
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const { mutateAsync } = useMutation({
    mutationFn: async (args: DeployArgs): Promise<string | null> => {
      if (!smartAccount) {
        return null;
      }

      const walletAddress = smartAccount.account.address;
      if (!walletAddress) {
        return null;
      }

      const { spaceName, type, governanceType, spaceImage, topicId, votingSettings } = args;

      const isPublicGovernance = determineIsPublicGovernance(type, governanceType);

      if (isPublicGovernance) {
        return await createDaoSpace({
          smartAccount,
          walletAddress,
          type,
          spaceName,
          spaceCoverUri: spaceImage,
          topicId,
          votingSettings,
        });
      } else {
        return await createPersonalStyleSpace({
          smartAccount,
          walletAddress,
          type,
          spaceName,
          spaceAvatarUri: type === 'personal' || type === 'company' ? spaceImage : undefined,
          spaceCoverUri: type !== 'personal' && type !== 'company' ? spaceImage : undefined,
          topicId,
        });
      }
    },
    onSuccess: spaceId => {
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: ['spaces'] });
        queryClient.invalidateQueries({ queryKey: ['personal-space-id'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }
    },
  });

  return {
    deploy: mutateAsync,
  };
}

function determineIsPublicGovernance(type: SpaceType, governanceType?: SpaceGovernanceType): boolean {
  if (type === 'default') {
    return governanceType === 'DAO';
  }

  if (PUBLIC_GOVERNANCE_TYPES.includes(type)) {
    return true;
  }

  return false;
}

type CreateDaoSpaceParams = {
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  walletAddress: string;
  type: SpaceType;
  spaceName: string;
  spaceCoverUri?: string;
  topicId?: string;
  votingSettings?: VotingSettingsInput;
};

async function createDaoSpace({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceCoverUri,
  topicId,
  votingSettings,
}: CreateDaoSpaceParams): Promise<string> {
  const personalSpaceId = await getPersonalSpaceId(walletAddress);
  if (!personalSpaceId) {
    throw new Error(
      'You must complete onboarding and create a personal space before creating a DAO space. Your personal space is required for governance membership.'
    );
  }

  const { ops, topicId: resolvedTopicId } = await generateOpsForSpaceType({
    type,
    spaceName,
    spaceAvatarUri: null,
    spaceCoverUri: spaceCoverUri ? getImagePath(spaceCoverUri) : null,
    initialEditorAddress: walletAddress,
    topicId,
  });

  // We only need the cid for the createDaoSpace calldata — the {to, calldata} the SDK
  // also returns are for pushing the edit to the personal space, which we ignore. The IPFS
  // binary contains only name/ops/author and does not embed spaceId, so the cid is reusable.
  const { cid } = await runWriteEffect(
    Effect.tryPromise({
      try: () =>
        geo.personalSpaces.publishEdit({
          name: `Create ${spaceName} space`,
          spaceId: personalSpaceId,
          ops,
          author: personalSpaceId,
        }),
      catch: error => new Error('Failed to publish DAO space edit to IPFS', { cause: error }),
    }).pipe(
      Effect.withSpan('web.write.createSpace.dao.publishEdit'),
      Effect.annotateSpans({
        'io.operation': 'publish_edit',
        'io.path': 'dao',
        'space.type': 'DAO',
        'governance.action': 'space_created',
      })
    )
  );

  if (!cid) {
    throw new Error('Failed to upload space content to IPFS');
  }

  const userSpaceIdHex = `0x${personalSpaceId}` as Hex;

  const publicClient = createPublicClient({
    chain: GEOGENESIS,
    transport: http(),
  });

  const [spaceRegistryAddr, daoSpaceBeaconAddr] = await Promise.all([
    publicClient.readContract({
      address: DAO_SPACE_FACTORY_ADDRESS,
      abi: DaoSpaceFactoryAbi,
      functionName: 'spaceRegistry',
    }),
    publicClient.readContract({
      address: DAO_SPACE_FACTORY_ADDRESS,
      abi: DaoSpaceFactoryAbi,
      functionName: 'daoSpaceBeacon',
    }),
  ]);

  if (spaceRegistryAddr === '0x0000000000000000000000000000000000000000') {
    throw new Error('DAOSpaceFactory is not properly initialized: spaceRegistry is zero address');
  }
  if (daoSpaceBeaconAddr === '0x0000000000000000000000000000000000000000') {
    throw new Error('DAOSpaceFactory is not properly initialized: daoSpaceBeacon is zero address');
  }

  const calldata = getCreateDaoSpaceCalldata({
    votingSettings: votingSettings ?? NEW_SPACE_DEFAULT_VOTING_SETTINGS,
    initialEditorSpaceIds: [userSpaceIdHex],
    initialMemberSpaceIds: [userSpaceIdHex],
    initialEditsContentUri: cid,
    initialTopicId: resolvedTopicId,
  });

  const txHash = await runWriteEffect(
    Effect.tryPromise({
      try: () =>
        smartAccount.sendTransaction({
          to: DAO_SPACE_FACTORY_ADDRESS,
          data: calldata,
        }),
      catch: error => new Error('Failed to submit DAO space creation transaction', { cause: error }),
    }).pipe(
      Effect.withSpan('web.write.createSpace.dao.sendTransaction'),
      Effect.annotateSpans({
        'io.operation': 'create_space',
        'space.type': 'DAO',
        'governance.action': 'space_created',
      })
    )
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('DAO space creation transaction failed');
  }

  const newDaoSpaceAddress = await findNewDaoSpaceAddress(publicClient, receipt);
  if (!newDaoSpaceAddress) {
    throw new Error('Could not find new DAO space address from transaction logs');
  }

  const newSpaceIdHex = (await publicClient.readContract({
    address: SPACE_REGISTRY_ADDRESS_HEX,
    abi: SpaceRegistryAbi,
    functionName: 'addressToSpaceId',
    args: [newDaoSpaceAddress],
  })) as Hex;

  const newSpaceId = newSpaceIdHex.slice(2).toLowerCase();
  const hasIndexedContent = await waitForSpaceContent(newSpaceId);
  if (!hasIndexedContent) {
    throw new Error('Timed out waiting for DAO space content to index.');
  }

  const hasIndexedTopic = await waitForSpaceTopic(newSpaceId, resolvedTopicId);
  if (!hasIndexedTopic) {
    throw new Error('Timed out waiting for DAO space topic to index.');
  }

  return newSpaceId;
}

type CreatePersonalStyleSpaceParams = {
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  walletAddress: string;
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri?: string;
  spaceCoverUri?: string;
  topicId?: string;
};

async function createPersonalStyleSpace({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceAvatarUri,
  spaceCoverUri,
  topicId,
}: CreatePersonalStyleSpaceParams): Promise<string> {
  let spaceId = await getPersonalSpaceId(walletAddress);

  if (!spaceId) {
    const registryTo = geo.network.contracts?.SPACE_REGISTRY_ADDRESS;
    if (!registryTo) throw new Error('SDK network is missing SPACE_REGISTRY_ADDRESS');
    const registryCalldata = getCreatePersonalSpaceCalldata();
    await runWriteEffect(
      Effect.tryPromise({
        try: () =>
          smartAccount.sendUserOperation({
            calls: [{ to: registryTo, value: 0n, data: registryCalldata }],
          }),
        catch: error => new Error('Failed to register personal-style space', { cause: error }),
      }).pipe(
        Effect.withSpan('web.write.createSpace.personal.register'),
        Effect.annotateSpans({
          'io.operation': 'create_space',
          'space.type': 'PERSONAL',
          'governance.action': 'space_created',
        })
      )
    );

    spaceId = await waitForSpaceId(walletAddress);
    if (!spaceId) {
      throw new Error('Timed out waiting for space ID after registration.');
    }
  }

  const { ops, topicId: resolvedTopicId } = await generateOpsForSpaceType({
    type,
    spaceName,
    spaceAvatarUri: spaceAvatarUri ? getImagePath(spaceAvatarUri) : null,
    spaceCoverUri: spaceCoverUri ? getImagePath(spaceCoverUri) : null,
    initialEditorAddress: walletAddress,
    topicId,
  });

  const { to: publishTo, calldata: publishCalldata } = await runWriteEffect(
    Effect.tryPromise({
      try: () =>
        geo.personalSpaces.publishEdit({
          name: spaceName,
          spaceId,
          ops,
          author: spaceId,
        }),
      catch: error => new Error('Failed to build personal-style publish edit', { cause: error }),
    }).pipe(
      Effect.withSpan('web.write.createSpace.personal.publishEdit'),
      Effect.annotateSpans({
        'io.operation': 'publish_edit',
        'io.path': 'personal',
        'space.type': 'PERSONAL',
        'governance.action': 'space_content_published',
      })
    )
  );

  await runWriteEffect(
    Effect.tryPromise({
      try: () =>
        smartAccount.sendUserOperation({
          calls: [{ to: publishTo, value: 0n, data: publishCalldata }],
        }),
      catch: error => new Error('Failed to submit personal-style publish transaction', { cause: error }),
    }).pipe(
      Effect.withSpan('web.write.createSpace.personal.submitUserOperation'),
      Effect.annotateSpans({
        'io.operation': 'submit_user_operation',
        'space.type': 'PERSONAL',
        'governance.action': 'space_content_published',
      })
    )
  );

  await runWriteEffect(
    Effect.retry(
      Effect.tryPromise({
        try: () =>
          smartAccount.sendUserOperation({
            calls: [
              {
                to: SPACE_REGISTRY_ADDRESS_HEX,
                value: 0n,
                data: buildPersonalTopicDeclaredCalldata({
                  authorSpaceId: spaceId,
                  spaceId,
                  topicId: resolvedTopicId,
                }),
              },
            ],
          }),
        catch: error => new Error('Failed to declare personal-style space topic', { cause: error }),
      }).pipe(
        Effect.withSpan('web.write.createSpace.personal.declareTopic'),
        Effect.annotateSpans({
          'io.operation': 'declare_space_topic',
          'space.type': 'PERSONAL',
          'governance.action': 'topic_declared',
        })
      ),
      topicDeclarationRetrySchedule('createSpace.personal.topic')
    )
  );

  const hasIndexedContent = await waitForSpaceContent(spaceId);
  if (!hasIndexedContent) {
    throw new Error('Timed out waiting for personal-style space content to index.');
  }

  const hasIndexedTopic = await waitForSpaceTopic(spaceId, resolvedTopicId);
  if (!hasIndexedTopic) {
    throw new Error('Timed out waiting for personal-style space topic to index.');
  }

  return spaceId;
}

function topicDeclarationRetrySchedule(label: string) {
  return Schedule.exponential(Duration.millis(500)).pipe(
    Schedule.jittered,
    Schedule.tapInput(() => Effect.sync(() => console.log(`[CREATE_SPACE][${label}] Retrying topic declaration`))),
    Schedule.intersect(Schedule.recurs(2))
  );
}

async function findNewDaoSpaceAddress(publicClient: any, receipt: any): Promise<Hex | null> {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === DAO_SPACE_FACTORY_ADDRESS.toLowerCase()) continue;
    if (log.address.toLowerCase() === SPACE_REGISTRY_ADDRESS_HEX.toLowerCase()) continue;

    const code = await publicClient.getCode({ address: log.address });
    if (code && code !== '0x') {
      try {
        const spaceId = (await publicClient.readContract({
          address: SPACE_REGISTRY_ADDRESS_HEX,
          abi: SpaceRegistryAbi,
          functionName: 'addressToSpaceId',
          args: [log.address],
        })) as Hex;

        if (spaceId && spaceId.toLowerCase() !== EMPTY_SPACE_ID.toLowerCase()) {
          return log.address;
        }
      } catch {
        // Not a registered space
      }
    }
  }

  return null;
}

async function waitForSpaceId(walletAddress: string, maxAttempts = 30, intervalMs = 2_000): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const spaceId = await getPersonalSpaceId(walletAddress);
    if (spaceId) return spaceId;
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}

async function waitForSpaceContent(spaceId: string, maxAttempts = 20, intervalMs = 3_000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const space = await Effect.runPromise(getSpace(spaceId));
      if (space?.entity?.name) return true;
    } catch {
      // Continue polling
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

async function waitForSpaceTopic(
  spaceId: string,
  topicId: string,
  maxAttempts = 20,
  intervalMs = 3_000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const space = await Effect.runPromise(getSpace(spaceId));
      if (space?.topicId === topicId) return true;
    } catch {
      // Continue polling
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}
