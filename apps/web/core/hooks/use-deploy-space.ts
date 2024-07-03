import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { Op, SYSTEM_IDS, VotingMode, createImageEntityOps } from '@geogenesis/sdk';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { NETWORK_IDS } from '@geogenesis/sdk/src/system-ids';
import { Duration, Effect, Either, Schedule } from 'effect';
import { getAddress } from 'viem';

import { Environment } from '~/core/environment';
import { useAragon } from '~/core/hooks/use-aragon';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { StorageClient } from '~/core/io/storage/storage';

import { ID } from '../id';
import { graphql } from '../io/subgraph/graphql';
import { SpaceType } from '../types';
import { generateTriplesForCompany } from '../utils/contracts/generate-triples-for-company';
import { generateTriplesForNonprofit } from '../utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '../utils/ops';
import { Triples } from '../utils/triples';
import {
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from '~/app/dao/encodings';

interface DeployArgs {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string;
}

export function useDeploySpace() {
  const sdkContextParams = useAragon();
  const smartAccount = useSmartAccount();
  const client: Client = new Client(new Context(sdkContextParams));

  const deploy = async (args: DeployArgs) => {
    if (!smartAccount) return;

    const governanceType = getGovernanceTypeForSpaceType(args.type);
    const ops = await publishOpsForSpaceType(args);
    console.log('ops', ops);

    const initialContent = createEditProposal({
      name: args.spaceName,
      author: smartAccount.account.address,
      ops,
    });

    const storage = new StorageClient(Environment.getConfig().ipfs);
    const firstBlockContentUri = await storage.uploadBinary(initialContent);

    const spacePluginInstallItem = getSpacePluginInstallItem({
      // firstBlockContentUri: `ipfs://bafkreihi2yp3mg3ww3dbxprsblkr7zst2gztxwym44ewlkqmfwiva6uxii`, // Root
      // firstBlockContentUri: `ipfs://bafkreiciryzjzov2py2gys3httqxxxoin2dhqfsy2s4ui3cc3mbvgo3mwe`, // Construction
      firstBlockContentUri: `ipfs://${firstBlockContentUri}`,
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
    });

    if (governanceType === 'governance') {
      const governancePluginConfig: Parameters<typeof getGovernancePluginInstallItem>[0] = {
        votingSettings: {
          votingMode: VotingMode.Standard,
          supportThreshold: 50_000,
          duration: BigInt(60 * 60 * 1), // 1 hour seems to be the minimum we can do
        },
        memberAccessProposalDuration: BigInt(60 * 60 * 1), // one hour in seconds
        initialEditors: [getAddress(smartAccount.account.address)],
        pluginUpgrader: getAddress(smartAccount.account.address),
      };

      const governancePluginInstallItem = getGovernancePluginInstallItem(governancePluginConfig);

      const createParams: CreateDaoParams = {
        metadataUri: `ipfs://${firstBlockContentUri}`,
        plugins: [governancePluginInstallItem, spacePluginInstallItem],
      };

      console.log('Creating DAO!', createParams);
      const steps = client.methods.createDao(createParams);

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
        initialEditor: getAddress(smartAccount.account.address),
      });

      const createParams: CreateDaoParams = {
        metadataUri: `ipfs://${firstBlockContentUri}`,
        plugins: [personalSpacePluginItem, spacePluginInstallItem],
      };

      const steps = client.methods.createDao(createParams);

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
  };

  return {
    deploy,
  };
}

async function publishOpsForSpaceType({ type, spaceName, spaceAvatarUri }: DeployArgs) {
  const ops: Op[] = [];
  const newEntityId = ID.createEntityId();

  // Add triples for a Person entity
  if (type === 'default') {
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
    const companyTriples = await generateTriplesForCompany(newEntityId, spaceName, '');
    ops.push(...Triples.prepareTriplesForPublishing(companyTriples, ''));
  }

  if (type === 'nonprofit') {
    const nonprofitTriples = await generateTriplesForNonprofit(newEntityId, spaceName, '');
    ops.push(...Triples.prepareTriplesForPublishing(nonprofitTriples, ''));
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
    case 'company':
      return 'personal';
    case 'nonprofit':
      return 'governance';
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

          return {
            spaces: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to wait for space to be indexed, endpoint: ${endpoint}`);

          return {
            spaces: {
              nodes: [],
            },
          };
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
