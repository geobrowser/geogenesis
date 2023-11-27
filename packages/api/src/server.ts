import http from 'node:http';
import https from 'node:https';
import { postgraphile } from 'postgraphile';
import PgOrderByRelatedPlugin from '@graphile-contrib/pg-order-by-related';
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';
import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import Koa from 'koa';

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

const app = new Koa();
app.use(postgraphileMiddleware);
const callback = app.callback();

const server = process.env.NODE_ENV === 'production' ? https.createServer(callback) : http.createServer(callback);

server.listen(process.env.PORT || 5001, () => {
    console.log(`🚀 Server ready at http://localhost:${process.env.PORT || 5001}/graphql`);
});
