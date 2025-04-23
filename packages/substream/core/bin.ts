#!/usr/bin/env node
import { Command } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';

import { Db, make as makeDb } from './db/db';
import { runStream } from './substream';
import { Environment, make as makeEnvironment } from '~/sink/environment';
import { Telemetry, make as makeTelemetry } from '~/sink/telemetry';

const run = Command.make('run', {}, () => runStream({ startBlockNumber: 881 }));

const cli = Command.run(run, {
  name: 'Knowledge graph indexer',
  version: '0.0.1',
});

const environmentLayer = Layer.effect(Environment, makeEnvironment);
const telemetryLayer = Layer.effect(Telemetry, makeTelemetry).pipe(Layer.provide(environmentLayer));
const dbLayer = Layer.effect(Db, makeDb).pipe(Layer.provide(environmentLayer));
const layers = Layer.mergeAll(NodeContext.layer, telemetryLayer, environmentLayer, dbLayer);

cli(process.argv).pipe(Effect.provide(layers), NodeRuntime.runMain);
