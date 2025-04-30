#!/usr/bin/env node
import { Command, Options } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Array, Console, Effect, Layer, Option } from 'effect';

import { Environment, make as makeEnvironment } from './environment';
import { Storage, make as makeDb } from './storage/storage';
import { runCache } from './substream/cache-stream';
import { runStream } from './substream/indexer-stream';
import { IpfsCache, make as makeIpfsCache } from './substream/ipfs/ipfs-cache';
import { IpfsCacheWriteWorkerPool, IpfsCacheWriteWorkerPoolLive } from './substream/ipfs/ipfs-cache-write-worker-pool';
import { Telemetry, make as makeTelemetry } from '~/sink/telemetry';

const configs = Options.keyValueMap('c').pipe(Options.optional);

const run = Command.make('run', { configs }, ({ configs }) =>
  Option.match(configs, {
    onNone: () => Console.log('Running indexer'),
    onSome: configs => {
      const keyValuePairs = Array.fromIterable(configs)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      return Console.log(`Running indexer with the following configs: ${keyValuePairs}`);
    },
  })
);

const index = Command.make('index', {}, () => runStream({ startBlockNumber: 881 }));
const cache = Command.make('cache', {}, () => runCache({ startBlockNumber: 881 }));

const base = run.pipe(Command.withSubcommands([index, cache]));
const cli = Command.run(base, {
  name: 'Knowledge Graph indexer',
  version: '0.0.1',
});

const EnvironmentLayer = Layer.effect(Environment, makeEnvironment);
const TelemetryLayer = Layer.effect(Telemetry, makeTelemetry).pipe(Layer.provide(EnvironmentLayer));
const DbLayer = Layer.effect(Storage, makeDb).pipe(Layer.provide(EnvironmentLayer));
const CacheLayer = Layer.effect(IpfsCache, makeIpfsCache).pipe(Layer.provide(DbLayer));
const CacheWorkerLayer = Layer.succeed(IpfsCacheWriteWorkerPool, IpfsCacheWriteWorkerPoolLive);

const layers = Layer.mergeAll(
  NodeContext.layer,
  TelemetryLayer,
  EnvironmentLayer,
  DbLayer,
  CacheLayer,
  CacheWorkerLayer
);

/**
 * Separate commands for indexer vs cacher
 */
cli(process.argv).pipe(Effect.provide(layers), NodeRuntime.runMain);
