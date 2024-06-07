import PgOrderByRelatedPlugin from '@graphile-contrib/pg-order-by-related';
import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import cors from 'cors';
import express from 'express';
import { postgraphile } from 'postgraphile';
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';
import { DATABASE_URL, PORT } from './config';

import { IndexingStatusPlugin } from './status-plugin';

const postgraphileMiddleware = postgraphile(DATABASE_URL, 'public', {
  watchPg: true,
  graphiql: true,
  enhanceGraphiql: true,
  graphileBuildOptions: {
    connectionFilterRelations: true, // default: false
  },
  disableDefaultMutations: true,
  appendPlugins: [PgOrderByRelatedPlugin, ConnectionFilterPlugin, PgSimplifyInflectorPlugin, IndexingStatusPlugin],
});

const app = express();
app.use(cors());
app.use(express.json());
app.options('*', cors());
app.use(postgraphileMiddleware);

const server = app.listen(PORT, () => {
  const address = server.address();

  if (typeof address !== 'string') {
    const href = `http://localhost:${address?.port}${'/graphiql' || '/graphiql'}`;
    console.log(`PostGraphiQL available at ${href} 🚀`);
  } else {
    console.log(`PostGraphile listening on ${address} 🚀`);
  }
});
