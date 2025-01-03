import { Content, System, Templates } from './bootstrap/index.js';

Bun.write('./out/ops.json', JSON.stringify([...System.ops, ...Content.ops, ...Templates.ops]));
