import { daoSpace } from '@geoprotocol/geo-sdk';

import { Effect, Either } from 'effect';

import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

import { useSmartAccountTransaction } from '../hooks/use-smart-account-transaction';

interface RequestToBeMemberParams {
  spaceId: string;
  personalSpaceId: string;
  tx: ReturnType<typeof useSmartAccountTransaction>;
}

export async function requestToBeMemberDirect({ spaceId, personalSpaceId, tx }: RequestToBeMemberParams) {
  if (!validateSpaceId(spaceId)) {
    throw new Error('Invalid target space ID');
  }

  if (!validateSpaceId(personalSpaceId)) {
    throw new Error('Invalid personal space ID');
  }

  console.log('Requesting to be member', { authorSpaceId: personalSpaceId, spaceId });

  const { calldata: callData } = daoSpace.proposeRequestMembership({
    authorSpaceId: personalSpaceId,
    spaceId,
  });

  const writeTxEffect = tx(callData).pipe(
    Effect.withSpan('web.write.requestMembership'),
    Effect.annotateSpans({
      'io.operation': 'request_membership',
      'space.type': 'DAO',
      'governance.action': 'membership_requested',
    })
  );

  const result = await runEffectEither(writeTxEffect);

  Either.match(result, {
    onLeft: error => {
      console.error('Failed to request membership', { spaceId, personalSpaceId }, error);
      throw error;
    },
    onRight: hash => console.log('Successfully requested to be member. Transaction hash:', hash),
  });
}
