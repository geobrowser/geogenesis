#!/usr/bin/env node
import { Command } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';

import { EntityStorage, make as makeEntityStorage } from './kg/entity-storage';
import { Environment, make as makeEnvironment } from './services/environment';
import { Storage, make as makeStorage } from './services/storage/storage';
import { runCache } from './substream/cache-stream';
import { runStream } from './substream/indexer-stream';
import { IpfsCache, make as makeIpfsCache } from './substream/ipfs/ipfs-cache';
import { IpfsCacheWriteWorkerPool, IpfsCacheWriteWorkerPoolLive } from './substream/ipfs/ipfs-cache-write-worker-pool';
import { Telemetry, make as makeTelemetry } from '~/sink/telemetry';

const run = Command.make('run', {}, () => Effect.void);

const index = Command.make('index', {}, () => runStream({ startBlockNumber: 881 }));
const cache = Command.make('cache', {}, () => runCache({ startBlockNumber: 881 }));

const base = run.pipe(Command.withSubcommands([index, cache]));
const cli = Command.run(base, {
  name: 'Knowledge Graph indexer',
  version: '0.0.1',
});

const EnvironmentLayer = Layer.effect(Environment, makeEnvironment);
const TelemetryLayer = Layer.effect(Telemetry, makeTelemetry).pipe(Layer.provide(EnvironmentLayer));
const StorageLayer = Layer.effect(Storage, makeStorage).pipe(Layer.provide(EnvironmentLayer));
const CacheLayer = Layer.effect(IpfsCache, makeIpfsCache).pipe(Layer.provide(StorageLayer));
const CacheWorkerLayer = Layer.succeed(IpfsCacheWriteWorkerPool, IpfsCacheWriteWorkerPoolLive);
const EntityStorageLayer = Layer.effect(EntityStorage, makeEntityStorage).pipe(Layer.provide(StorageLayer));

const layers = Layer.mergeAll(
  NodeContext.layer,
  TelemetryLayer,
  EnvironmentLayer,
  StorageLayer,
  CacheLayer,
  CacheWorkerLayer,
  EntityStorageLayer
);

cli(process.argv).pipe(Effect.provide(layers), NodeRuntime.runMain);
