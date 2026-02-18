import { createServer } from '@mswjs/http-middleware';

import { handlers } from './handlers';

const PORT = 4010;

const server = createServer(...handlers);

server.listen(PORT, () => {
  console.log(`[mock-api] listening on http://127.0.0.1:${PORT}`);
});
