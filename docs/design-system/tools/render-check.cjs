// Screenshots every project/components/*/preview.html the way the artifact frame loads it
// (tokens.css + bundle.css before the preview). Usage: node tools/render-check.cjs <node_modules> <outDir> [Comp...]
const path = require('path'), fs = require('fs');
const [nm, outDir, ...only] = process.argv.slice(2);
const req = require('module').createRequire(path.join(path.resolve(nm), 'noop.js'));
const { chromium } = req('playwright');
const root = path.resolve(__dirname, '..', 'project');
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 400 } });
  const comps = only.length ? only : fs.readdirSync(path.join(root, 'components')).filter(d => fs.existsSync(path.join(root, 'components', d, 'preview.html')));
  for (const c of comps) {
    let html = fs.readFileSync(path.join(root, 'components', c, 'preview.html'), 'utf8');
    const head = `<link rel="stylesheet" href="file://${root}/tokens.css"><link rel="stylesheet" href="file://${root}/components/bundle.css">`;
    html = html.replace('<head>', `<head>${head}`).replace('<html lang="en">', '<html lang="en" data-theme="light">');
    const tmp = path.join(root, 'components', c, '__check.html');
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${c}.png`), fullPage: true });
    fs.unlinkSync(tmp);
  }
  await browser.close();
  console.log('shots', comps.length);
})();
