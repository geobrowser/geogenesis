import { Effect, Either, Schedule } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { slog } from '~/core/utils/utils';

import { IpfsService } from '../ipfs-service';

export async function POST(request: Request) {
  console.log('starting route.upload-file', Environment.getConfig().ipfs);
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    console.error('no file provided');
    return new Response('No file provided', { status: 400 });
  }

  console.log('uploading file to ipfs gateway', Environment.getConfig().ipfs);

  const requestId = uuid();
  console.log('uploading file to ipfs gateway', Environment.getConfig().ipfs);
  const ipfs = new IpfsService(Environment.getConfig().ipfs);
  const effect = Effect.retry(ipfs.uploadFile(file), Schedule.exponential('100 millis').pipe(Schedule.jittered));

  // Unfortunately we can't compose effects across client-server boundaries as
  // 'use server' expects exported functions to be async. So for uploading to
  // IPFS we go ahead and run the promise here instead of returning an effect
  // fiber back to the effect runtime caller. The caller can then wrap this
  // async call in tryPromise and handle the error
  const result = await Effect.runPromise(Effect.either(effect));

  if (Either.isLeft(result)) {
    const error = result.left;
    slog({
      level: 'error',
      message: error.message,
      requestId,
    });

    return Response.json(
      {
        error: error,
      },
      { status: 400 }
    );
  }

  return Response.json({ hash: result.right }, { status: 200 });
}
