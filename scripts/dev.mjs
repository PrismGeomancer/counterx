// CounterX · local mode: serve the site and keep the floor fresh, without GitHub.
//   npm start            → http://localhost:8080, floor snapshot now and every 10 min (Helius key from .env if present)
//   PORT=3000 npm start  → another port
//   EVERY_MIN=5 npm start → refresh more often
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = +(process.env.PORT || 8080), EVERY = +(process.env.EVERY_MIN || 10) * 60e3;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.mp4': 'video/mp4' };
const PUBLIC = /^(index|coin|coins|new|404)\.html$|^(css|js|fonts|img|data)\//;   // never serve .env, scripts, node_modules

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
  if (!p) p = 'index.html';
  if (!PUBLIC.test(p) || p.includes('..')) { res.writeHead(404); return res.end('not found'); }
  try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`[dev] CounterX on http://localhost:${PORT}  ·  floor refresh every ${EVERY / 60e3} min`));

// runs are chained, not overlapped: the next one starts EVERY after the last one started (or right away if it ran longer)
function floor() {
  const t0 = Date.now();
  const child = spawn(process.execPath, [join(root, 'scripts/floor.mjs')], { cwd: root, env: { POOL_PAGES: '2', CURVE_PAGES: '1', ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  child.on('exit', () => {
    const took = Date.now() - t0, wait = Math.max(30e3, EVERY - took);
    console.log(`[dev] floor refreshed in ${Math.round(took / 1000)} s, next in ${(wait / 60e3).toFixed(1)} min`);
    setTimeout(floor, wait);
  });
}
floor();
