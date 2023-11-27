import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  authIssue,
  createAuthInterceptor,
  createRegistry,
} from "@substreams/core";
import { readPackageFromFile } from "@substreams/manifest";
import { Data, Effect, Stream } from "effect";
import { genesisStartBlockNum } from "./constants/constants";
import { readCursor, writeCursor } from "./cursor";
import { populateWithEntries } from "./populateEntries";
import { handleRoleGranted, handleRoleRevoked } from "./populateRoles";
import { createSink, createStream } from "./substreams.js/sink/src";
import { invariant } from "./utils/invariant";
import { logger } from "./utils/logger";
import { ZodEntryStreamResponse, ZodRoleChangeStreamResponse } from "./zod";
// import * as MessageStorage from "./messages.js";

export class InvalidPackageError extends Data.TaggedClass(
  "InvalidPackageError"
)<{
  readonly cause: unknown;
  readonly message: string;
}> {}

export function runStream(startBlockNum?: number) {
  const program = Effect.gen(function* (_) {
    const substreamsEndpoint = process.env.SUBSTREAMS_ENDPOINT;
    invariant(substreamsEndpoint, "SUBSTREAMS_ENDPOINT is required");
    const substreamsApiKey = process.env.SUBSTREAMS_API_KEY;
    invariant(substreamsApiKey, "SUBSTREAMS_API_KEY is required");
    const authIssueUrl = process.env.AUTH_ISSUE_URL;
    invariant(authIssueUrl, "AUTH_ISSUE_URL is required");

    logger.enable("pretty");
    logger.info("Logging enabled");

    const manifest = "./geo-substream.spkg";
    const substreamPackage = readPackageFromFile(manifest);

    logger.info("Substream package downloaded");

    const { token } = yield* _(
      Effect.tryPromise({
        try: () => authIssue(substreamsApiKey, authIssueUrl),
        catch: () => new Error(`Could not read package at path ${manifest}`),
      })
    );

    const outputModule = "geo_out";
    const productionMode = true;
    // const finalBlocksOnly = true; TODO - why doesn't createStream accept this option?

    const startCursor = yield* _(
      Effect.tryPromise({
        try: () => readCursor(),
        catch: () => new Error(`Could not read cursor`),
      })
    );

    const registry = createRegistry(substreamPackage);

    const transport = createGrpcTransport({
      baseUrl: substreamsEndpoint,
      httpVersion: "2",
      interceptors: [createAuthInterceptor(token)],
    });

    const stream = createStream({
      connectTransport: transport,
      substreamPackage,
      outputModule,
      startCursor: startBlockNum ? undefined : startCursor,
      startBlockNum: startBlockNum || genesisStartBlockNum,
      productionMode,
    });

    let entriesQueue = Promise.resolve();

    const sink = createSink({
      handleBlockScopedData: (message) =>
        Effect.gen(function* (_) {
          const cursor = message.cursor;
          const blockNumber = Number(message.clock?.number.toString());
          const timestamp = Number(message.clock?.timestamp?.seconds);

          if (blockNumber % 1000 === 0) {
            console.log(`@ Block ${blockNumber}`);
          }

          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(cursor, blockNumber),
              catch: () => new Error(`Could not write cursor`),
            })
          );

          const mapOutput = message.output?.mapOutput;
          if (!mapOutput || mapOutput?.value?.byteLength === 0) {
            return;
          }
          const unpackedOutput = mapOutput.unpack(registry);
          if (!unpackedOutput) {
            console.error("Failed to unpack substream message", mapOutput);
            return;
          }
          const jsonOutput = unpackedOutput.toJson({ typeRegistry: registry });

          const entryResponse = ZodEntryStreamResponse.safeParse(jsonOutput);
          const roleChangeResponse =
            ZodRoleChangeStreamResponse.safeParse(jsonOutput);

          if (entryResponse.success) {
            console.log(
              "Processing ",
              entryResponse.data.entries.length,
              " entries"
            );
            const entries = entryResponse.data.entries;
            entriesQueue = entriesQueue.then(() =>
              populateWithEntries({
                entries,
                blockNumber,
                cursor,
                timestamp,
              })
            );
          } else if (roleChangeResponse.success) {
            console.log(
              "Processing ",
              roleChangeResponse.data.roleChanges.length,
              " role changes"
            );
            roleChangeResponse.data.roleChanges.map((roleChange) => {
              const { granted, revoked } = roleChange;
              if (granted) {
                handleRoleGranted({
                  roleGranted: granted,
                  blockNumber,
                  cursor,
                  timestamp,
                });
              } else if (revoked) {
                handleRoleRevoked({
                  roleRevoked: revoked,
                  blockNumber,
                  cursor,
                  timestamp,
                });
              }
            });
          } else {
            console.error("Failed to parse substream message", unpackedOutput);
          }
        }),
      handleBlockUndoSignal: (message) =>
        Effect.gen(function* (_) {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(message.lastValidCursor, blockNumber),
              catch: () => new Error(`Could not write cursor`),
            })
          );
        }),
    });

    return yield* _(Stream.run(stream, sink));
  });

  return program;
}
