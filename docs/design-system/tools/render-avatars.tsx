// Renders the app's generated (no-photo) avatar — design-system/avatar.tsx's BoringAvatar "beam"
// in the app palette — for a few neutral seeds and sizes, so static previews show the real fallback.
// Usage (from <worktree>/apps/web): bun <this file> <out.json>
import * as fs from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar } from '~/design-system/avatar';

const seeds = ['ava', 'ben', 'cleo', 'dev', 'eli', 'fay', 'gus'];
const sizes = [12, 16, 20, 32];
const out: Record<string, string> = {};
for (const s of seeds) for (const z of sizes) out[`${s}:${z}`] = renderToStaticMarkup(React.createElement(Avatar, { value: s, size: z }));
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(Object.keys(out).length);
