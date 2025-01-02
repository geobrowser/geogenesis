import PgOrderByRelatedPlugin from '@graphile-contrib/pg-order-by-related';
import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import cors from 'cors';
import express from 'express';
import { postgraphile } from 'postgraphile';
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';
import responseTime from 'response-time';

import { DATABASE_URL, PORT, TELEMETRY_TOKEN, TELEMETRY_URL } from './config';
import { MetaPlugin } from './meta-plugin';
import { rewriteRequestkMiddleware } from './middleware';
import { makeNonNullRelationsPlugin } from './non-null-plugin';
import { IndexingStatusPlugin } from './status-plugin';

const postgraphileMiddleware = postgraphile(DATABASE_URL, 'public', {
  watchPg: true,
  graphiql: true,
  enhanceGraphiql: true,
  graphileBuildOptions: {
    connectionFilterRelations: true, // default: false
  },
  setofFunctionsContainNulls: false,
  disableDefaultMutations: true,
  appendPlugins: [
    PgOrderByRelatedPlugin,
    ConnectionFilterPlugin,
    PgSimplifyInflectorPlugin,
    IndexingStatusPlugin,
    MetaPlugin,
    // @ts-expect-error type mismatch
    makeNonNullRelationsPlugin,
  ],
});

const app = express();
app.use(cors());
app.use(express.json());
app.options('*', cors());
app.use(rewriteRequestkMiddleware);
app.use(
  responseTime(function (req, res, time) {
    log(time);
  })
);
app.use(postgraphileMiddleware);

function log(time: number) {
  if (!TELEMETRY_URL || !TELEMETRY_TOKEN) {
    return;
  }

  fetch(TELEMETRY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TELEMETRY_TOKEN}`,
    },
    body: JSON.stringify({
      dt: new Date()
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d+Z$/, ' UTC'),
      name: 'request_time',
      gauge: { value: time },
    }),
  });
}

const server = app.listen(PORT, () => {
  const address = server.address();

  if (typeof address !== 'string') {
    const href = `http://localhost:${address?.port}/graphiql`;
    console.log(`PostGraphiQL available at ${href} 🚀`);
  } else {
    console.log(`Server listening on ${address} 🚀`);
  }
});
