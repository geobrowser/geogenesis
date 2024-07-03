'use client';

import { Client, Context, CreateDaoParams, DaoCreationSteps } from '@aragon/sdk-client';
import { VotingMode } from '@geogenesis/sdk';
import { Duration, Effect, Either, Schedule } from 'effect';
import { useRouter } from 'next/navigation';
import { getAddress } from 'viem';

import * as React from 'react';

import { Environment } from '~/core/environment';
import { useAragon } from '~/core/hooks/use-aragon';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { graphql } from '~/core/io/subgraph/graphql';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { Input } from '~/design-system/input';

import {
  getGovernancePluginInstallItem,
  getPersonalSpaceGovernancePluginInstallItem,
  getSpacePluginInstallItem,
} from '../dao/encodings';

export default function ImportSpace() {
  const [type, setSelectedSpaceType] = React.useState<'personal' | 'governance'>('governance');
  const [hash, setHash] = React.useState<string>('');
  const [spaceId, setSpaceId] = React.useState<string>('');
  const router = useRouter();

  const sdkContextParams = useAragon();
  const smartAccount = useSmartAccount();

  if (!sdkContextParams) throw new Error('getypeluginContext is undefined');
  const client: Client = new Client(new Context(sdkContextParams));

  const handleImportSpace = async () => {
    if (!smartAccount) return;
    if (!hash) return;

    const spacePluginInstallItem = getSpacePluginInstallItem({
      firstBlockContentUri: `ipfs://${hash}`,
      // @HACK: Using a different upgrader from the governance plugin to work around
      // a limitation in Aragon.
      pluginUpgrader: getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
    });

    if (type === 'governance') {
      const governancePluginConfig: Parameters<typeof getGovernancePluginInstallItem>[0] = {
        votingSettings: {
          votingMode: VotingMode.Standard,
          supportThreshold: 50_000,
          duration: BigInt(60 * 60 * 1), // 1 hour seems to be the minimum we can do
        },
        memberAccessProposalDuration: BigInt(60 * 60 * 1), // one hour in seconds
        initialEditors: [
          getAddress(smartAccount.account.address),
          // getAddress('0x35483105944CD199BD336D6CEf476ea20547a9b5'),
          // getAddress('0xE343E47d821a9bcE54F12237426A6ef391066b60'),
          // getAddress('0x42de4E0f9CdFbBc070e25efFac78F5E5bA820853'),
        ],
        pluginUpgrader: getAddress(smartAccount.account.address),
      };

      const governancePluginInstallItem = getGovernancePluginInstallItem(governancePluginConfig);

      const createParams: CreateDaoParams = {
        metadataUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
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
            case DaoCreationSteps.DONE: {
              console.log({
                daoAddress: step.address,
                pluginAddresses: step.pluginAddresses,
              });

              const id = await waitForSpaceToBeIndexed(step.address);
              if (id) setSpaceId(id);
            }
          }
        } catch (err) {
          console.error('Failed creating DAO', err);
        }
      }
    }

    if (type === 'personal') {
      const personalSpacePluginItem = getPersonalSpaceGovernancePluginInstallItem({
        initialEditor: getAddress(smartAccount.account.address),
      });

      const createParams: CreateDaoParams = {
        metadataUri: 'ipfs://QmVnJgMByupANQ544rmPqNgr5vNqaYvCLDML4nZowfHMrt',
        plugins: [personalSpacePluginItem, spacePluginInstallItem],
      };

      const steps = client.methods.createDao(createParams);

      for await (const step of steps) {
        try {
          switch (step.key) {
            case DaoCreationSteps.CREATING:
              console.log({ txHash: step.txHash });
              break;
            case DaoCreationSteps.DONE: {
              console.log({
                daoAddress: step.address,
                pluginAddresses: step.pluginAddresses,
              });

              const id = await waitForSpaceToBeIndexed(step.address);
              if (id) setSpaceId(id);
            }
          }
        } catch (err) {
          console.error('Failed creating DAO', err);
        }
      }
    }
  };

  return (
    // @TODO:
    // Some instructions as to what to expect will happen
    // waitForSpaceDeployment to get id for space
    // selector for space type
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Dropdown
          trigger={<p>{type}</p>}
          options={[
            {
              label: 'Governance',
              onClick: () => setSelectedSpaceType('governance'),
              disabled: false,
              value: 'governance',
            },
            {
              label: 'Personal',
              onClick: () => setSelectedSpaceType('personal'),
              disabled: false,
              value: 'personal',
            },
          ]}
        />
        <Input
          className="w-full border border-black px-3 py-2"
          onChange={e => setHash(e.currentTarget.value)}
          placeholder="IPFS hash, e.g., bafkreiciryzjzov2py2gys3httqxxxoin2dhqfsy2s4ui3cc3mbvgo3mwe"
        />
      </div>

      <Button variant="primary" onClick={handleImportSpace}>
        Import Space
      </Button>

      <Button variant="tertiary" disabled={!spaceId} onClick={() => router.push(NavUtils.toSpace(spaceId))}>
        Go to imported space
      </Button>
    </div>
  );
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
