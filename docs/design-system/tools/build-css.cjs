// Compiles project/components/bundle.css with Tailwind v4, using the geogenesis web app's own
// apps/web/styles/styles.css (its @theme tokens, custom variants, @utility rules and base layer),
// scanning only the static previews under project/components for class candidates.
//
// Usage: node tools/build-css.cjs <geogenesis checkout at the synced ref> <node_modules with tailwindcss 4>
//   e.g. node tools/build-css.cjs ../geo-ds-wt /path/to/geogenesis/node_modules
const fs = require('fs');
const path = require('path');

const [checkout, nodeModules] = process.argv.slice(2).map(p => path.resolve(p));
const root = path.resolve(__dirname, '..');
const componentsDir = path.join(root, 'project/components');
const stylesDir = path.join(checkout, 'apps/web/styles');
const req = require('module').createRequire(path.join(nodeModules, 'noop.js'));
const { compile } = req('@tailwindcss/node');
const { Scanner } = req('@tailwindcss/oxide');

(async () => {
  let css = fs.readFileSync(path.join(stylesDir, 'styles.css'), 'utf8');
  // Only the previews are scanned, never the app's source tree.
  css = css.replace("@import 'tailwindcss';", "@import 'tailwindcss' source(none);");
  css += '\n' + fs.readFileSync(path.join(__dirname, 'preview-extras.css'), 'utf8');
  const compiler = await compile(css, { base: stylesDir, onDependency: () => {} });
  const scanner = new Scanner({ sources: [{ base: componentsDir, pattern: '**/preview.html', negated: false }] });
  const candidates = scanner.scan();
  const out = compiler.build(candidates);
  const header = `/* Geo Design System — components stylesheet. Tailwind ${req('tailwindcss/package.json').version} compile of geogenesis apps/web/styles/styles.css + tools/preview-extras.css over every project/components/<Comp>/preview.html. Regenerate with tools/build-css.cjs. */\n`;
  fs.writeFileSync(path.join(componentsDir, 'bundle.css'), header + out);
  console.log(`candidates ${candidates.length}, bundle.css ${(header + out).length} bytes`);
})().catch(e => { console.error(e); process.exit(1); });
