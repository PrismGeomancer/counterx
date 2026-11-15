// A page that stays open picks up a newer floor snapshot by itself: the floor tape and "Over the counter" both gain the new trade.
// The "newer snapshot" is served by the test (a copy of the real one plus one extra trade); nothing on disk changes.
//   node test/refresh.mjs     (site on http://127.0.0.1:8091, e.g. `PORT=8091 npm start`, or set BASE)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const B = process.env.BASE || 'http://127.0.0.1:8091/';
const real = JSON.parse(readFileSync(new URL('../data/floor.json', import.meta.url), 'utf8'));
let fails = 0; const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

// the newer snapshot: same data, generated a minute later, plus one big sell that happened just now
const top = real.rows.find((r) => r.kind === 'sell' && r.market === 'pool') || real.rows.find((r) => r.kind === 'sell');
const SIG = 'TESTSIG' + 'x'.repeat(80);
// the test controls the snapshot's age: both versions look freshly generated, the newer one a minute later
const gen = Date.now() - 2 * 60000;
const older = { ...real, generatedAt: gen };
const newer = { ...real, generatedAt: gen + 60000, rows: [{ ...top, sig: SIG, t: Date.now(), move: -61.5, pct: 3.3, sol: 20, fair: 50000, lost: 49980 }, ...real.rows] };

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errs = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|geckoterminal/.test(m.text())) errs.push(m.text()); });
let serveNewer = false;
// no outside traffic: the live layer would add real trades mid-test and GeckoTerminal would see needless requests
await p.route((u) => !u.href.startsWith(B), (r) => r.abort());
await p.route(/\/data\/floor\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(serveNewer ? newer : older) }));
await p.goto(B + 'index.html?poll=2000'); await p.waitForTimeout(3000);

const read = () => p.evaluate((sig) => ({
  floor: [...document.querySelectorAll('#pooltape tbody tr')].map((t) => t.innerText.replace(/\s+/g, ' ')),
  floorLink: [...document.querySelectorAll('#pooltape tbody a.tx')].map((a) => a.href).some((h) => h.includes(sig.slice(0, 20))),
  otc: [...document.querySelectorAll('#dealtape tbody a.tx')].map((a) => a.href).some((h) => h.includes(sig.slice(0, 20))),
  note: document.querySelector('[data-k=floorAt]')?.innerText,
  count: document.querySelector('[data-k=big24]')?.innerText,
}), SIG);
const before = await read();
check('before: floor and counter lists are filled', before.floor.length >= 5 && before.floor[0].length > 10, before.floor[0]?.slice(0, 50));
check('before: the test trade is not there yet', !before.floorLink && !before.otc);
check('before: strip says how often it renews', /renewed about every 10 min/.test(before.note || ''), before.note);

serveNewer = true;
await p.waitForTimeout(15000);   // the page polls every 2 s but caches the snapshot for 10 s; new rows are drawn in batches every 2 s
const after = await read();
check('after: the new trade is first on the floor', after.floorLink);
check('after: the new trade is in over the counter', after.otc);
check('after: the 24 h count went up', +after.count.replace(/,/g, '') === +before.count.replace(/,/g, '') + 1, `${before.count} → ${after.count}`);
check('no console errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (fails) { console.error(fails + ' failing checks'); process.exit(1); }
