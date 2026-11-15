// Smoke test: serve the site statically, load index.html at five widths (and a 900 px tall desktop),
// in three data modes, and check: no console errors, every section rendered, no horizontal page scroll.
//   offline  : every external API blocked  → hero falls back to the dated snapshot, everything else "—"
//   fixtures : floor / bands / coins served from test/fixtures, externals blocked
//   live     : real network (DexScreener, RPC, GeckoTerminal, Jupiter)
// Screenshots go to $SHOTS (default ./test/shots, git-ignored).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.env.SHOTS || join(root, 'test/shots');
const MODES = (process.env.MODES || 'offline,fixtures,live').split(',');
const SIZES = [[320, 800], [375, 812], [768, 1024], [1280, 900], [1600, 1000]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
for (const mode of MODES) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage(), errors = [];
    // GeckoTerminal 429s arrive without CORS headers: external throttling, handled by back-off, so not counted
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|api\.geckoterminal\.com/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (mode !== 'live') await page.route((u) => !u.href.startsWith(base), (r) => r.abort());
    if (mode === 'fixtures') await page.route(/\/data\/(floor|bands|coins)\.json/, (r) => r.fulfill({ path: join(root, 'test/fixtures', r.request().url().split('/').pop()) }));
    await page.goto(base + 'index.html', { waitUntil: 'load' });
    await page.waitForTimeout(mode === 'live' ? 6000 : 2500);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      sections: ['.hero', '#strip', '#pool', '#tape', '#book', '#how', '.ftr'].filter((s) => { const el = document.querySelector(s); return !el || el.getBoundingClientRect().height < 20; }),
      sym: document.querySelector('.k-sym')?.textContent, src: document.querySelector('#stage')?.dataset.src,
      floorRows: document.querySelectorAll('#pooltape tbody tr').length, tracked: document.querySelector('[data-k="tracked"]')?.textContent,
    }));
    const bad = errors.length || r.overflow > 0 || r.sections.length;
    if (bad) failures++;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${mode.padEnd(8)} ${String(w).padStart(4)}px  hero=${r.sym} (${r.src})  floorRows=${r.floorRows} tracked=${r.tracked}${r.overflow > 0 ? '  overflow=' + r.overflow : ''}${r.sections.length ? '  missing=' + r.sections : ''}${errors.length ? '\n     errors: ' + errors.join(' | ') : ''}`);
    await page.screenshot({ path: join(SHOTS, `${mode}-${w}.png`), fullPage: true });
    await ctx.close();
  }
}
await browser.close(); server.close();
if (failures) { console.error(failures + ' failing runs'); process.exit(1); }
