import { chromium } from 'playwright';
const BASE = 'https://geogenesis-git-preston-geo-3008-claim-activity-feed-geo-browser.vercel.app';
const CLAIM = '/space/41e851610e13a19441c4d980f2f2ce6b/2c61cb63c07d654b9b81ae00038befb2';
const browser = await chromium.launch({ args: ['--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(BASE + CLAIM, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(16000);
const report = await page.evaluate(() => {
  // Every row whose header carries a name: the face must sit on the name's line.
  const rows = [];
  for (const img of document.querySelectorAll('img')) {
    const frame = img.closest('.rounded-full');
    if (!frame) continue;
    const row = frame.parentElement?.parentElement;
    if (!row) continue;
    const name = row.querySelector('a > span, span');
    if (!name) continue;
    const f = frame.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    if (f.width === 0 || n.width === 0) continue;
    rows.push({ dy: Math.round(Math.abs((f.top + f.height / 2) - (n.top + n.height / 2))), w: Math.round(f.width) });
  }
  const tagOrder = [];
  for (const el of document.querySelectorAll('span')) {
    const t = el.textContent?.trim();
    if (t !== 'Claim' && t !== 'Comment') continue;
    const prev = el.previousElementSibling?.textContent?.trim() || '';
    tagOrder.push({ kind: t, precededBy: prev });
  }
  return {
    frames: rows.length,
    misalignedByMoreThan12px: rows.filter(r => r.dy > 12).length,
    worstDy: Math.max(0, ...rows.map(r => r.dy)),
    oversized: rows.filter(r => r.w > 64).length,
    sideBeforeTag: tagOrder.filter(t => ['Agree', 'Disagree', 'Verify', 'Dispute'].includes(t.precededBy)).length,
    tags: tagOrder.length,
  };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
