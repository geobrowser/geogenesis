import { Graph, getChecksumAddress } from '@graphprotocol/grc-20';
import { Effect } from 'effect';

import { Environment } from '~/core/environment';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';

class GenerateOpsError extends Error {
  readonly _tag = 'GenerateOpsError';
}

interface DeployArgs {
  type: SpaceType;
  governanceType?: SpaceGovernanceType;
  spaceName: string;
  spaceAvatarUri: string | null;
  spaceCoverUri: string | null;
  initialEditorAddress: string;
  entityId?: string;
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
    const { spaceEntityId, ops } = yield* Effect.tryPromise({
      try: () => generateOpsForSpaceType(args),
      catch: e => new GenerateOpsError(`Failed to generate ops: ${String(e)}`),
    });

    const result = yield* Effect.tryPromise({
      try: () =>
        Graph.createSpace({
          name: args.spaceName,
          spaceEntityId,
          ops,
          network: Environment.getConfig().chainId === '19411' ? 'TESTNET' : 'MAINNET',
          editorAddress: initialEditorAddress,
        }),
      catch: e => new GenerateOpsError(`Failed to generate ops: ${String(e)}`),
    });

    return result.id as string;
  });
}

function getGovernanceTypeForSpaceType(type: SpaceType, governanceType?: SpaceGovernanceType): SpaceGovernanceType {
  switch (type) {
    case 'default':
      // Adding a fallback to appease TS. Ideally we can discriminate whether governanceType
      // should exist based on the space type.
      return governanceType ?? 'PUBLIC';

    case 'academic-field':
    case 'dao':
    case 'industry':
    case 'interest':
    case 'region':
    case 'protocol':
      return 'PUBLIC';
    default:
      return 'PERSONAL';
  }
}
