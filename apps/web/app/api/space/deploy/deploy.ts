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
import { Op, SYSTEM_IDS, VotingMode, createImageEntityOps, createRelationship } from '@geobrowser/gdk';
import { DAO_FACTORY_ADDRESS, ENS_REGISTRY_ADDRESS, PLUGIN_SETUP_PROCESSOR_ADDRESS } from '@geobrowser/gdk/contracts';
import { createEditProposal } from '@geobrowser/gdk/proto';
import { Duration, Effect, Either, Schedule } from 'effect';
import { providers } from 'ethers';
import { v4 as uuid } from 'uuid';
import { encodeFunctionData, getAddress, stringToHex, zeroAddress } from 'viem';

import { Environment } from '~/core/environment';
import { IpfsUploadError } from '~/core/errors';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/subgraph/graphql';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { generateTriplesForCompany } from '~/core/utils/contracts/generate-triples-for-company';
import { generateTriplesForNonprofit } from '~/core/utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '~/core/utils/ops';
import { Triples } from '~/core/utils/triples';
import { slog } from '~/core/utils/utils';

import { publicClient, signer, walletClient } from '../../client';
import { IpfsService } from '../../ipfs/ipfs-service';
import { abi as DaoFactoryAbi } from './abi';
import {
  CreateGeoDaoParams,
  PluginInstallationWithViem,
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from '~/app/dao/encodings';

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

interface DeployArgs {
  type: SpaceType;
  governanceType?: SpaceGovernanceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  initialEditorAddress: string;
  baseUrl: string;
}

export function deploySpace(args: DeployArgs) {
  return Effect.gen(function* () {
    const initialEditorAddress = getAddress(args.initialEditorAddress);

    if (args.type === 'default' && args.governanceType === undefined) {
      throw new Error('Governance type is required for default spaces');
    }

    const governanceType = getGovernanceTypeForSpaceType(args.type, args.governanceType);

    const ops = yield* Effect.tryPromise({
      try: () => generateOpsForSpaceType(args),
      catch: e => new GenerateOpsError(`Failed to generate ops: ${String(e)}`),
    });

    const initialContent = createEditProposal({
      name: args.spaceName,
      author: initialEditorAddress,
      ops,
    });

    const firstBlockContentUri = yield* Effect.tryPromise({
      try: () => new IpfsService(Environment.getConfig().ipfs).upload(initialContent),
      catch: e => new IpfsUploadError(`IPFS upload failed: ${e}`),
    });

    const plugins: PluginInstallationWithViem[] = [];

    const spacePluginInstallItem = getSpacePluginInstallItem({
      firstBlockContentUri: `ipfs://${firstBlockContentUri}`,
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
    });

    plugins.push(spacePluginInstallItem);

    if (governanceType === 'PUBLIC') {
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
      plugins.push(governancePluginInstallItem);
    }

    if (governanceType === 'PERSONAL') {
      const personalSpacePluginItem = getPersonalSpaceGovernancePluginInstallItem({
        initialEditor: getAddress(initialEditorAddress),
      });

      plugins.push(personalSpacePluginItem);
    }

    const createParams: CreateGeoDaoParams = {
      metadataUri: `ipfs://${firstBlockContentUri}`,
      plugins,
    };

    return yield* Effect.tryPromise({
      try: async () => {
        console.log('Creating DAO...');
        const steps = await createDao(createParams, deployParams);

        for await (const step of steps) {
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
        }
      },
      catch: e => new DeployDaoError(`Failed creating DAO: ${e}`),
    });
  });
}

async function generateOpsForSpaceType({ type, spaceName, spaceAvatarUri }: DeployArgs) {
  const ops: Op[] = [];
  const newEntityId = ID.createEntityId();

  // Add triples for a Person entity
  if (type === 'default' || type === 'personal') {
    ops.push(
      Ops.create({
        entity: newEntityId,
        attribute: SYSTEM_IDS.NAME,
        value: {
          type: 'TEXT',
          value: spaceName,
        },
      })
    );

    ops.push(
      ...createRelationship({
        fromId: newEntityId,
        toId: SYSTEM_IDS.SPACE_CONFIGURATION,
        relationTypeId: SYSTEM_IDS.TYPES,
      })
    );

    // @TODO: Do we add the Person type? That would mean this has to be a relation
  }

  // @TODO: Clone entity for the other governance types

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
      ...createRelationship({
        fromId: newEntityId,
        toId: typeOp.triple.entity, // Set the avatar relation to point to the entity id of the new entity
        relationTypeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
      })
    );
  }

  return ops;
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
