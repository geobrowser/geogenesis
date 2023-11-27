import { Code, ConnectError, type Transport, createPromiseClient } from "@connectrpc/connect";
import { createRequest } from "@substreams/core";
import { type Module, type Package, type Response, Stream as StreamService } from "@substreams/core/proto";
import { Data, Duration, Effect, Metric, Option, Predicate, Ref, Schedule, Sink, Stream } from "effect";

import * as Metrics from "./metrics.js";

export type StreamError = RetryableStreamError | FatalStreamError;

export class RetryableStreamError extends Data.TaggedClass("RetryableStreamError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class FatalStreamError extends Data.TaggedClass("FatalStreamError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type CreateStreamOptions = {
  /**
   * The transport to use to connect to the backend service.
   */
  connectTransport: Transport;
  /**
   * The substream package.
   */
  substreamPackage: Package;
  /**
   * The module to stream.
   */
  outputModule: string | Module;
  /**
   * The block number to start streaming from.
   *
   * @default undefined `start from the initial block of the selected module`
   */
  startBlockNum?: number | bigint | undefined;
  /**
   * The block number to stop streaming at.
   *
   * @default undefined (follow the chain indefinitely)
   */
  stopBlockNum?: number | bigint | `+${number}` | undefined;
  /**
   * The cursor to start streaming from.
   *
   * Useful for continuing a stream from a specific point.
   *
   * @default undefined (start from the beginning)
   */
  startCursor?: string | undefined;
  /**
   * The maximum number of seconds to retry the stream for on failure.
   *
   * We track the current cursor of the last emitted response internally. Whenever the source stream fails
   * it is automatically restarted from the last recorded cursor.
   *
   * We employ a jittered, exponential backoff strategy for retries.
   *
   * @default 300 (5 minutes)
   */
  maxRetrySeconds?: number | undefined;
  /**
   * Whether to use production mode.
   *
   * @default false
   */
  productionMode?: boolean | undefined;
};

export function createStream({
  connectTransport,
  substreamPackage,
  outputModule,
  startBlockNum,
  stopBlockNum,
  startCursor,
  productionMode,
  maxRetrySeconds = 300,
}: CreateStreamOptions): Stream.Stream<never, StreamError, Response> {
  const create = Effect.gen(function* (_) {
    const requestActiveStartBlock = yield* _(Ref.make(BigInt(0)));
    const currentCursor = yield* _(Ref.make(startCursor ? Option.some<string>(startCursor) : Option.none<string>()));

    const metrics = Sink.forEach((response: Response) =>
      Effect.gen(function* (_) {
        const size = response.toBinary().byteLength;
        yield* _(Metric.incrementBy(Metrics.MessageSizeBytes, size));

        const { case: kind, value: message } = response.message;

        switch (kind) {
          case "blockScopedData": {
            yield* _(Metric.increment(Metrics.DataMessageCount));
            yield* _(Metric.incrementBy(Metrics.DataMessageSizeBytes, size));

            // TODO: Add support for bigint metrics to effect-ts.
            const block = Number(message.clock?.number ?? 0);
            const timestamp = Number(message.clock?.timestamp?.seconds ?? 0);
            const now = Date.now() / 1000;

            yield* _(Metric.set(Metrics.HeadBlockNumber, block));
            yield* _(Metric.set(Metrics.HeadBlockTime, timestamp));
            yield* _(Metric.set(Metrics.HeadBlockTimeDrift, now - timestamp));
            return;
          }

          case "blockUndoSignal": {
            yield* _(Metric.increment(Metrics.UndoMessageCount));
            yield* _(Metric.incrementBy(Metrics.UndoMessageSizeBytes, size));
            return;
          }

          case "progress": {
            yield* _(Metric.increment(Metrics.ProgressMessageCount));
            yield* _(Metric.incrementBy(Metrics.ProgressMessageSizeBytes, size));

            let totalProcessedBlocks = BigInt(0);
            const latestEndBlockPerStage = new Map<number, bigint>();
            const jobsPerStage = new Map<number, bigint>();

            for (const job of message.runningJobs) {
              totalProcessedBlocks += job.processedBlocks;

              const jobEndBlock = job.startBlock + job.processedBlocks;
              const prevEndBlock = latestEndBlockPerStage.get(job.stage) ?? BigInt(0);
              if (jobEndBlock > prevEndBlock) {
                latestEndBlockPerStage.set(job.stage, jobEndBlock);
              }

              jobsPerStage.set(job.stage, (jobsPerStage.get(job.stage) ?? BigInt(0)) + BigInt(1n));
            }

            for (const [i, block] of latestEndBlockPerStage) {
              // TODO: Add support for bigint metrics to effect-ts.
              const metric = Metric.tagged(Metrics.ProgressMessageLastBlock, "stage", `stage-${i}`);
              yield* _(Metric.set(metric, Number(block)));
            }

            for (const [i, jobs] of jobsPerStage) {
              // TODO: Add support for bigint metrics to effect-ts.
              const metric = Metric.tagged(Metrics.ProgressMessageRunningJobs, "stage", `stage-${i}`);
              yield* _(Metric.set(metric, Number(jobs)));
            }

            const startBlock = yield* _(Ref.get(requestActiveStartBlock));
            const stagesModules = new Map<number, string[]>();
            for (const [i, stage] of message.stages.entries()) {
              stagesModules.set(i, stage.modules);

              for (const [j, range] of stage.completedRanges.entries()) {
                // The last stage in production is a mapper. There may be "completed ranges" below the one that includes our start block.
                if (productionMode && i === message.stages.length - 1) {
                  if (startBlock <= range.startBlock && range.endBlock >= startBlock) {
                    const metric = Metric.tagged(Metrics.ProgressMessageLastContiguousBlock, "stage", `stage-${i}`);
                    yield* _(Metric.set(metric, Number(range.endBlock)));
                  }
                } else {
                  if (j === 0) {
                    const metric = Metric.tagged(Metrics.ProgressMessageLastContiguousBlock, "stage", `stage-${i}`);
                    yield* _(Metric.set(metric, Number(range.endBlock)));
                  }
                }

                totalProcessedBlocks += range.endBlock - range.startBlock;
              }
            }

            // TODO: Add support for bigint metrics to effect-ts.
            Metric.set(Metrics.ProgressMessageTotalProcessedBlocks, Number(totalProcessedBlocks));

            return;
          }

          case "session": {
            const session = JSON.stringify({
              max_parallel_workers: String(message.maxParallelWorkers),
              resolved_start_block: String(message.resolvedStartBlock),
              trace_id: String(message.traceId),
            });

            yield* _(Effect.logInfo(`Session initialized with remote endpoint ${session}`));
            yield* _(Ref.set(requestActiveStartBlock, message.resolvedStartBlock));
            return;
          }

          case "debugSnapshotComplete":
          case "debugSnapshotData": {
            yield* _(Effect.logWarning("Received debug snapshot message, there is no reason to receive those here"));
            return;
          }

          case "fatalError": {
            yield* _(
              Effect.fail(
                new FatalStreamError({
                  message: "Received fatal error message from the backend",
                  cause: message,
                }),
              ),
            );
            return;
          }

          default: {
            yield* _(Effect.logWarning("Received unknown message type"));
            yield* _(Metric.increment(Metrics.UnknownMessageCount));
            yield* _(Metric.incrementBy(Metrics.UnknownMessageSizeBytes, size));
            return;
          }
        }
      }),
    );

    const aquire = Ref.get(currentCursor).pipe(
      Effect.map((startCursor) => Option.getOrUndefined(startCursor)),
      Effect.map((startCursor) => {
        const client = createPromiseClient(StreamService, connectTransport);
        const request = createRequest({
          substreamPackage,
          productionMode,
          outputModule,
          startBlockNum,
          stopBlockNum,
          startCursor,
        });

        const controller = new AbortController();
        const stream = Stream.fromAsyncIterable(client.blocks(request, { signal: controller.signal }), (cause) => {
          if (cause instanceof ConnectError) {
            // TODO: Cover all possible connect protocol error code cases.
            if (
              cause.code === Code.Unauthenticated ||
              cause.code === Code.Canceled ||
              cause.code === Code.InvalidArgument
            ) {
              return new FatalStreamError({
                message: `Stream failed with unretryable error (code ${cause.code})`,
                cause,
              });
            }
          }

          return new RetryableStreamError({
            message: "Stream failed with retryable error",
            cause,
          });
        });

        return { controller, stream };
      }),
    );

    const stream = Stream.acquireRelease(aquire, (scope, exit) => Effect.sync(() => scope.controller.abort(exit))).pipe(
      Stream.flatMap((scope) => scope.stream),
      Stream.tapSink(metrics),
      Stream.tap((response) => {
        if (response.message.case === "blockScopedData") {
          return Ref.set(currentCursor, Option.some(response.message.value.cursor));
        } else if (response.message.case === "blockUndoSignal") {
          return Ref.set(currentCursor, Option.some(response.message.value.lastValidCursor));
        }

        return Effect.unit;
      }),
      Stream.tapError((error) =>
        Effect.all([
          Metric.increment(Metrics.SubstreamsErrorCount),
          Effect.logWarning(`Encountered an error while streaming: ${String(error)}}`),
        ]),
      ),
    );

    return stream.pipe(
      Stream.retry(
        Schedule.exponential(Duration.millis(100), 2).pipe(
          // Retry with jittered exponential backoff.
          Schedule.jittered,
          // With a maximum delay of 10 seconds between retry.
          Schedule.either(Schedule.spaced(Duration.seconds(10))),
          // Retry for up to 3 minutes.
          Schedule.compose(Schedule.elapsed),
          // Retry for the specified maximum duration.
          Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(maxRetrySeconds ?? 300))),
          // Retry only on retryable errors.
          Schedule.whileInput(Predicate.isTagged("RetryableStreamError")),
          // TODO: There seems to be a bug with type inference here for the `Schedule` input.
          Schedule.tapInput(() => Effect.logWarning("Retrying after retryable stream error")),
        ),
      ),
    );
  });

  return Stream.unwrap(create);
}
