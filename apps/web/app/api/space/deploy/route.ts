import { Duration, Effect, Either, Schedule } from 'effect';
import { v4 as uuid } from 'uuid';

import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { slog } from '~/core/utils/utils';

import { deploySpace } from './deploy';

// 5 minutes
export const maxDuration = 300;

export async function GET(request: Request) {
  const requestId = uuid();
  const url = new URL(request.url);
  const baseUrl = url.host;
  const protocol = url.protocol;

  const initialEditorAddress = url.searchParams.get('initialEditorAddress');
  const spaceName = url.searchParams.get('spaceName');
  const spaceAvatarUri = url.searchParams.get('spaceAvatarUri');
  const spaceCoverUri = url.searchParams.get('spaceCoverUri');
  const type = url.searchParams.get('type') as SpaceType | null;
  const governanceType = url.searchParams.get('governanceType') as SpaceGovernanceType | null;

  if (initialEditorAddress === null || spaceName === null || type === null) {
    slog({
      requestId,
      level: 'error',
      message: `Missing required parameters to deploy a space ${JSON.stringify({
        initialEditorAddress,
        spaceName,
        type,
      })}`,
    });

    return new Response(
      JSON.stringify({
        error: 'Missing required parameters',
        reason: 'An initial editor account, space name, and space type are required to deploy a space.',
      }),
      {
        status: 400,
      }
    );
  }

  const deployWithRetry = Effect.retry(
    deploySpace({
      initialEditorAddress,
      spaceName,
      spaceAvatarUri,
      spaceCoverUri,
      baseUrl: `${protocol}//${baseUrl}`,
      type,
      governanceType: governanceType ?? undefined,
    }),
    {
      // Retry deploys for 5 minutes with a 100ms exponential, jittered delay between retries.
      // @TODO: This should not fail on timeout errors
      schedule: Schedule.exponential(Duration.millis(100)).pipe(
        Schedule.jittered,
        Schedule.compose(Schedule.elapsed),
        Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.minutes(5)))
      ),
    }
  );

  const result = await Effect.runPromise(Effect.either(deployWithRetry));

  return Either.match(result, {
    onLeft: error => {
      slog({
        level: 'error',
        message: `Failed to deploy space. message: ${error.message} – cause: ${error.cause}`,
        requestId,
      });

      return new Response(
        JSON.stringify({
          message: `Failed to deploy space. message: ${error.message} – cause: ${error.cause}`,
          reason: error.message,
        }),
        {
          status: 500,
        }
      );
    },
    onRight: spaceId => Response.json({ spaceId }),
  });
}
