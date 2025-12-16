import { Effect, Either, Schedule } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { slog } from '~/core/utils/utils';

import { IpfsService } from '../ipfs-service';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return new Response('No file provided', { status: 400 });
  }

  const requestId = uuid();
  const ipfs = new IpfsService(Environment.getConfig().ipfs);

  const effect = Effect.retry(
    // @TODO fix Argument of type 'Buffer' is not assignable to parameter of type 'Uint8Array<ArrayBufferLike>'
    ipfs.upload(Buffer.from(await file.arrayBuffer()) as any),
    Schedule.exponential('100 millis').pipe(Schedule.jittered)
  );

  // Unfortunately we can't compose effects across client-server boundaries as
  // 'use server' expects exported functions to be async. So for uploading to
  // IPFS we go ahead and run the promise here instead of returning an effect
  // fiber back to the effect runtime caller. The caller can then wrap this
  // async call in tryPromise and handle the error.
  const result = await Effect.runPromise(Effect.either(effect));

  if (Either.isLeft(result)) {
    const error = result.left;
    slog({
      level: 'error',
      message: error.message,
      requestId,
    });

    throw error;
  }

  return Response.json({ hash: result.right }, { status: 200 });
}
