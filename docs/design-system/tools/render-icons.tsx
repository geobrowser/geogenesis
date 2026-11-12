// Renders every component exported from apps/web/design-system/icons/*.tsx to static SVG markup.
// Usage (from <worktree>/apps/web, with node_modules available): bun <this file> <iconsDir> <outDir>
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const [iconsDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const report: Record<string, string[]> = { ok: [], failed: [], skipped: [] };
// response-position-icon is a switch over thumb-up/thumb-down/vote-arrow, not a glyph of its own.
const files = fs.readdirSync(iconsDir).filter(f => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && f !== 'response-position-icon.tsx').sort();
for (const file of files) {
  const base = file.replace(/\.tsx$/, '');
  let mod: Record<string, unknown>;
  try { mod = await import(path.join(iconsDir, file)); } catch (e) { report.failed.push(`${file}: import ${(e as Error).message}`); continue; }
  const comps = Object.entries(mod).filter(([, v]) => typeof v === 'function' && /^[A-Z]/.test((v as Function).name || ''));
  if (comps.length === 0) { report.skipped.push(`${file}: no component exports`); continue; }
  for (const [name, C] of comps) {
    const out = comps.length === 1 ? base : `${base}--${name}`;
    let svg = '';
    for (const props of [{}, { size: 16 }, { position: true, responseKind: 'stance' }]) {
      try {
        svg = renderToStaticMarkup(React.createElement(C as React.FC, props as object));
        // A few icons wrap their <svg> in a sizing <span>; keep the <svg> element itself.
        const inner = /<svg[\s\S]*<\/svg>/.exec(svg);
        if (!svg.startsWith('<svg') && inner) { report.skipped.push(`${file}#${name}: wrapper element dropped, inner <svg> kept`); svg = inner[0]; }
        if (svg.startsWith('<svg')) break;
      } catch { svg = ''; }
    }
    if (!svg.startsWith('<svg')) { report.failed.push(`${file}#${name}: did not render a bare <svg>`); continue; }
    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    fs.writeFileSync(path.join(outDir, `${out}.svg`), svg + '\n');
    report.ok.push(`${out}.svg${/currentColor/.test(svg) ? ' [currentColor]' : ''}`);
  }
}
fs.writeFileSync(path.join(outDir, '..', 'icons-report.json'), JSON.stringify(report, null, 2));
console.log(`ok ${report.ok.length}, failed ${report.failed.length}, skipped ${report.skipped.length}`);
console.log(report.failed.join('\n')); console.log(report.skipped.join('\n'));
