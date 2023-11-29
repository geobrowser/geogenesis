import PgOrderByRelatedPlugin from '@graphile-contrib/pg-order-by-related';
import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import http from 'node:http';
import https from 'node:https';
import { postgraphile } from 'postgraphile';
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';

require('dotenv').config();

const postgraphileMiddleware = postgraphile(process.env.DATABASE_URL, 'public', {
  watchPg: true,
  graphiql: true,
  enhanceGraphiql: true,
  graphileBuildOptions: {
    connectionFilterRelations: true, // default: false
  },
  appendPlugins: [PgOrderByRelatedPlugin, ConnectionFilterPlugin, PgSimplifyInflectorPlugin],
});

const server =
  process.env.NODE_ENV === 'production'
    ? https.createServer(postgraphileMiddleware)
    : http.createServer(postgraphileMiddleware);

server.listen(process.env.PORT ?? 5001, () => {
  console.log(`🚀 Server ready at http://localhost:${process.env.PORT || 5001}/graphql`);
});
