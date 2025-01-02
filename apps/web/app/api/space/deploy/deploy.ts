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
import { VotingMode, getChecksumAddress } from '@geogenesis/sdk';
import { DAO_FACTORY_ADDRESS, ENS_REGISTRY_ADDRESS, PLUGIN_SETUP_PROCESSOR_ADDRESS } from '@geogenesis/sdk/contracts';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { Duration, Effect, Either, Schedule } from 'effect';
import { providers } from 'ethers';
import { v4 as uuid } from 'uuid';
import { encodeFunctionData, stringToHex, zeroAddress } from 'viem';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';
import { slog } from '~/core/utils/utils';

import { publicClient, signer, walletClient } from '../../client';
import { IpfsService } from '../../ipfs/ipfs-service';
import { Metrics } from '../../metrics';
import { Telemetry } from '../../telemetry';
import { abi as DaoFactoryAbi } from './abi';
import {
  CreateGeoDaoParams,
  PluginInstallationWithViem,
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from './encodings';

const deployParams = {
  network: SupportedNetworks.LOCAL, // I don't think this matters but is required by Aragon SDK
  signer: signer,
  web3Providers: new providers.JsonRpcProvider(Environment.variables.rpcEndpoint),
  DAOFactory: DAO_FACTORY_ADDRESS,
  ENSRegistry: ENS_REGISTRY_ADDRESS,
};

class DeployDaoError extends Error {
  readonly _tag = 'DeployDaoError';
}

class GenerateOpsError extends Error {
  readonly _tag = 'GenerateOpsError';
}

class WaitForSpaceToBeIndexedError extends Error {
  readonly _tag = 'WaitForSpaceToBeIndexedError';
}

interface DeployArgs {
  type: SpaceType;
  governanceType?: SpaceGovernanceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceCoverUri: string | null;
  initialEditorAddress: string;
  baseUrl: string;
}

export function deploySpace(args: DeployArgs) {
  return Effect.gen(function* () {
    yield* Effect.logInfo('Deploying space');
    const initialEditorAddress = getChecksumAddress(args.initialEditorAddress);

    if (args.type === 'default' && args.governanceType === undefined) {
      throw new Error('Governance type is required for default spaces');
    }

    const governanceType = getGovernanceTypeForSpaceType(args.type, args.governanceType);

    yield* Effect.logInfo('Generating ops for space').pipe(Effect.annotateLogs({ type: args.type }));
    const ops = yield* Effect.tryPromise({
      try: () => generateOpsForSpaceType(args),
      catch: e => new GenerateOpsError(`Failed to generate ops: ${String(e)}`),
    });

    const initialContent = createEditProposal({
      name: args.spaceName,
      author: initialEditorAddress,
      ops,
    });

    yield* Effect.logInfo('Uploading EDIT to IPFS');
    const firstBlockContentUri = yield* new IpfsService(Environment.getConfig().ipfs).upload(initialContent);

    const plugins: PluginInstallationWithViem[] = [];

    const spacePluginInstallItem = getSpacePluginInstallItem({
      firstBlockContentUri,
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getChecksumAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
    });

    plugins.push(spacePluginInstallItem);

    if (governanceType === 'PUBLIC') {
      const governancePluginConfig: Parameters<typeof getGovernancePluginInstallItem>[0] = {
        votingSettings: {
          votingMode: VotingMode.EarlyExecution,
          supportThreshold: 50_000,
          duration: BigInt(60 * 60 * 4), // 4 hours
        },
        memberAccessProposalDuration: BigInt(60 * 60 * 4), // 4 hours
        initialEditors: [getChecksumAddress(initialEditorAddress)],
        pluginUpgrader: getChecksumAddress(initialEditorAddress),
      };

      const governancePluginInstallItem = getGovernancePluginInstallItem(governancePluginConfig);
      plugins.push(governancePluginInstallItem);
    }

    if (governanceType === 'PERSONAL') {
      const personalSpacePluginItem = getPersonalSpaceGovernancePluginInstallItem({
        initialEditor: getChecksumAddress(initialEditorAddress),
      });

      plugins.push(personalSpacePluginItem);
    }

    const createParams: CreateGeoDaoParams = {
      metadataUri: firstBlockContentUri,
      plugins,
    };

    const deployStartTime = Date.now();
    yield* Effect.logInfo('Creating DAO');

    const dao = yield* Effect.retry(
      Effect.tryPromise({
        try: async () => {
          const steps = await createDao(createParams, deployParams);
          let dao = '';
          let pluginAddresses = [];

          for await (const step of steps) {
            switch (step.key) {
              case DaoCreationSteps.CREATING:
                break;
              case DaoCreationSteps.DONE: {
                dao = step.address;
                pluginAddresses = step.pluginAddresses ?? [];
              }
            }
          }

          return { dao, pluginAddresses };
        },
        catch: e => new DeployDaoError(`Failed creating DAO: ${e}`),
      }),
      {
        schedule: Schedule.exponential(Duration.millis(100)).pipe(
          Schedule.jittered,
          Schedule.compose(Schedule.elapsed),
          Schedule.tapInput(() => Effect.succeed(Telemetry.metric(Metrics.deploymentRetry))),
          Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.minutes(1)))
        ),
      }
    );

    const deployEndTime = Date.now() - deployStartTime;
    Telemetry.metric(Metrics.timing('deploy_dao_duration', deployEndTime));
    yield* Effect.logInfo('Deployed DAO successfully!').pipe(
      Effect.annotateLogs({ dao: dao.dao, pluginAddresses: dao.pluginAddresses })
    );

    const waitStartTime = Date.now();

    yield* Effect.logInfo('Waiting for DAO to be indexed into a space').pipe(Effect.annotateLogs({ dao: dao.dao }));
    const waitResult = yield* Effect.tryPromise({
      try: async () => {
        const result = await waitForSpaceToBeIndexed(dao.dao);
        return result;
      },
      catch: e => new WaitForSpaceToBeIndexedError(`Failed waiting for space to be indexed: ${e}`),
    });

    const waitEndTime = Date.now() - waitStartTime;
    Telemetry.metric(Metrics.timing('wait_for_space_to_be_indexed_duration', waitEndTime));
    yield* Effect.logInfo('Space indexed successfully').pipe(
      Effect.annotateLogs({
        dao: dao.dao,
        pluginAddresses: dao.pluginAddresses,
        spaceId: waitResult,
      })
    );

    return waitResult;
  });
}

function getGovernanceTypeForSpaceType(type: SpaceType, governanceType?: SpaceGovernanceType): SpaceGovernanceType {
  switch (type) {
    case 'default':
      // Adding a fallback to appease TS. Ideally we can discriminate whether governanceType
      // should exist based on the space type.
      return governanceType ?? 'PUBLIC';

    // @TODO: Space types for each of the governance types
    default:
      return 'PERSONAL';
  }
}

const query = (daoAddress: string) => ` {
  spaces(filter: { daoAddress: { equalTo: "${getChecksumAddress(daoAddress)}" } }) {
    nodes {
      id

      spacesMetadata {
        nodes {
          entityId
        }
      }
    }
  }
}`;

class TimeoutError extends Error {
  _tag = 'TimeoutError';
}

async function waitForSpaceToBeIndexed(daoAddress: string) {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<{
    spaces: { nodes: { id: string; spacesMetadata: { nodes: { entityId: string }[] } }[] };
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
      yield* Effect.fail(new TimeoutError('Could not find deployed space'));
      return null;
    }

    if (maybeSpace.spacesMetadata.nodes.length === 0) {
      yield* Effect.fail(new TimeoutError('Could not find deployed space'));
      return null;
    }

    return maybeSpace.id;
  });

  const retried = Effect.retry(
    graphqlFetchWithErrorFallbacks,
    Schedule.exponential(100).pipe(
      Schedule.jittered,
      Schedule.compose(Schedule.elapsed),
      // Retry for 60 seconds.
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
  // @TODO can this just be a smart account client?
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
