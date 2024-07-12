'use server';

import { SupportedNetworks } from '@aragon/osx-commons-configs';
import {
  DAOFactory,
  DAOFactory__factory,
  DAORegistry__factory,
  PluginRepo__factory,
  PluginSetupProcessor__factory,
} from '@aragon/osx-ethers';
import { DaoCreationSteps } from '@aragon/sdk-client';
import { ContextParams, DaoCreationError, MissingExecPermissionError, PermissionIds } from '@aragon/sdk-client-common';
import { id } from '@ethersproject/hash';
import { Op, SYSTEM_IDS, VotingMode, createImageEntityOps } from '@geogenesis/sdk';
import { DAO_FACTORY_ADDRESS, ENS_REGISTRY_ADDRESS, PLUGIN_SETUP_PROCESSOR_ADDRESS } from '@geogenesis/sdk/contracts';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { Duration, Effect, Either, Schedule } from 'effect';
import { providers } from 'ethers';
import { v4 as uuid } from 'uuid';
import { encodeFunctionData, getAddress, stringToHex, zeroAddress } from 'viem';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { StorageClient } from '~/core/io/storage/storage';
import { graphql } from '~/core/io/subgraph/graphql';
import { SpaceType } from '~/core/types';
import { generateTriplesForCompany } from '~/core/utils/contracts/generate-triples-for-company';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '~/core/utils/ops';
import { Triples } from '~/core/utils/triples';
import { slog } from '~/core/utils/utils';

import {
  CreateGeoDaoParams,
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from '../dao/encodings';
import { abi as DaoFactoryAbi } from './abi';
import { publicClient, signer, walletClient } from './client';

const deployParams = {
  network: SupportedNetworks.LOCAL, // I don't think this matters but is required by Aragon SDK
  signer: signer,
  web3Providers: new providers.JsonRpcProvider(Environment.variables.rpcEndpoint),
  DAOFactory: DAO_FACTORY_ADDRESS,
  ENSRegistry: ENS_REGISTRY_ADDRESS,
};

interface DeployArgs {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string;
  initialEditorAddress: string;
}

export async function deploySpace(args: DeployArgs) {
  const initialEditorAddress = getAddress(args.initialEditorAddress);
  const governanceType = getGovernanceTypeForSpaceType(args.type);
  const ops = await generateOpsForSpaceType(args);

  const initialContent = createEditProposal({
    name: args.spaceName,
    author: initialEditorAddress,
    ops,
  });

  const storage = new StorageClient(Environment.getConfig().ipfs);

  // @TODO: Effectify and use uploadBinary helper
  const firstBlockContentUri = await storage.uploadBinary(initialContent);

  const spacePluginInstallItem = getSpacePluginInstallItem({
    firstBlockContentUri: `ipfs://${firstBlockContentUri}`,
    // @HACK: Using a different upgrader from the governance plugin to work around
    // a limitation in Aragon.
    pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
  });

  if (governanceType === 'governance') {
    const governancePluginConfig: Parameters<typeof getGovernancePluginInstallItem>[0] = {
      votingSettings: {
        votingMode: VotingMode.EarlyExecution,
        supportThreshold: 50_000,
        duration: BigInt(60 * 60 * 1), // 1 hour seems to be the minimum we can do
      },
      memberAccessProposalDuration: BigInt(60 * 60 * 1), // one hour in seconds
      initialEditors: [getAddress(initialEditorAddress)],
      pluginUpgrader: getAddress(initialEditorAddress),
    };

    const governancePluginInstallItem = getGovernancePluginInstallItem(governancePluginConfig);

    const createParams: CreateGeoDaoParams = {
      metadataUri: `ipfs://${firstBlockContentUri}`,
      plugins: [governancePluginInstallItem, spacePluginInstallItem],
    };

    console.log('Creating DAO...');
    const steps = await createDao(createParams, deployParams);

    for await (const step of steps) {
      try {
        switch (step.key) {
          case DaoCreationSteps.CREATING:
            console.log({ txHash: step.txHash });
            break;
          case DaoCreationSteps.DONE:
            console.log({
              daoAddress: step.address,
              pluginAddresses: step.pluginAddresses,
            });

            return await waitForSpaceToBeIndexed(step.address);
        }
      } catch (err) {
        console.error('Failed creating DAO', err);
      }
    }
  }

  if (governanceType === 'personal') {
    const personalSpacePluginItem = getPersonalSpaceGovernancePluginInstallItem({
      initialEditor: getAddress(initialEditorAddress),
    });

    const createParams: CreateGeoDaoParams = {
      metadataUri: `ipfs://${firstBlockContentUri}`,
      plugins: [personalSpacePluginItem, spacePluginInstallItem],
    };

    const steps = await createDao(createParams, deployParams);

    for await (const step of steps) {
      try {
        switch (step.key) {
          case DaoCreationSteps.CREATING:
            console.log({ txHash: step.txHash });
            break;
          case DaoCreationSteps.DONE:
            console.log({
              daoAddress: step.address,
              pluginAddresses: step.pluginAddresses,
            });

            return await waitForSpaceToBeIndexed(step.address);
        }
      } catch (err) {
        console.error('Failed creating DAO', err);
      }
    }
  }
}

async function generateOpsForSpaceType({ type, spaceName, spaceAvatarUri }: DeployArgs) {
  const ops: Op[] = [];
  const newEntityId = ID.createEntityId();

  // Add triples for a Person entity
  if (type === 'default' || type === 'personal') {
    ops.push(
      Ops.create({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.NAME,
        value: {
          type: 'TEXT',
          value: spaceName,
        },
      })
    );

    ops.push(
      Ops.create({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.TYPES,
        value: {
          type: 'ENTITY',
          value: SYSTEM_IDS.SPACE_CONFIGURATION,
        },
      })
    );

    // @TODO: Do we add the Person type? That would mean this has to be a collection
  }

  if (type === 'company') {
    // Space address doesn't matter here since we're immediately writing the ops and not persisting
    // in the local db.
    const companyTriples = await generateTriplesForCompany(newEntityId, spaceName, 'bogus space');
    ops.push(...Triples.prepareTriplesForPublishing(companyTriples, 'bogus space'));
  }

  if (type === 'nonprofit') {
    const nonprofitTriples = await generateTriplesForNonprofit(newEntityId, spaceName, 'bogus space');
    ops.push(...Triples.prepareTriplesForPublishing(nonprofitTriples, 'bogus space'));
  }

  if (spaceAvatarUri) {
    const [typeOp, srcOp] = createImageEntityOps(spaceAvatarUri);

    // Creates the image entity
    ops.push(typeOp);
    ops.push(srcOp);

    // Creates the triple pointing to the image entity
    ops.push(
      Ops.create({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
        value: {
          type: 'ENTITY',
          value: typeOp.payload.entityId,
        },
      })
    );
  }

  return ops;
}

function getGovernanceTypeForSpaceType(type: SpaceType): 'governance' | 'personal' {
  switch (type) {
    case 'default':
      return 'governance';
    case 'personal':
    case 'company':
    case 'nonprofit':
    default:
      return 'personal';
  }
}

const query = (daoAddress: string) => ` {
  spaces(filter: { daoAddress: { equalTo: "${getAddress(daoAddress)}" } }) {
    nodes {
      id
    }
  }
}`;

async function waitForSpaceToBeIndexed(daoAddress: string) {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<{
    spaces: { nodes: { id: string }[] };
  }>({
    endpoint,
    query: query(daoAddress),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* () {
    const resultOrError = yield* Effect.either(graphqlFetchEffect);

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in waitForSpaceToBeIndexed. endpoint: ${endpoint}

            queryString: ${query(daoAddress)}
            `,
            error.message
          );

          return null;

        default:
          console.error(`${error._tag}: Unable to wait for space to be indexed, endpoint: ${endpoint}`);

          return null;
      }
    }

    const maybeSpace = resultOrError.right.spaces.nodes[0];

    if (!maybeSpace) {
      yield* Effect.fail(new Error('Could not find deployed space'));
      return null;
    }

    return maybeSpace.id;
  });

  const retried = Effect.retry(
    graphqlFetchWithErrorFallbacks,
    Schedule.exponential(100).pipe(
      Schedule.jittered,
      Schedule.compose(Schedule.elapsed),
      // Retry for 30 seconds.
      Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(60)))
    )
  );

  return await Effect.runPromise(retried);
}

async function* createDao(params: CreateGeoDaoParams, context: ContextParams) {
  if (!(context.signer && context.DAOFactory)) {
    return;
  }

  const requestId = uuid();
  const signer = context.signer;

  const daoFactoryInstance = DAOFactory__factory.connect(context.DAOFactory, signer);

  const pluginInstallationData: DAOFactory.PluginSettingsStruct[] = [];
  for (const plugin of params.plugins) {
    const repo = PluginRepo__factory.connect(plugin.id, signer);

    const currentRelease = await repo.latestRelease();
    const latestVersion = await repo['getLatestVersion(uint8)'](currentRelease);
    pluginInstallationData.push({
      pluginSetupRef: {
        pluginSetupRepo: repo.address,
        versionTag: latestVersion.tag,
      },
      data: plugin.data,
    });
  }

  // check if at least one plugin requests EXECUTE_PERMISSION on the DAO
  // This check isn't 100% correct all the time
  // simulate the DAO creation to get an address
  // const pluginSetupProcessorAddr = await daoFactoryInstance.pluginSetupProcessor();
  const pluginSetupProcessor = PluginSetupProcessor__factory.connect(PLUGIN_SETUP_PROCESSOR_ADDRESS, signer);
  let execPermissionFound = false;

  // using the DAO base because it reflects a newly created DAO the best
  const daoBaseAddr = await daoFactoryInstance.daoBase();

  // simulates each plugin installation seperately to get the requested permissions
  for (const installData of pluginInstallationData) {
    const pluginSetupProcessorResponse = await pluginSetupProcessor.callStatic.prepareInstallation(
      daoBaseAddr,
      installData
    );
    const found = pluginSetupProcessorResponse[1].permissions.find(
      permission => permission.permissionId === PermissionIds.EXECUTE_PERMISSION_ID
    );
    if (found) {
      execPermissionFound = true;
      break;
    }
  }

  if (!execPermissionFound) {
    throw new MissingExecPermissionError();
  }

  // We use viem as we run into unexpected "unknown account" errors when using ethers to
  // write the tx using the geo signer.
  const hash = await walletClient.sendTransaction({
    to: DAO_FACTORY_ADDRESS,
    data: encodeFunctionData({
      abi: DaoFactoryAbi,
      functionName: 'createDao',
      args: [
        {
          subdomain: params.ensSubdomain ?? '',
          metadata: stringToHex(params.metadataUri),
          daoURI: params.daoUri ?? '',
          trustedForwarder: (params.trustedForwarder ?? zeroAddress) as `0x${string}`,
        },
        // @ts-expect-error mismatched types between ethers and viem. Ethers expects
        // the tag struct to be a BigNumberish but viem expects a string or number
        pluginInstallationData,
      ],
    }),
  });

  // Commenting out the original implementation of DAO deployment. See the original here:
  // https://github.com/aragon/sdk/blob/36647d5d27ddc74b62892f829fec60e115a2f9be/modules/client/src/internal/client/methods.ts#L190
  // const tx = await daoFactoryInstance.connect(signer).createDao(
  //   {
  //     subdomain: params.ensSubdomain ?? '',
  //     metadata: stringToBytes(params.metadataUri),
  //     daoURI: params.daoUri ?? '',
  //     trustedForwarder: params.trustedForwarder ?? zeroAddress,
  //   },
  //   pluginInstallationData
  // );

  yield {
    key: DaoCreationSteps.CREATING,
    txHash: hash,
  };

  const receipt = await publicClient.getTransactionReceipt({
    hash: hash,
  });

  const daoFactoryInterface = DAORegistry__factory.createInterface();
  const log = receipt.logs.find(l => {
    const expectedId = daoFactoryInterface.getEventTopic('DAORegistered');
    return l.topics[0] === expectedId;
  });

  if (!log) {
    slog({ message: `Failed to create DAO. Tx hash ${hash}`, requestId, level: 'error' });
    throw new DaoCreationError();
  }

  // Plugin logs
  const pspInterface = PluginSetupProcessor__factory.createInterface();
  const installedLogs = receipt.logs?.filter(
    e => e.topics[0] === id(pspInterface.getEvent('InstallationApplied').format('sighash'))
  );

  // DAO logs
  const parsedLog = daoFactoryInterface.parseLog(log);
  if (!parsedLog.args['dao']) {
    slog({ message: `Could not find DAO log. Tx hash ${hash}`, requestId, level: 'error' });
    throw new DaoCreationError();
  }

  yield {
    key: DaoCreationSteps.DONE,
    address: parsedLog.args['dao'],
    pluginAddresses: installedLogs.map(log => pspInterface.parseLog(log).args[1]),
  };
}
