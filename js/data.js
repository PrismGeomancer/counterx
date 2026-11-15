// CounterX · data without a server. Same surface as the old backend client:
//   api('stats') · api('pooltape?limit=40') · api('pooltape/stats') · api('fills?limit=10') · api('book?side=all&sort=size')
//   stream.on('stats' | 'pooltape' | 'fill' | 'book' | 'hello', fn)
// Sources (Phase 1):
//   SOL/USD ............ Jupiter price API, then DexScreener; null if both fail (the chip hides)
//   floor + bands ...... data/floor.json, data/bands.json, data/coins.json from the scheduled snapshot (Phase 2); missing = empty states
//   book + fills ....... the CounterX program (Phase 3); while config.programId is empty these reject with { closed: true }
import { CFG, url } from './core.js';
import { saneSupply } from './floor.js';

const WSOL = 'So11111111111111111111111111111111111111112';
const listeners = new Map();
export const stream = {
  on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt).delete(fn); },
  emit(evt, data) { for (const fn of listeners.get(evt) || []) { try { fn(data); } catch (e) { console.error('[counterx]', evt, e); } } },
};

async function getJson(u, opts) { const r = await fetch(u, opts); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

// ---------- SOL / USD ----------
let solUsd = null, solAt = 0;
export async function solPrice() {
  if (solUsd != null && Date.now() - solAt < 60000) return solUsd;
  try {
    const j = await getJson('https://lite-api.jup.ag/price/v3?ids=' + WSOL);
    const v = j && j[WSOL] && +j[WSOL].usdPrice; if (v > 0) { solUsd = v; solAt = Date.now(); return v; }
  } catch { }
  try {
    const rows = await getJson('https://api.dexscreener.com/tokens/v1/solana/' + WSOL);
    const usdc = (rows || []).filter((p) => p.baseToken?.address === WSOL && /USDC|USDT/.test(p.quoteToken?.symbol || '')).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const v = usdc && +usdc.priceUsd; if (v > 0) { solUsd = v; solAt = Date.now(); return v; }
  } catch { }
  return null;
}

// ---------- the scheduled floor snapshot (Phase 2 writes these files; until then they 404 and we return null) ----------
const snap = {};
async function snapshot(name) {
  const hit = snap[name]; if (hit && Date.now() - hit.t < 10000) return hit.v;
  let v = null; try { v = await getJson(url('data/' + name + '.json'), { cache: 'no-cache' }); } catch { }
  snap[name] = { t: Date.now(), v }; return v;
}

// older snapshots may still list pools with a fake market cap: drop them, and everything measured against their supply
function clean(j) {
  if (!j || j._clean) return j;
  const ok = new Set((j.pools || []).filter((p) => saneSupply(p.supply)).map((p) => p.mint));
  j.pools = (j.pools || []).filter((p) => ok.has(p.mint)); j.rows = (j.rows || []).filter((r) => ok.has(r.mint));
  if (j.whatIf) j.whatIf.offers = (j.whatIf.offers || []).filter((o) => ok.has(o.mint));
  j._clean = true; return j;
}

// ---------- program (Phase 3) ----------
const closed = () => Promise.reject(Object.assign(new Error('program not configured'), { closed: true }));

async function stats() {
  const [px, coins, bands] = await Promise.all([solPrice(), snapshot('coins'), snapshot('bands')]);
  return {
    t: Date.now(), solUsd: px,
    coinsBy: coins ? { tracked: coins.tracked ?? null, active1h: coins.active1h ?? null } : null,
    impact: bands && bands.hero ? { median5: bands.hero.median } : null,
    desk: null,   // offers, bids, volume: read from the program once it exists
    fees: null,   // burned $COUNTERX: read from chain once the mint and program exist
    floorAt: (coins && coins.generatedAt) || (bands && bands.generatedAt) || null,
  };
}

export async function api(path) {
  const [p, qs] = path.split('?'), q = new URLSearchParams(qs || '');
  switch (p) {
    case 'stats': return stats();
    case 'floor': return clean(await snapshot('floor'));   // the whole snapshot: rows (sells + buys), hot pools, what-if rows
    case 'pooltape': { const j = clean(await snapshot('floor')); if (!j) return { rows: [], generatedAt: null }; return { rows: (j.rows || []).filter((r) => r.kind === 'sell').slice(0, +(q.get('limit') || 40)), generatedAt: j.generatedAt, since: j.since }; }
    case 'pooltape/stats': return snapshot('bands');
    case 'fills': case 'book': return closed();   // Phase 3: decode the CounterX program's accounts here
    default: throw new Error('unknown api ' + path);
  }
}

// ---------- polling stands in for the old websocket: refresh stats while the tab is visible ----------
let timer = 0;
export function start() {
  const tick = () => stats().then((s) => stream.emit('stats', s)).catch(() => { });
  stats().then((s) => stream.emit('hello', { stats: s })).catch(() => { });
  const loop = () => { clearInterval(timer); if (!document.hidden) timer = setInterval(tick, CFG.pollMs || 15000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); loop(); });
  loop();
}
