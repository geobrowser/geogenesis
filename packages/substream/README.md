# [`Substreams`](https://substreams.streamingfast.io/) Sink CLI `Node.js`

[![Build Status](https://github.com/pinax-network/substreams-sink/actions/workflows/ci.yml/badge.svg)](https://github.com/pinax-network/substreams-sink/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/substreams-sink.svg)](https://badge.fury.io/js/substreams-sink)
![License](https://img.shields.io/github/license/pinax-network/substreams-sink)

> `substreams-sink` is the code template to build Substreams sinks in NodeJS. Sinks allows developers to pipe data extracted from a blockchain to a specified application.

## 📖 Documentation

<!-- ### https://www.npmjs.com/package/substreams-sink -->

### Further resources

- [**Substreams** documentation](https://substreams.streamingfast.io)
- [Subtreams sink project template Github repo](https://github.com/pinax-network/substreams-sink-template)

## 🚀 Quick start

### Installation

```bash
npm install substreams-sink
```

### Features

- [x] includes [Commander.js](https://github.com/tj/commander.js/) helper CLI
- [x] includes [tslog](https://github.com/fullstack-build/tslog) helper logger
- [x] handle reading/saving **Substreams** `cursor` from file or URL
- [x] reads config `.env` file
- [x] includes Prometheus metrics helpers

### CLI

```bash
Usage: substreams-sink run [options]

Substreams Sink

Options:
  -e --substreams-endpoint <string>    Substreams gRPC endpoint to stream data from (env: SUBSTREAMS_ENDPOINT)
  --manifest <string>                  URL of Substreams package (env: MANIFEST)
  --module-name <string>               Name of the output module (declared in the manifest) (env: MODULE_NAME)
  -s --start-block <int>               Start block to stream from (defaults to -1, which means the initialBlock of the first module you are streaming) (default: "-1", env: START_BLOCK)
  -t --stop-block <int>                Stop block to end stream at, inclusively (env: STOP_BLOCK)
  -p, --params <string...>             Set a params for parameterizable modules. Can be specified multiple times. (ex: -p module1=valA -p module2=valX&valY) (default: [], env: PARAMS)
  --substreams-api-token <string>      API token for the substream endpoint or API key if '--auth-issue-url' is specified (default: "", env: SUBSTREAMS_API_TOKEN)
  --auth-issue-url <string>            URL used to issue a token (default: "https://auth.pinax.network/v1/auth/issue", env: AUTH_ISSUE_URL)
  --delay-before-start <int>           Delay (ms) before starting Substreams (default: 0, env: DELAY_BEFORE_START)
  --cursor-path <string>               File path or URL to cursor lock file (default: "cursor.lock", env: CURSOR_PATH)
  --http-cursor-auth <string>          Basic auth credentials for http cursor (ex: username:password) (env: HTTP_CURSOR_AUTH)
  --production-mode <boolean>          Enable production mode, allows cached substreams data if available (default: "false", env: PRODUCTION_MODE)
  --inactivity-seconds <int>           If set, the sink will stop when inactive for over a certain amount of seconds (default: 300, env: INACTIVITY_SECONDS)
  --hostname <string>                  The process will listen on this hostname for any HTTP and Prometheus metrics requests (default: "localhost", env: HOSTNAME)
  --port <int>                         The process will listen on this port for any HTTP and Prometheus metrics requests (default: 9102, env: PORT)
  --metrics-labels [string...]         To apply generic labels to all default metrics (ex: --labels foo=bar) (default: {}, env: METRICS_LABELS)
  --collect-default-metrics <boolean>  Collect default metrics (default: "false", env: COLLECT_DEFAULT_METRICS)
  --headers [string...]                Set headers that will be sent on every requests (ex: --headers X-HEADER=headerA) (default: {}, env: HEADERS)
  --final-blocks-only <boolean>        Only process blocks that have pass finality, to prevent any reorg and undo signal by staying further away from the chain HEAD (default: "false", env: FINAL_BLOCKS_ONLY)
  --verbose <boolean>                  Enable verbose logging (default: "false", env: VERBOSE)
  -h, --help                           display help for command
```

### Example

```js
import pkg from "./package.json" assert { type: "json" };
import { commander, setup, prometheus, http, logger } from "./dist/index.js";

// Setup CLI using Commander
const program = commander.program(pkg);
const command = commander.run(program, pkg);
logger.setName(pkg.name);

// Custom Prometheus Counters
const customCounter = prometheus.registerCounter("custom_counter");

command.action(async options => {
  // Setup sink for Block Emitter
  const { emitter } = await setup(options);

  // Stream Blocks
  emitter.on("anyMessage", (message, cursor, clock) => {
    customCounter?.inc(1);
    console.log(message);
    console.log(cursor);
    console.log(clock);
  });

  // Setup HTTP server & Prometheus metrics
  http.listen(options);

  // Start streaming
  await emitter.start();
  http.server.close();
})
program.parse();
```
